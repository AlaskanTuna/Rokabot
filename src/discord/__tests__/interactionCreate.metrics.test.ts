import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  gameCommandHandler: vi.fn(),
  toolCommandHandler: vi.fn(),
  handleStatsCommand: vi.fn(),
  splitResponse: vi.fn((response: string) => [response]),
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
}))

// The URL guard resolves a hostname before connecting, so without this a linked-image test fails closed on
// the test host not existing — and passes for the wrong reason wherever a rejection is what it asserts.
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: mocks.error, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../concurrency.js', () => ({ isChannelBusy: () => false, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => mocks.gameCommandHandler }))
vi.mock('../events/stats/statsCommand.js', () => ({ handleStatsCommand: mocks.handleStatsCommand }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => mocks.toolCommandHandler }))

import { recordSearchCitations } from '../../agent/searchCitations.js'
import { config } from '../../config.js'
import { createInteractionHandler } from '../events/interactionCreate.js'

const metrics = {
  generateMs: 1,
  llmMs: 0,
  retryLatencyMs: 0,
  retries: 0,
  outcome: 'ok',
  kind: 'ok',
  tokensInEst: 20,
  tokensOutEst: 10,
  failureMarker: 'SAFETY'
}

describe('interaction handler metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', toolsUsed: [], metrics })
  })

  it('records one completed slash turn with an enriched summary', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: { getString: vi.fn((name: string) => (name === 'question' ? 'hello' : null)), getAttachment: vi.fn() },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
        trigger: 'slash',
        tone: 'playful',
        toolsUsed: [],
        ...metrics,
        e2eMs: expect.any(Number)
      })
    )
    expect(mocks.info).toHaveBeenCalledOnce()
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'slash',
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
        ...metrics
      }),
      'Response completed'
    )
    expect(JSON.stringify(interaction.editReply.mock.calls[0][0].components[0].toJSON())).not.toContain('-# 🌸')
  })

  function askWith(attachments: Array<{ url: string; contentType: string | null } | null>, imageUrl?: string) {
    return {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: {
        getString: vi.fn((name: string) =>
          name === 'question' ? 'what is this?' : name === 'attachment_url' ? (imageUrl ?? null) : null
        ),
        // Answers by name the way Discord does, so a slot the handler asks for under the wrong name reads
        // as absent rather than silently returning the first attachment.
        getAttachment: vi.fn((name: string) => {
          const match = /^attachment_(\d+)$/.exec(name)
          return match ? (attachments[Number(match[1]) - 1] ?? null) : null
        })
      },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
  }

  const PNG = { url: 'https://cdn.test/a.png', contentType: 'image/png' }
  const PDF_DOC = { url: 'https://cdn.test/notes.pdf', contentType: 'application/pdf' }
  const UNREADABLE = { url: 'https://cdn.test/a.zip', contentType: 'application/zip' }
  const rateLimiterStub = () => ({ tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 })

  it('forwards every supported image slot, not just the first', async () => {
    const interaction = askWith([
      PNG,
      { ...PNG, url: 'https://cdn.test/b.png' },
      { ...PNG, url: 'https://cdn.test/c.png' }
    ])

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toHaveLength(3)
  })

  it('drops an unsupported attachment instead of forwarding it', async () => {
    const interaction = askWith([UNREADABLE])

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toBeUndefined()
  })

  // Silence reads as hallucination: she answered "what is this?" as though nothing were attached.
  it('nudges in character when an attachment cannot be opened', async () => {
    const interaction = askWith([UNREADABLE])

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.splitResponse.mock.calls[0][0]).toContain("I couldn't open that file~")
  })

  // Documents ride the existing attachment slots, so accepting the type is the whole of the change on this
  // surface — no new option, and the nudge must stop firing for a file she can now actually read.
  it('accepts a PDF on /ask rather than nudging about it', async () => {
    const interaction = askWith([PDF_DOC])

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toEqual([
      { url: 'https://cdn.test/notes.pdf', contentType: 'application/pdf' }
    ])
    expect(mocks.splitResponse.mock.calls[0][0]).toBe('Hello~')
  })

  it('adds no nudge when every attachment was supported', async () => {
    const interaction = askWith([PNG])

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.splitResponse.mock.calls[0][0]).toBe('Hello~')
  })

  function headOk(contentType: string, url = 'https://cdn.test/linked.png') {
    return vi.fn(async () => ({
      ok: true,
      url,
      headers: { get: (name: string) => (name === 'content-type' ? contentType : null) }
    }))
  }

  // A typed link needs no embed and no unfurl, which is the whole reason it works on a slash command where
  // the mention path's timing problem does not apply.
  it('sends a linked image to the vision slots', async () => {
    vi.stubGlobal('fetch', headOk('image/png'))
    const interaction = askWith([], 'https://cdn.test/linked.png')

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toEqual([
      { url: 'https://cdn.test/linked.png', contentType: 'image/png' }
    ])
    vi.unstubAllGlobals()
  })

  it('nudges rather than staying silent when the link is not an image', async () => {
    vi.stubGlobal('fetch', headOk('text/html'))
    const interaction = askWith([], 'https://example.test/an-article')

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.splitResponse.mock.calls[0][0]).toContain("I couldn't open that file~")
    vi.unstubAllGlobals()
  })

  // One visual budget per turn whatever the source: three uploads already fill it, so the link gets no slot
  // and is never even requested.
  it('does not let a link exceed the ceiling three uploads already filled', async () => {
    const fetchMock = headOk('image/png')
    vi.stubGlobal('fetch', fetchMock)
    const interaction = askWith([PNG, PNG, PNG], 'https://cdn.test/linked.png')

    await createInteractionHandler(rateLimiterStub() as never)(interaction as never)

    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toHaveLength(3)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  // The doubles answer by option name now, so a handler reading the retired 'message' would get null rather
  // than the question. This still pins the name itself, which no other assertion here depends on.
  it('reads the renamed question option rather than the retired message one', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: { getString: vi.fn((name: string) => (name === 'question' ? 'hello' : null)), getAttachment: vi.fn() },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(interaction.options.getString).toHaveBeenCalledWith('question', true)
  })

  // roka.js is mocked here but searchCitations.js is not, so this exercises the real sink the handler opens
  // around the turn — the seam that carries searched sources from inside ADK out to the reply.
  it('cites the sources a searched slash turn was built on', async () => {
    mocks.generateResponse.mockImplementation(async () => {
      recordSearchCitations([{ title: 'Crunchyroll News', url: 'https://www.crunchyroll.com/news/a' }])
      return { text: 'She premiered in January~', tone: 'playful', toolsUsed: ['search_web'], metrics }
    })
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: {
        getString: vi.fn((name: string) => (name === 'question' ? 'when did frieren air?' : null)),
        getAttachment: vi.fn()
      },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(JSON.stringify(interaction.editReply.mock.calls[0][0].components[0].toJSON())).toContain('crunchyroll.com')
  })

  it('renders a tool footer on the initial slash reply only', async () => {
    mocks.generateResponse.mockResolvedValueOnce({
      text: 'The dice have spoken~',
      tone: 'playful',
      toolsUsed: ['roll_dice'],
      metrics
    })
    mocks.splitResponse.mockReturnValueOnce(['The dice have spoken~', 'A second thought~'])
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: {
        getString: vi.fn((name: string) => (name === 'question' ? 'roll a die' : null)),
        getAttachment: vi.fn()
      },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(JSON.stringify(interaction.editReply.mock.calls[0][0].components[0].toJSON())).toContain(
      '-# 🌸 cast the fortune dice'
    )
    expect(JSON.stringify(interaction.followUp.mock.calls[0][0].components[0].toJSON())).not.toContain('-# 🌸')
    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['roll_dice'] }))
  })

  it('derives a per-channel DM tenant when there is no guild', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: { getString: vi.fn((name: string) => (name === 'question' ? 'hello' : null)), getAttachment: vi.fn() },
      channelId: 'channel-1',
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: null,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(mocks.generateResponse).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'dm:channel-1' }))
    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'dm:channel-1' }))
  })

  it("keeps the follow-up chunk count under Discord's 5-follow-up cap at the max response length", async () => {
    const { splitResponse: realSplitResponse } =
      await vi.importActual<typeof import('../responses.js')>('../responses.js')
    const text = 'a'.repeat(config.gemini.maxOutputTokens)

    expect(realSplitResponse(text).length).toBeLessThan(5)
  })

  it('dispatches stats interactions to the stats command handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'stats'
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await createInteractionHandler(rateLimiter as never)(interaction as never)

    expect(mocks.handleStatsCommand).toHaveBeenCalledWith(interaction)
    expect(mocks.gameCommandHandler).not.toHaveBeenCalled()
    expect(mocks.toolCommandHandler).not.toHaveBeenCalled()
  })

  it('contains stats handler failures and sends an error reply', async () => {
    mocks.handleStatsCommand.mockRejectedValueOnce(new Error('stats database unavailable'))
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'stats',
      channelId: 'channel-1',
      deferred: false,
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

    await expect(createInteractionHandler(rateLimiter as never)(interaction as never)).resolves.toBeUndefined()

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1' }),
      'Error handling /stats command'
    )
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'error' }))
  })
})
