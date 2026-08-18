import { BaseLlm, InMemorySessionService, LlmAgent, LogLevel, Runner, setLogLevel } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { describe, expect, it } from 'vitest'

// A contract test against ADK itself. Documents are worth shipping only if ADK forwards an arbitrary
// inlineData mimeType untouched — everything on this repo's vision path has been image/jpeg to date, so
// nothing has ever exercised a non-image part. If a version bump starts coercing or dropping it, PDFs would
// silently reach Gemini mislabelled, which is exactly the failure #114 avoided on the embed path.

setLogLevel(LogLevel.WARN)

const APP_NAME = 'adk-inline-mime-contract'
const CHANNEL = 'mime-contract-channel'
// A real minimal PDF header, so the bytes are at least the shape of the thing the mimeType claims.
const PDF_BASE64 = Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n').toString('base64')

/** Captures the request ADK assembles rather than scripting a reply to it. */
class CapturingLlm extends BaseLlm {
  public captured: LlmRequest | null = null

  constructor() {
    super({ model: 'capturing-contract-model' })
  }

  async *generateContentAsync(llmRequest: LlmRequest): AsyncGenerator<LlmResponse, void> {
    this.captured = llmRequest
    yield { content: { role: 'model', parts: [{ text: 'Read it~' }] } }
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('CapturingLlm does not support live connections')
  }
}

async function sendPart(part: object): Promise<LlmRequest | null> {
  const model = new CapturingLlm()
  const agent = new LlmAgent({
    name: 'mime_contract',
    model,
    instruction: '',
    tools: [],
    disallowTransferToParent: true,
    disallowTransferToPeers: true
  })
  const sessionService = new InMemorySessionService()
  const runner = new Runner({ appName: APP_NAME, agent, sessionService })
  await sessionService.createSession({ appName: APP_NAME, userId: CHANNEL, sessionId: CHANNEL })

  for await (const _event of runner.runAsync({
    userId: CHANNEL,
    sessionId: CHANNEL,
    newMessage: { role: 'user', parts: [part, { text: '[Alice]: what does this say?' }] },
    runConfig: { maxLlmCalls: 2 }
  })) {
    // drained so the turn completes
  }
  return model.captured
}

function inlineParts(request: LlmRequest | null) {
  return (request?.contents ?? []).flatMap((content) => content.parts ?? []).filter((part) => part.inlineData)
}

describe('ADK inlineData mimeType passthrough', () => {
  it('forwards a document mimeType to the model untouched', async () => {
    const captured = await sendPart({ inlineData: { data: PDF_BASE64, mimeType: 'application/pdf' } })

    expect(inlineParts(captured).map((part) => part.inlineData?.mimeType)).toEqual(['application/pdf'])
  })

  it('forwards the document bytes without re-encoding them', async () => {
    const captured = await sendPart({ inlineData: { data: PDF_BASE64, mimeType: 'application/pdf' } })

    expect(inlineParts(captured)[0]?.inlineData?.data).toBe(PDF_BASE64)
  })

  it('keeps the text part alongside the document rather than dropping one', async () => {
    const captured = await sendPart({ inlineData: { data: PDF_BASE64, mimeType: 'application/pdf' } })
    const texts = (captured?.contents ?? []).flatMap((content) => content.parts ?? []).filter((part) => part.text)

    expect(texts.some((part) => part.text?.includes('what does this say?'))).toBe(true)
  })
})
