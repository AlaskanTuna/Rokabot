import { BaseLlm, LlmAgent, LogLevel, Runner, setLogLevel } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { WindowedSessionService } from '../roka.js'

// A contract test against ADK itself, driving a real Runner. ADK appends the incoming message to the session
// verbatim and nothing removes it, so attachment bytes are re-sent as history on every later turn until they
// age out of the window. This pins both halves: that the resend is real, and that the strip stops it.
//
// It deliberately does NOT use __setTestRunTurnFactory. That seam replaces the call to runner.runAsync, so
// appendEvent never runs beneath it — a retention test written against it observes nothing either way.

setLogLevel(LogLevel.WARN)

const APP_NAME = 'attachment-retention-contract'
const PNG_BASE64 = Buffer.from('\x89PNG\r\n\x1a\n fake pixels').toString('base64')

/**
 * Snapshots each request as it is generated rather than keeping the object. The strip mutates parts in
 * place, and a captured request holds live references to those same parts — so a kept object would appear
 * to have never carried the attachment, and the turn that really did see it would read as though it had not.
 */
class CapturingLlm extends BaseLlm {
  public turns: Array<{ inlineMimes: string[]; texts: string[] }> = []

  constructor() {
    super({ model: 'capturing-retention-model' })
  }

  async *generateContentAsync(llmRequest: LlmRequest): AsyncGenerator<LlmResponse, void> {
    const parts = (llmRequest.contents ?? []).flatMap((content) => content.parts ?? [])
    this.turns.push({
      inlineMimes: parts.flatMap((part) => (part.inlineData?.mimeType ? [part.inlineData.mimeType] : [])),
      texts: parts.flatMap((part) => (part.text ? [part.text] : []))
    })
    yield { content: { role: 'model', parts: [{ text: 'Mm~' }] } }
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('CapturingLlm does not support live connections')
  }
}

// Built fresh per use: the strip replaces entries in the parts array it is given, so a shared fixture would
// arrive already stripped at the second test that used it.
const attachmentTurn = (mimeType = 'image/png') => [
  { inlineData: { data: PNG_BASE64, mimeType } },
  { text: '[Alice]: what is this?' }
]
const textTurn = () => [{ text: '[Alice]: and what about now?' }]

function newConversation(channel: string) {
  const model = new CapturingLlm()
  const sessionService = new WindowedSessionService(40)
  const agent = new LlmAgent({
    name: 'retention_contract',
    model,
    instruction: '',
    tools: [],
    disallowTransferToParent: true,
    disallowTransferToPeers: true
  })
  const runner = new Runner({ appName: APP_NAME, agent, sessionService })
  const ready = sessionService.createSession({ appName: APP_NAME, userId: channel, sessionId: channel })

  const send = async (parts: object[]) => {
    await ready
    for await (const _event of runner.runAsync({
      userId: channel,
      sessionId: channel,
      newMessage: { role: 'user', parts },
      runConfig: { maxLlmCalls: 2 }
    })) {
      // drained so the turn completes
    }
  }

  return { model, sessionService, send, strip: () => sessionService.stripAttachmentBytes(channel) }
}

describe('attachment bytes in session history', () => {
  // The control. Without it the fix is unfalsifiable: if ADK never re-sent attachments, the stripped case
  // would pass while proving nothing, and the bug it fixes would never have existed.
  it('re-sends an attachment on the next turn when nothing strips it', async () => {
    const c = newConversation('control')
    await c.send(attachmentTurn())
    await c.send(textTurn())

    expect(c.model.turns[1].inlineMimes).toEqual(['image/png'])
  })

  it('does not re-send the attachment on the next turn once stripped', async () => {
    const c = newConversation('stripped')
    await c.send(attachmentTurn())
    c.strip()
    await c.send(textTurn())

    expect(c.model.turns[1].inlineMimes).toEqual([])
  })

  // Stripping after the turn must not blind the turn itself.
  it('still shows the model the attachment on the turn it arrived', async () => {
    const c = newConversation('same-turn')
    await c.send(attachmentTurn())
    c.strip()

    expect(c.model.turns[0].inlineMimes).toEqual(['image/png'])
  })

  it('leaves a marker in history so she still knows an image was there', async () => {
    const c = newConversation('marker')
    await c.send(attachmentTurn())
    c.strip()
    await c.send(textTurn())

    expect(c.model.turns[1].texts).toContain('(an image)')
  })

  it('keeps the text that accompanied the attachment', async () => {
    const c = newConversation('keeps-text')
    await c.send(attachmentTurn())
    c.strip()
    await c.send(textTurn())

    expect(c.model.turns[1].texts).toContain('[Alice]: what is this?')
  })

  it('names a document as a document rather than an image', async () => {
    const c = newConversation('document')
    await c.send(attachmentTurn('application/pdf'))
    c.strip()
    await c.send(textTurn())

    expect(c.model.turns[1].texts).toContain('(a document)')
  })

  it('names an audio clip as an audio clip', async () => {
    const c = newConversation('audio')
    await c.send(attachmentTurn('audio/ogg'))
    c.strip()
    await c.send(textTurn())

    expect(c.model.turns[1].texts).toContain('(an audio clip)')
  })

  it('reports how many parts it replaced', async () => {
    const c = newConversation('counted')
    await c.send(attachmentTurn())

    expect(c.strip()).toBe(1)
  })

  it('reports nothing stripped for a turn that carried no attachment', async () => {
    const c = newConversation('text-only')
    await c.send(textTurn())

    expect(c.strip()).toBe(0)
  })

  // A retry re-sends the same message, so ADK appends it once per attempt and one upload leaves several
  // copies in history. Stripping once at the end of the turn has to reach all of them.
  it('leaves a copy per attempt when a turn is retried', async () => {
    const c = newConversation('retried')
    await c.send(attachmentTurn())
    await c.send(attachmentTurn())
    await c.send(textTurn())

    expect(c.model.turns[2].inlineMimes).toEqual(['image/png', 'image/png'])
  })

  it('strips every copy a retried turn left behind', async () => {
    const c = newConversation('retried-strip')
    await c.send(attachmentTurn())
    await c.send(attachmentTurn())

    expect(c.strip()).toBe(2)
  })

  it('forgets a destroyed session rather than holding its events', async () => {
    const c = newConversation('destroyed')
    await c.send(attachmentTurn())
    await c.sessionService.deleteSession({ appName: APP_NAME, userId: 'destroyed', sessionId: 'destroyed' })

    expect(c.strip()).toBe(0)
  })
})
