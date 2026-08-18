import { Collection } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  isChannelBusy: vi.fn(() => false),
  isMonitored: vi.fn(() => false),
  tryConsume: vi.fn(() => true),
  maybeExtractFromBuffer: vi.fn(),
  addToPassiveBuffer: vi.fn(),
  getMessages: vi.fn(() => [
    {
      userId: 'user-1',
      displayName: 'Alice',
      username: 'alice',
      content: 'I love tea',
      timestamp: 1
    }
  ]),
  getActiveClaims: vi.fn(() => []),
  shouldExtract: vi.fn(() => ({ extract: true, reason: 'test signal' })),
  enqueueAndSchedule: vi.fn(),
  splitResponse: vi.fn((response: string) => [response])
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../agent/channelMonitor.js', () => ({ isMonitored: mocks.isMonitored, markActive: vi.fn() }))
vi.mock('../../agent/memoryExtractor.js', () => ({ maybeExtractFromBuffer: mocks.maybeExtractFromBuffer }))
vi.mock('../../agent/passiveBuffer.js', () => ({
  addMessage: mocks.addToPassiveBuffer,
  getMessages: mocks.getMessages
}))
vi.mock('../../agent/memory/candidateGate.js', () => ({ shouldExtract: mocks.shouldExtract }))
vi.mock('../../agent/memory/memoryClaims.js', () => ({ getActiveClaims: mocks.getActiveClaims }))
vi.mock('../../agent/memory/scheduler.js', () => ({ enqueueAndSchedule: mocks.enqueueAndSchedule }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: mocks.info, warn: mocks.warn }
}))
vi.mock('../concurrency.js', () => ({ isChannelBusy: mocks.isChannelBusy, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../emojiReactor.js', () => ({ shouldReact: () => null }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gachaMention.js', () => ({ handleGachaMention: vi.fn() }))

import { config } from '../../config.js'
import { NAME_MENTION_REGEX } from '../events/messageCreate.js'
import { createMessageHandler } from '../events/messageCreate.js'

const metrics = {
  generateMs: 1,
  llmMs: 0,
  retryLatencyMs: 0,
  retries: 0,
  outcome: 'ok',
  kind: 'ok',
  tokensInEst: 20,
  tokensOutEst: 10
}

function createMessage({
  mentioned = true,
  content = '<@bot-1> hello',
  guild,
  guildId = 'guild-1',
  referencedMessage,
  attachments = [],
  embeds = [],
  stickers = [] as Array<{ name: string }>,
  poll = null
}: {
  mentioned?: boolean
  content?: string
  guild?: object | null
  guildId?: string | null
  referencedMessage?: object
  attachments?: Array<{ url: string; contentType: string | null }>
  embeds?: object[]
  stickers?: Array<{ name: string }>
  poll?: object | null
} = {}) {
  const reply = vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) })
  const send = vi.fn().mockResolvedValue(undefined)

  return {
    message: {
      author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
      channelId: 'channel-1',
      content,
      mentions: { has: vi.fn(() => mentioned) },
      components: [],
      reference: referencedMessage ? { messageId: 'message-0' } : null,
      guild: guild ?? null,
      guildId,
      member: { displayName: 'Alice' },
      attachments,
      embeds,
      poll,
      stickers: new Collection(stickers.map((sticker, index) => [String(index), sticker])),
      channel: {
        sendTyping: vi.fn().mockResolvedValue(undefined),
        send,
        messages: { fetch: vi.fn().mockResolvedValue(referencedMessage) }
      },
      reply
    },
    reply,
    send
  }
}

function createRateLimiter() {
  return {
    tryConsume: mocks.tryConsume,
    remainingRpm: 14,
    remainingRpd: 499
  }
}

describe('NAME_MENTION_REGEX', () => {
  it.each([
    'roka',
    'Roka',
    'ROKA',
    'hey roka',
    'roka help',
    'what does roka think?',
    'Roka-chan',
    'roka, are you there',
    'hi Roka!',
    'roka.',
    'Maniwa Roka'
  ])('matches "%s"', (input) => {
    expect(NAME_MENTION_REGEX.test(input)).toBe(true)
  })

  it.each(['rokabot', 'rokarokaroka', 'brokar', 'krokas', 'roketto', 'rokku', 'arokala', ''])(
    'rejects "%s"',
    (input) => {
      expect(NAME_MENTION_REGEX.test(input)).toBe(false)
    }
  )

  // Container scanning produces newline-joined strings — confirm the regex still finds the name
  it('matches across newline-joined fragments (mimics component-text join)', () => {
    expect(NAME_MENTION_REGEX.test(['header text', '', 'body: hey Roka', 'footer'].join('\n'))).toBe(true)
  })
})

describe('message handler metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', toolsUsed: [], metrics })
  })

  it('replaces third-party mentions with @display-name and strips only the bot mention', async () => {
    const { message } = createMessage({ content: '<@111> what do you know about <@222>?' })
    message.mentions = {
      has: vi.fn(() => true),
      members: new Map([['222', { displayName: 'Bob' }]]),
      users: new Map([['222', { username: 'bob' }]])
    } as never
    await createMessageHandler({ user: { id: '111' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.generateResponse).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: 'what do you know about @Bob?' })
    )
  })

  it.each([
    ['mention', createMessage()],
    [
      'reply',
      createMessage({
        mentioned: false,
        content: 'hello',
        referencedMessage: {
          author: { id: 'bot-1', displayName: 'Roka' },
          member: null,
          content: 'Previous reply',
          embeds: [],
          poll: null,
          messageSnapshots: new Map(),
          components: [],
          stickers: new Map(),
          attachments: []
        }
      })
    ],
    ['name_keyword', createMessage({ mentioned: false, content: 'Roka, hello' })]
  ])('records one completed %s turn with an enriched summary', async (trigger, { message, reply }) => {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.recordResponseEvent).toHaveBeenCalledOnce()
    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
        trigger,
        tone: 'playful',
        toolsUsed: [],
        ...metrics,
        e2eMs: expect.any(Number)
      })
    )
    const row = mocks.recordResponseEvent.mock.calls[0][0]
    expect(row.e2eMs).toBeGreaterThan(0)
    expect(row.e2eMs).toBeGreaterThanOrEqual(row.generateMs)
    expect(row.generateMs).toBeGreaterThanOrEqual(row.llmMs)
    expect(mocks.info).toHaveBeenCalledOnce()
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ trigger, guildId: 'guild-1', channelId: 'channel-1', userId: 'user-1', ...metrics }),
      'Response completed'
    )
    expect(JSON.stringify(reply.mock.calls[0][0].components[0].toJSON())).not.toContain('-# 🌸')
  })

  it('derives a per-channel DM tenant when there is no guild', async () => {
    const { message } = createMessage({ guildId: null })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.generateResponse).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'dm:channel-1' }))
  })

  it('renders a tool footer on the initial mention reply only', async () => {
    mocks.generateResponse.mockResolvedValueOnce({
      text: 'The dice have spoken~',
      tone: 'playful',
      toolsUsed: ['roll_dice'],
      metrics
    })
    mocks.splitResponse.mockReturnValueOnce(['The dice have spoken~', 'A second thought~'])
    const { message, reply, send } = createMessage()

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0].components[0].toJSON())).toContain('-# 🌸 cast the fortune dice')
    expect(JSON.stringify(send.mock.calls[0][0].components[0].toJSON())).not.toContain('-# 🌸')
    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['roll_dice'] }))
  })

  it.each([
    ['busy', () => mocks.isChannelBusy.mockReturnValue(true)],
    ['rate-limited', () => mocks.tryConsume.mockReturnValue(false)]
  ])('does not record a %s early exit', async (_name, prepare) => {
    prepare()
    const { message } = createMessage()

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.recordResponseEvent).not.toHaveBeenCalled()
  })
})

describe('message handler claims extraction dispatch', () => {
  const guild = { members: { me: { displayName: 'Roka' } } }

  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(true)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', toolsUsed: [], metrics })
  })

  it('keeps the legacy extractor path unchanged when claimsBackend is false', async () => {
    const { message } = createMessage({ guild })

    await createMessageHandler(
      { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
      createRateLimiter() as never
    )(message as never)

    expect(mocks.maybeExtractFromBuffer).toHaveBeenNthCalledWith(1, 'channel-1', 'bot-1', 'guild-1')
    expect(mocks.maybeExtractFromBuffer).toHaveBeenNthCalledWith(2, 'channel-1', 'bot-1', 'guild-1')
    expect(mocks.getMessages).not.toHaveBeenCalled()
    expect(mocks.shouldExtract).not.toHaveBeenCalled()
    expect(mocks.enqueueAndSchedule).not.toHaveBeenCalled()
  })

  it('gates and enqueues a user-ID-keyed snapshot when claimsBackend is true', async () => {
    config.memory.claimsBackend = true
    const { message } = createMessage({ guild })

    await createMessageHandler(
      { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
      createRateLimiter() as never
    )(message as never)

    expect(mocks.maybeExtractFromBuffer).not.toHaveBeenCalled()
    expect(mocks.shouldExtract).toHaveBeenCalledWith(
      [
        {
          userId: 'user-1',
          displayName: 'Alice',
          username: 'alice',
          content: 'I love tea',
          timestamp: 1
        }
      ],
      new Set()
    )
    expect(mocks.enqueueAndSchedule).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messages: [{ userId: 'user-1', displayName: 'Alice', content: 'I love tea' }]
    })
  })

  it('does not let a scheduler failure interrupt the reply', async () => {
    config.memory.claimsBackend = true
    mocks.enqueueAndSchedule.mockImplementationOnce(() => {
      throw new Error('queue unavailable')
    })
    const { message, reply } = createMessage({ guild })

    await expect(
      createMessageHandler(
        { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
        createRateLimiter() as never
      )(message as never)
    ).resolves.toBeUndefined()

    expect(JSON.stringify(reply.mock.calls[0][0].components[0].toJSON())).toContain('Hello~')
    expect(mocks.maybeExtractFromBuffer).not.toHaveBeenCalled()
  })

  it('does not buffer passive messages outside a guild', async () => {
    const { message } = createMessage({ guild: null, guildId: null })

    await createMessageHandler(
      { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
      createRateLimiter() as never
    )(message as never)

    expect(mocks.addToPassiveBuffer).not.toHaveBeenCalled()
  })

  it('does not run the legacy extractor outside a guild', async () => {
    const { message } = createMessage({ guild: null, guildId: null })

    await createMessageHandler(
      { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
      createRateLimiter() as never
    )(message as never)

    expect(mocks.maybeExtractFromBuffer).not.toHaveBeenCalled()
  })

  it('does not dispatch claim extraction outside a guild', async () => {
    config.memory.claimsBackend = true
    const { message } = createMessage({ guild: null, guildId: null })

    await createMessageHandler(
      { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never,
      createRateLimiter() as never
    )(message as never)

    expect(mocks.enqueueAndSchedule).not.toHaveBeenCalled()
  })
})

describe('unsupported attachments on the mention path', () => {
  const PDF = { url: 'https://cdn.test/a.pdf', contentType: 'application/pdf' }
  const PNG = { url: 'https://cdn.test/a.png', contentType: 'image/png' }

  // Filtering an unopenable file out silently makes her answer as though nothing were attached, which
  // reads as hallucination rather than a limitation. /ask says so; this path has to match (#19).
  it('nudges in character when a mentioned message carries a file she cannot open', async () => {
    const { message, reply } = createMessage({ content: '<@bot-1> what is in this?', attachments: [PDF] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("I couldn't open that file~")
  })

  it('stays quiet about attachments it could open', async () => {
    const { message, reply } = createMessage({ content: '<@bot-1> what is in this?', attachments: [PNG] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).not.toContain("I couldn't open that file~")
  })
})

describe("reading what the sender's own message shows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', toolsUsed: [], metrics })
  })

  const LINK_PREVIEW = {
    author: { name: 'The Register' },
    title: 'DeepSeek Harness treats everything as a plug-in',
    description: 'The framework drew 100,000 GitHub stars in days.',
    fields: [],
    footer: null,
    image: { url: 'https://cdn.test/preview.png' },
    thumbnail: null
  }

  async function handle(message: object) {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)
    return mocks.generateResponse.mock.calls[0][0]
  }

  // A link preview puts the substance in its description. The replied-to message has always been read this
  // way; the message actually sent to her was not, so sharing a link and asking about it gave her nothing.
  it('reads the text of an embed on the message it was asked about', async () => {
    const { message } = createMessage({ content: '<@bot-1> what is this?', embeds: [LINK_PREVIEW] })

    expect((await handle(message)).userMessage).toContain('The framework drew 100,000 GitHub stars in days.')
  })

  it('sends an embed image to the vision slots', async () => {
    const { message } = createMessage({ content: '<@bot-1> what is this?', embeds: [LINK_PREVIEW] })

    expect((await handle(message)).imageAttachments).toEqual([
      { url: 'https://cdn.test/preview.png', contentType: 'image/png' }
    ])
  })

  it('never lets embed images exceed the shared attachment ceiling', async () => {
    const embeds = Array.from({ length: 6 }, (_, index) => ({
      ...LINK_PREVIEW,
      image: { url: `https://cdn.test/${index}.png` }
    }))
    const { message } = createMessage({ content: '<@bot-1> what are these?', embeds })

    expect((await handle(message)).imageAttachments).toHaveLength(3)
  })

  // Container text was read only when there was no message text beside it, so she could match her own name
  // inside a container she then never saw the contents of.
  it('keeps container text when the message carries plain text as well', async () => {
    const { message } = createMessage({ content: '<@bot-1> explain this' })
    // discord.js hands components as builders; extractComponentTexts reads them through toJSON().
    message.components = [{ toJSON: () => ({ type: 10, content: 'Deploy finished: 3 services healthy' }) }] as never

    expect((await handle(message)).userMessage).toContain('Deploy finished: 3 services healthy')
  })

  it('names a sticker on the message rather than ignoring it', async () => {
    const { message } = createMessage({ content: '<@bot-1> what is this?', stickers: [{ name: 'roka_wink' }] })

    expect((await handle(message)).userMessage).toContain('roka_wink')
  })

  it('reads a poll on the message', async () => {
    const poll = { question: { text: 'Best girl?' }, answers: new Collection([['1', { text: 'Roka' }]]) }
    const { message } = createMessage({ content: '<@bot-1> vote for me', poll })

    expect((await handle(message)).userMessage).toContain('Best girl?')
  })
})
