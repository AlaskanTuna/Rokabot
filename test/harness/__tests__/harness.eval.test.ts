import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'
import { assertClaim } from '../../../src/agent/memory/memoryClaims.js'
import { FACTS_UNTRUSTED_DATA_LABEL } from '../../../src/agent/promptSafety.js'
import {
  __resetTestRunTurnFactory,
  __setTestRunTurnFactory,
  destroySession,
  generateResponse
} from '../../../src/agent/roka.js'
import { config } from '../../../src/config.js'
import { createInteractionHandler } from '../../../src/discord/events/interactionCreate.js'
import { createMessageHandler } from '../../../src/discord/events/messageCreate.js'
import { buildRokaMessage } from '../../../src/discord/messageBuilder.js'
import { getDb } from '../../../src/storage/database.js'
import { RateLimiter } from '../../../src/utils/rateLimiter.js'
import { createCaptureSink } from '../captureSink.js'
import { makeClient, makeGuild, makeInteraction, makeMessage } from '../discordDoubles.js'
import { renderPayload } from '../renderPayload.js'
import { loadTranscript, runTranscript } from '../run.js'

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  runnerRequests: [] as unknown[]
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

vi.mock('@google/adk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/adk')>()

  class CapturingRunner extends actual.Runner {
    override runAsync(request: Parameters<InstanceType<typeof actual.Runner>['runAsync']>[0]) {
      mocks.runnerRequests.push(request)
      return (async function* () {
        yield actual.createEvent({
          author: 'roka',
          content: { role: 'model', parts: [{ text: 'Captured fake model reply~' }] }
        })
      })()
    }
  }

  return { ...actual, Runner: CapturingRunner }
})

const transcript = resolve('test/harness/transcripts/multi-guild.jsonl')
const memoryUserId = 'mio-memory'
const memoryFactKey = 'likes'

function responseText(record: { kind: string; payload: unknown }): string {
  return renderPayload({ ...record, channelId: null, ts: 0 })
}

function payloadText(payload: unknown): string {
  const contents: string[] = []

  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if ('content' in value && typeof value.content === 'string') contents.push(value.content)
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(collect)
      else collect(child)
    }
  }

  collect(JSON.parse(JSON.stringify(payload)))
  return contents.join('\n')
}

function capturedRequestText(request: unknown): string {
  const candidate = request as { newMessage?: { parts?: Array<{ text?: string }> } }
  return candidate.newMessage?.parts.map((part) => part.text ?? '').join('') ?? ''
}

function capturedSystemPrompt(request: unknown): string {
  const candidate = request as { stateDelta?: { _systemPrompt?: string } }
  return candidate.stateDelta?._systemPrompt ?? ''
}

function scriptedResponse(text: string = 'Harness model reply~'): void {
  __setTestRunTurnFactory(() => async () => ({ text, hasText: true, hasFunctionCall: false }))
}

afterEach(async () => {
  __resetTestRunTurnFactory()
  await destroySession('harness-retry-channel')
  await Promise.all([
    destroySession('busy-channel'),
    destroySession('terminal-channel'),
    destroySession('chunk-channel'),
    destroySession('name-channel'),
    destroySession('reaction-channel'),
    destroySession('context-channel'),
    destroySession('memory-garden'),
    destroySession('memory-library')
  ])
  getDb()
    .prepare('DELETE FROM memory_claim WHERE guild_id IN (?, ?) AND subject_user_id = ? AND predicate = ?')
    .run('guild-garden', 'guild-library', memoryUserId, memoryFactKey)
  mocks.generateContent.mockClear()
  mocks.runnerRequests.length = 0
  vi.restoreAllMocks()
})

describe('harness self-tests', () => {
  it('runs a fake-mode transcript through real handlers and captures Discord-facing payloads', async () => {
    const report = await runTranscript(transcript)

    expect(report.turns).toHaveLength(5)
    expect(report.turns[0].rendered).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TYPING'),
        expect.stringContaining('Harness reply 1: <@roka> Tea is ready!')
      ])
    )
    expect(report.turns[1].rendered).toEqual(
      expect.arrayContaining([expect.stringContaining('Harness reply 2: What do you think?')])
    )
    expect(report.turns[2].rendered).toEqual(
      expect.arrayContaining([expect.stringContaining('EDITREPLY'), expect.stringContaining('Harness reply 3:')])
    )
    expect(report.output).toContain('handler_total')
    expect(report.output).toContain('discord_overhead')
    expect(mocks.generateContent).not.toHaveBeenCalled()
  })

  it('records self-consistent handler and fake-model timing fields', async () => {
    const { turns } = await runTranscript(transcript)

    for (const { timing } of turns) {
      expect(timing.handlerTotal).toBeGreaterThanOrEqual(timing.llm)
      expect(timing.discordOverhead).toBe(timing.handlerTotal - timing.llm)
      expect(timing.timeToFirstSend).not.toBeNull()
      expect(timing.sendSpan).not.toBeNull()
      expect(timing.sendSpan).toBeGreaterThanOrEqual(0)
    }
  })

  it('routes scripted transient outcomes through the real retry orchestration', async () => {
    const gemini = config.gemini as { retryBackoffBaseMs: number; retryBackoffCapMs: number }
    const originalBackoffBaseMs = gemini.retryBackoffBaseMs
    const originalBackoffCapMs = gemini.retryBackoffCapMs
    const attempts = vi.fn()
    gemini.retryBackoffBaseMs = 0
    gemini.retryBackoffCapMs = 1
    __setTestRunTurnFactory(() => async (attempt) => {
      attempts(attempt)
      return attempt === 0
        ? { errorCode: '429', errorMessage: 'temporary quota', hasText: false, hasFunctionCall: false }
        : { text: 'Recovered through the retry loop~', hasText: true, hasFunctionCall: false }
    })

    try {
      await expect(
        generateResponse({
          channelId: 'harness-retry-channel',
          guildId: 'harness-guild',
          userMessage: 'Please retry this scripted turn.',
          displayName: 'Mio',
          username: 'mio',
          userId: 'mio'
        })
      ).resolves.toMatchObject({ text: 'Recovered through the retry loop~' })
      expect(attempts).toHaveBeenCalledTimes(2)
      expect(attempts).toHaveBeenNthCalledWith(1, 0)
      expect(attempts).toHaveBeenNthCalledWith(2, 1)
    } finally {
      gemini.retryBackoffBaseMs = originalBackoffBaseMs
      gemini.retryBackoffCapMs = originalBackoffCapMs
    }
  })

  it('keeps fake-mode environment bootstrap isolated from the production key and database', () => {
    expect(process.env.GEMINI_API_KEY).toBe('harness-fake-sentinel')
    expect(process.env.ROKABOT_DB_PATH).toBe(':memory:')
  })

  it('renders a captured Components V2 response with text, tone, and expression data', () => {
    const sink = createCaptureSink(() => 0)
    const record = sink.record({ kind: 'reply', payload: buildRokaMessage('Tea is ready~', 'playful') })
    const rendered = renderPayload(record)

    expect(rendered).toContain('Tea is ready~')
    expect(rendered).toContain('Tone Accent: playful')
    expect(rendered).toContain('Expression Thumbnail: https://')
  })

  it('intercepts a second in-flight message with a busy reply without a second token or model call', async () => {
    const sink = createCaptureSink()
    const client = makeClient()
    const limiter = new RateLimiter({ rpm: 2, rpd: 2 })
    const consume = vi.spyOn(limiter, 'tryConsume')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let resolveFirstTurn!: () => void
    const firstTurnStarted = new Promise<void>((resolve) => {
      __setTestRunTurnFactory(
        () => async () =>
          new Promise((resolveTurn) => {
            resolveFirstTurn = () => resolveTurn({ text: 'First response~', hasText: true, hasFunctionCall: false })
            resolve()
          })
      )
    })
    const handler = createMessageHandler(client as never, limiter)
    const first = makeMessage({
      author: { id: 'mio', username: 'mio', displayName: 'Mio' },
      mentions: ['roka'],
      channelId: 'busy-channel',
      content: '<@roka> First question',
      sink
    })
    const second = makeMessage({
      author: { id: 'ren', username: 'ren', displayName: 'Ren' },
      mentions: ['roka'],
      channelId: 'busy-channel',
      content: '<@roka> Second question',
      sink
    })

    const firstHandling = handler(first as never)
    await firstTurnStarted
    await handler(second as never)

    expect(consume).toHaveBeenCalledTimes(1)
    expect(sink.all().filter((record) => record.kind === 'reply')).toEqual([
      expect.objectContaining({ payload: expect.stringContaining("I'm still thinking") })
    ])
    expect(mocks.runnerRequests).toHaveLength(0)

    resolveFirstTurn()
    await firstHandling
  })

  it('captures an in-character rate-limit decline before the model is invoked', async () => {
    const sink = createCaptureSink()
    const limiter = new RateLimiter({ rpm: 1, rpd: 0 })
    const handler = createMessageHandler(makeClient() as never, limiter)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await handler(
      makeMessage({
        mentions: ['roka'],
        content: '<@roka> Can we chat?',
        channelId: 'rate-limit-channel',
        sink
      }) as never
    )

    expect(sink.all()).toEqual([
      expect.objectContaining({ kind: 'reply', payload: expect.stringContaining('ちょっと待ってね') })
    ])
    expect(mocks.runnerRequests).toHaveLength(0)
  })

  it('sends the TRD terminal-failure deflection through the Discord reply layer', async () => {
    const sink = createCaptureSink()
    __setTestRunTurnFactory(() => async () => ({
      errorCode: '400',
      errorMessage: 'INVALID_ARGUMENT',
      hasText: false,
      hasFunctionCall: false
    }))

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(
      makeMessage({
        mentions: ['roka'],
        content: '<@roka> Please answer.',
        channelId: 'terminal-channel',
        sink
      }) as never
    )

    const reply = sink.all().find((record) => record.kind === 'reply')
    expect(reply).toBeDefined()
    expect(responseText(reply!)).toContain("Eep, something went wrong on my side. Let's try again later~")
  })

  it('captures the passive emoji reaction while still routing an addressed message to the model', async () => {
    const sink = createCaptureSink()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    scriptedResponse('Good morning to you too~')

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(
      makeMessage({
        mentions: ['roka'],
        guild: makeGuild(),
        guildId: 'reaction-guild',
        content: '<@roka> Good morning!',
        channelId: 'reaction-channel',
        sink
      }) as never
    )

    expect(sink.all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'react', payload: '👋' }),
        expect.objectContaining({ kind: 'reply' })
      ])
    )
  })

  it('intercepts a gacha mention before the model and returns the companion payload', async () => {
    const sink = createCaptureSink()

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(
      makeMessage({
        author: { id: 'gacha-user', username: 'gacha', displayName: 'Gacha User' },
        mentions: ['roka'],
        content: 'gacha',
        channelId: 'gacha-channel',
        sink
      }) as never
    )

    expect(sink.all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reply',
          payload: expect.objectContaining({ content: expect.stringContaining('companion spirit') })
        })
      ])
    )
    expect(mocks.runnerRequests).toHaveLength(0)
  })

  it('splits a scripted response over Discord limits into an edit and ordered follow-ups', async () => {
    const sink = createCaptureSink()
    const longResponse = `${'A'.repeat(1_999)} ${'B'.repeat(1_999)} ${'C'.repeat(50)}`
    scriptedResponse(longResponse)

    await createInteractionHandler(new RateLimiter({ rpm: 1, rpd: 1 }))(
      makeInteraction({
        channelId: 'chunk-channel',
        guildId: 'chunk-guild',
        stringOptions: { message: 'Please send the long answer.' },
        sink
      }) as never
    )

    const sends = sink.all().filter((record) => record.kind === 'editReply' || record.kind === 'followUp')
    expect(sends.map((record) => record.kind)).toEqual(['editReply', 'followUp', 'followUp'])
    const chunks = sends.map((record) => payloadText(record.payload))
    expect(chunks).toEqual([
      'A'.repeat(1_500),
      `${'A'.repeat(499)} ${'B'.repeat(1_000)}`,
      `${'B'.repeat(999)} ${'C'.repeat(50)}`
    ])
    expect(chunks.join('')).toBe(longResponse)
  })

  it('triggers a name-keyword message without a Discord mention', async () => {
    const sink = createCaptureSink()
    scriptedResponse('You called for me~')

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(makeMessage({ content: 'Roka, could you help?', channelId: 'name-channel', sink }) as never)

    const reply = sink.all().find((record) => record.kind === 'reply')
    expect(reply).toBeDefined()
    expect(responseText(reply!)).toContain('You called for me~')
  })

  it.each([
    ['poll', { poll: { question: 'Which tea?', answers: ['Green', 'Oolong'] } }, 'Poll: Which tea?', '- Oolong'],
    [
      'forwarded snapshot',
      { messageSnapshots: [{ content: 'Forwarded note', components: [{ type: 10, content: 'Snapshot text' }] }] },
      'Forwarded: Forwarded note | Snapshot text',
      'Snapshot text'
    ],
    ['sticker', { stickers: [{ name: 'Happy Roka' }] }, 'sticker: Happy Roka', 'Happy Roka'],
    [
      'embed',
      {
        embeds: [
          { author: { name: 'Archivist' }, title: 'Tea Notes', description: 'Steep for three minutes', fields: [] }
        ]
      },
      'Embed: Author: Archivist | Title: Tea Notes | Steep for three minutes',
      'Tea Notes'
    ],
    [
      'Components V2 container',
      { components: [{ type: 17, components: [{ type: 10, content: 'Container context' }] }] },
      'Container: Container context',
      'Container context'
    ]
  ])(
    'passes replied-to %s context to the captured fake-model request',
    async (_name, referenceSpec, firstFragment, secondFragment) => {
      const sink = createCaptureSink()
      const reference = makeMessage({
        author: { id: 'roka', bot: true, username: 'roka', displayName: 'Roka' },
        content: 'Original Roka message',
        ...referenceSpec
      })
      const message = makeMessage({
        author: { id: 'mio', username: 'mio', displayName: 'Mio' },
        channelId: 'context-channel',
        content: 'Can you explain this?',
        reference: 'reference-message',
        referencedMessages: { 'reference-message': reference },
        sink
      })

      await createMessageHandler(makeClient() as never, new RateLimiter({ rpm: 1, rpd: 1 }))(message as never)

      expect(mocks.runnerRequests).toHaveLength(1)
      const input = capturedRequestText(mocks.runnerRequests[0])
      expect(input).toContain(firstFragment)
      expect(input).toContain(secondFragment)
      expect(sink.all()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'reply' })]))
    }
  )

  it('injects only the current guild claims while replaying the multi-guild transcript', async () => {
    const lines = (await loadTranscript(transcript)).filter((line) => line.userId === memoryUserId)
    const client = makeClient()
    const handler = createMessageHandler(client as never, new RateLimiter({ rpm: 2, rpd: 2 }))
    expect(config.memory.claimsBackend).toBe(true)
    assertClaim({
      guildId: 'guild-garden',
      subjectUserId: memoryUserId,
      predicate: memoryFactKey,
      value: 'jasmine tea',
      sourceKind: 'human'
    })
    assertClaim({
      guildId: 'guild-library',
      subjectUserId: memoryUserId,
      predicate: memoryFactKey,
      value: 'espresso',
      sourceKind: 'human'
    })
    getDb().prepare("DELETE FROM memory_events WHERE kind = 'retrieval'").run()

    for (const line of lines) {
      await handler(
        makeMessage({
          author: { id: line.userId, username: 'mio', displayName: line.displayName },
          mentions: ['roka'],
          channelId: line.channelId,
          guildId: line.guildId,
          guild: makeGuild(),
          member: { displayName: line.displayName },
          content: line.content,
          sink: createCaptureSink()
        }) as never
      )
    }

    expect(lines).toHaveLength(2)
    expect(mocks.runnerRequests).toHaveLength(2)
    expect(capturedSystemPrompt(mocks.runnerRequests[0])).toContain(
      `${FACTS_UNTRUSTED_DATA_LABEL}\n{"facts":[{"person":"Mio","attributes":[{"key":"likes","value":"jasmine tea"}]}]}`
    )
    expect(capturedSystemPrompt(mocks.runnerRequests[0])).not.toContain('espresso')
    expect(capturedSystemPrompt(mocks.runnerRequests[1])).toContain(
      `${FACTS_UNTRUSTED_DATA_LABEL}\n{"facts":[{"person":"Mio","attributes":[{"key":"likes","value":"espresso"}]}]}`
    )
    expect(capturedSystemPrompt(mocks.runnerRequests[1])).not.toContain('jasmine tea')
    expect(
      getDb()
        .prepare(
          "SELECT guild_id, subject_user_id, n_candidates, n_selected FROM memory_events WHERE kind = 'retrieval' ORDER BY id"
        )
        .all()
    ).toEqual([
      { guild_id: 'guild-garden', subject_user_id: memoryUserId, n_candidates: 1, n_selected: 1 },
      { guild_id: 'guild-library', subject_user_id: memoryUserId, n_candidates: 1, n_selected: 1 }
    ])
  })
})
