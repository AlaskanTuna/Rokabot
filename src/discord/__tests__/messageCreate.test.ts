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
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
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
  poll = null,
  snapshots = [] as object[]
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
  snapshots?: object[]
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
      messageSnapshots: new Collection(snapshots.map((snapshot, index) => [String(index), snapshot])),
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
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
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
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
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
  // This block had no setup of its own and was inheriting whatever the previous describe last left on the
  // mocks, so a test here that set a return value changed the meaning of the ones after it.
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
  })

  // Deliberately not a PDF or an audio clip: both of those are openable on this path now, so using either
  // as the "cannot open" fixture would pass while asserting the opposite of the behaviour.
  const ZIP = { url: 'https://cdn.test/a.zip', contentType: 'application/zip' }
  const PNG = { url: 'https://cdn.test/a.png', contentType: 'image/png' }

  // Filtering an unopenable file out silently makes her answer as though nothing were attached, which
  // reads as hallucination rather than a limitation. /ask says so; this path has to match (#19).
  it('nudges in character when a mentioned message carries a file she cannot open', async () => {
    const { message, reply } = createMessage({ content: '<@bot-1> what is in this?', attachments: [ZIP] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("I couldn't open that file~")
  })

  it('nudges when a supported attachment was too big to fetch', async () => {
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 1,
      truncatedAttachments: 0
    })
    const { message, reply } = createMessage({ content: '<@bot-1> what is in this?', attachments: [PNG] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("I couldn't open that file~")
  })

  it('says she only got through the beginning when a file was truncated', async () => {
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 1
    })
    const { message, reply } = createMessage({ content: '<@bot-1> listen to this', attachments: [PNG] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).toContain('only got through the beginning')
  })

  it('stays quiet about attachments it could open', async () => {
    const { message, reply } = createMessage({ content: '<@bot-1> what is in this?', attachments: [PNG] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).not.toContain("I couldn't open that file~")
  })

  // An audio type Gemini does not accept. Discord will hand over an .m4a as audio/mp4 quite happily, so
  // "starts with audio/" is not the same question as "she can hear it".
  it('nudges about an audio type the model does not accept rather than dropping it', async () => {
    const M4A = { url: 'https://cdn.test/a.m4a', contentType: 'audio/mp4' }
    const { message, reply } = createMessage({ content: '<@bot-1> listen', attachments: [M4A] })

    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(JSON.stringify(reply.mock.calls[0][0])).toContain("I couldn't open that file~")
  })
})

describe('media she can take on the mention path, not only images', () => {
  // Matches the sibling blocks. Without it `mock.calls[0][0]` reads the first call made anywhere earlier in
  // the file, so these assertions pass in isolation and read stale state in the suite.
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
  })

  async function handle(message: object) {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)
    return mocks.generateResponse.mock.calls[0][0]
  }

  it('hears an audio clip attached to the message that mentioned her', async () => {
    const OGG = { url: 'https://cdn.test/a.ogg', contentType: 'audio/ogg', size: 1024 }
    const { message } = createMessage({ content: '<@bot-1> what is this?', attachments: [OGG] })

    expect((await handle(message)).imageAttachments).toEqual([
      { url: 'https://cdn.test/a.ogg', contentType: 'audio/ogg', size: 1024 }
    ])
  })

  // The MP3 an upload actually arrives as. Admitted here under its registered name and renamed for Gemini
  // at the download boundary, not here.
  it('hears an mp3 arriving under its registered audio/mpeg type', async () => {
    const MP3 = { url: 'https://cdn.test/a.mp3', contentType: 'audio/mpeg', size: 2048 }
    const { message } = createMessage({ content: '<@bot-1> what is this?', attachments: [MP3] })

    expect((await handle(message)).imageAttachments).toHaveLength(1)
  })

  // #119 shipped PDFs to /ask only, with the mention path left until messageCreate.ts was clear. It is.
  it('reads a PDF attached to the message that mentioned her', async () => {
    const PDF = { url: 'https://cdn.test/a.pdf', contentType: 'application/pdf', size: 4096 }
    const { message } = createMessage({ content: '<@bot-1> what is this?', attachments: [PDF] })

    expect((await handle(message)).imageAttachments).toHaveLength(1)
  })
})

describe("reading what the sender's own message shows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
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

  // A Tenor link is a gifv embed carrying only embed.video — no title, no description — so describeEmbed
  // returned null and a message whose whole content was a shared GIF arrived as a bare mention (#100).
  const TENOR_GIF = {
    author: null,
    title: null,
    description: null,
    fields: [],
    footer: null,
    image: null,
    thumbnail: null,
    video: { url: 'https://media.tenor.com/abc/roka-wink.mp4', width: 480, height: 270 },
    data: { type: 'gifv' }
  }

  it('names a shared GIF that would otherwise arrive as a bare mention', async () => {
    const { message } = createMessage({ content: '<@bot-1> reaction?', embeds: [TENOR_GIF] })

    expect((await handle(message)).userMessage).toContain('animated GIF')
  })

  it('calls a video embed a video rather than a GIF', async () => {
    const clip = { ...TENOR_GIF, data: { type: 'video' } }
    const { message } = createMessage({ content: '<@bot-1> what happens here?', embeds: [clip] })

    const userMessage = (await handle(message)).userMessage
    expect(userMessage).toContain('video')
    expect(userMessage).not.toContain('animated GIF')
  })

  // The guard that matters. embed.video.url serves an MP4; sharp cannot decode one, and imageProcessor's
  // catch returns the undecoded buffer labelled image/jpeg — so routing it here would send MP4 bytes to
  // Gemini declared as a JPEG, burning a vision slot on garbage. Showing motion needs #100's intake.
  it('never sends an embed video URL to the vision slots', async () => {
    const { message } = createMessage({ content: '<@bot-1> reaction?', embeds: [TENOR_GIF] })

    expect((await handle(message)).imageAttachments).toBeUndefined()
  })

  it('still sends the still frame when a GIF embed carries a thumbnail', async () => {
    const withStill = { ...TENOR_GIF, thumbnail: { url: 'https://media.tenor.com/abc/still.png' } }
    const { message } = createMessage({ content: '<@bot-1> reaction?', embeds: [withStill] })

    const result = await handle(message)
    expect(result.imageAttachments).toEqual([
      { url: 'https://media.tenor.com/abc/still.png', contentType: 'image/png' }
    ])
    expect(result.userMessage).toContain('animated GIF')
  })

  it('reads a poll on the message', async () => {
    const poll = { question: { text: 'Best girl?' }, answers: new Collection([['1', { text: 'Roka' }]]) }
    const { message } = createMessage({ content: '<@bot-1> vote for me', poll })

    expect((await handle(message)).userMessage).toContain('Best girl?')
  })
})

describe('reading a message forwarded straight to her', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
  })

  const PNG = (n: string) => ({ url: `https://cdn.test/${n}.png`, contentType: 'image/png' })

  const FORWARDED_PREVIEW = {
    author: { name: 'The Register' },
    title: 'DeepSeek Harness treats everything as a plug-in',
    description: 'The framework drew 100,000 GitHub stars in days.',
    fields: [],
    footer: { text: 'Posted 2h ago' },
    image: null,
    thumbnail: null
  }

  function snapshot(overrides: object = {}) {
    return { content: '', components: [], embeds: [], attachments: new Collection(), ...overrides }
  }

  async function handle(message: object) {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)
    return mocks.generateResponse.mock.calls[0][0]
  }

  // Forwarding a post and asking about it in the same message is the more natural gesture than replying to
  // it, and it was the one that arrived as a bare mention (#104).
  it('reads the forwarded text on the message it was asked about', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what do you make of this?',
      snapshots: [snapshot({ content: 'Studio Pierrot has postponed the anniversary episodes.' })]
    })

    expect((await handle(message)).userMessage).toContain('Studio Pierrot has postponed the anniversary episodes.')
  })

  // A numeric id, because replaceUserMentions only strips <@\d+> — with a non-numeric one the mention
  // survives, content is never empty, and the bare-ping fallback this pins could never fire.
  it('no longer treats a wordless forward as a bare ping', async () => {
    const { message } = createMessage({
      content: '<@111>',
      snapshots: [snapshot({ content: 'Look at this.' })]
    })

    await createMessageHandler({ user: { id: '111' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.generateResponse.mock.calls[0][0].userMessage).toBe('[Forwarded: Look at this.]')
  })

  // The replied-to path read snapshot embeds as title + description only, which dropped exactly the fields
  // that say where a forwarded link came from. Both paths now read them through describeEmbed.
  it('reads a forwarded link preview past its title and description', async () => {
    const { message } = createMessage({
      content: '<@bot-1> thoughts?',
      snapshots: [snapshot({ embeds: [FORWARDED_PREVIEW] })]
    })

    const userMessage = (await handle(message)).userMessage
    expect(userMessage).toContain('The Register')
    expect(userMessage).toContain('Posted 2h ago')
  })

  it('reads container text inside a forward', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is this?',
      snapshots: [snapshot({ components: [{ toJSON: () => ({ type: 10, content: 'Build 4821 failed' }) }] })]
    })

    expect((await handle(message)).userMessage).toContain('Build 4821 failed')
  })

  it('sends a forwarded image to the vision slots', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is this?',
      snapshots: [snapshot({ attachments: new Collection([['0', PNG('fwd')]]) })]
    })

    expect((await handle(message)).imageAttachments).toEqual([PNG('fwd')])
  })

  // A forward is someone else's post: it draws on the same ceiling as the sender's own files, and only
  // after them. A forwarded gallery must not push out the screenshot they attached themselves.
  it('fills the vision slots from the sender own attachments before the forward', async () => {
    const { message } = createMessage({
      content: '<@bot-1> compare these',
      attachments: [PNG('own-a'), PNG('own-b')],
      snapshots: [
        snapshot({
          attachments: new Collection([
            ['0', PNG('fwd-a')],
            ['1', PNG('fwd-b')]
          ])
        })
      ]
    })

    expect((await handle(message)).imageAttachments).toEqual([PNG('own-a'), PNG('own-b'), PNG('fwd-a')])
  })

  it('never lets forwarded images exceed the shared attachment ceiling', async () => {
    const many = Array.from({ length: 5 }, (_, index) => [String(index), PNG(`fwd-${index}`)] as const)
    const { message } = createMessage({
      content: '<@bot-1> what are these?',
      snapshots: [snapshot({ attachments: new Collection(many) })]
    })

    expect((await handle(message)).imageAttachments).toHaveLength(3)
  })

  // Both paths share one describer now; the replied-to path had no test over its forwarded output before.
  it('still reads a forward that arrives as a reply', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is this?',
      referencedMessage: {
        author: { id: 'user-2', displayName: 'Bob' },
        member: null,
        content: '',
        embeds: [],
        poll: null,
        messageSnapshots: new Collection([['0', snapshot({ content: 'The original post.' })]]),
        components: [],
        stickers: new Collection(),
        attachments: new Collection()
      }
    })

    expect((await handle(message)).userMessage).toContain('The original post.')
  })

  // The marker is the only trace of an image she has no slot for. Keyed to the taken count it vanished with
  // the image, so "what's in the second one?" had nothing behind it and she answered as though the forward
  // carried no picture at all (#107).
  it('still names a forwarded image it had no room to show her', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is in these?',
      attachments: [PNG('own-a'), PNG('own-b'), PNG('own-c')],
      snapshots: [snapshot({ attachments: new Collection([['0', PNG('fwd')]]) })]
    })

    const result = await handle(message)

    expect(result.imageAttachments).toHaveLength(3)
    expect(result.userMessage).toContain('forwarded image(s)')
  })

  it('says how many forwarded images it could not show her', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is in these?',
      attachments: [PNG('own-a'), PNG('own-b'), PNG('own-c')],
      snapshots: [
        snapshot({
          attachments: new Collection([
            ['0', PNG('fwd-a')],
            ['1', PNG('fwd-b')]
          ])
        })
      ]
    })

    expect((await handle(message)).userMessage).toContain('2 not shown')
  })

  it('does not qualify the marker when every forwarded image fits', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is this?',
      snapshots: [snapshot({ attachments: new Collection([['0', PNG('fwd')]]) })]
    })

    expect((await handle(message)).userMessage).toContain('(forwarded image(s))')
  })

  // Unsupported files are not images she is missing — they are files nothing could have shown her, and the
  // reply-side nudge already covers them. Counting them here would invent images that do not exist.
  it('does not count an unopenable forwarded file as an image it could not show', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is this?',
      snapshots: [
        snapshot({
          attachments: new Collection([['0', { url: 'https://cdn.test/a.pdf', contentType: 'application/pdf' }]])
        })
      ]
    })

    expect((await handle(message)).userMessage).not.toContain('forwarded image(s)')
  })
})

describe('naming a replied-to image she cannot see', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.memory.claimsBackend = false
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.isMonitored.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'Hello~',
      tone: 'playful',
      toolsUsed: [],
      metrics,
      droppedAttachments: 0,
      truncatedAttachments: 0
    })
  })

  const PNG = (n: string) => ({ url: `https://cdn.test/${n}.png`, contentType: 'image/png' })

  function repliedTo(attachments: object[], authorId = 'user-2') {
    return {
      author: { id: authorId, displayName: 'Bob' },
      member: null,
      content: 'have a look at this',
      embeds: [],
      poll: null,
      messageSnapshots: new Collection(),
      components: [],
      stickers: new Collection(),
      attachments: new Collection(attachments.map((a, index) => [String(index), a]))
    }
  }

  async function handle(message: object) {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)
    return mocks.generateResponse.mock.calls[0][0]
  }

  // The defect this block exists for (#109): the marker keyed off raw attachment count with no type filter,
  // so replying to a PDF asserted an image was attached. She is not merely uninformed there, she is
  // misinformed, and the plausible completion is a description of an image that does not exist.
  it('does not claim an image when the replied-to message carries only an unopenable file', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is in this?',
      referencedMessage: repliedTo([{ url: 'https://cdn.test/a.pdf', contentType: 'application/pdf' }])
    })

    expect((await handle(message)).userMessage).not.toContain('attached image(s)')
  })

  it('still names a replied-to image when one fits', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is in this?',
      referencedMessage: repliedTo([PNG('ref')])
    })

    const result = await handle(message)

    expect(result.imageAttachments).toHaveLength(1)
    expect(result.userMessage).toContain('(attached image(s))')
  })

  // Mirror of #107 on this path: with the sender's own slots full nothing is taken, and a marker keyed to
  // the taken count would vanish in exactly the case where it carried information.
  it('says how many replied-to images it had no room to show her', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what is in these?',
      attachments: [PNG('own-a'), PNG('own-b'), PNG('own-c')],
      referencedMessage: repliedTo([PNG('ref-a'), PNG('ref-b')])
    })

    const result = await handle(message)

    expect(result.imageAttachments).toHaveLength(3)
    expect(result.userMessage).toContain('(attached image(s), 2 not shown)')
  })

  // Her own expression thumbnails are skipped deliberately to save tokens, so nothing is taken from a reply
  // to herself. Saying "attached image(s)" flat there is the same false assertion in a different dress.
  it('names her own skipped thumbnail as unseen rather than claiming she can see it', async () => {
    const { message } = createMessage({
      content: '<@bot-1> what was that?',
      referencedMessage: repliedTo([PNG('roka-sprite')], 'bot-1')
    })

    const result = await handle(message)

    // The handler passes undefined rather than an empty array when nothing was taken (messageCreate.ts:415).
    expect(result.imageAttachments).toBeUndefined()
    expect(result.userMessage).toContain('(attached image(s), 1 not shown)')
  })
})
