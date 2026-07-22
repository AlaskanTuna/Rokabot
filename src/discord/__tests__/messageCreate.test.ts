import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  info: vi.fn(),
  isChannelBusy: vi.fn(() => false),
  tryConsume: vi.fn(() => true)
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../agent/channelMonitor.js', () => ({ isMonitored: () => false, markActive: vi.fn() }))
vi.mock('../../agent/memoryExtractor.js', () => ({ maybeExtractFromBuffer: vi.fn() }))
vi.mock('../../agent/passiveBuffer.js', () => ({ addMessage: vi.fn() }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: mocks.info, warn: vi.fn() }
}))
vi.mock('../concurrency.js', () => ({ isChannelBusy: mocks.isChannelBusy, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../emojiReactor.js', () => ({ shouldReact: () => null }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../messageBuilder.js', () => ({ buildRokaMessage: (content: string) => content }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  splitResponse: (response: string) => [response]
}))
vi.mock('../events/gachaMention.js', () => ({ handleGachaMention: vi.fn() }))

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
  referencedMessage
}: {
  mentioned?: boolean
  content?: string
  referencedMessage?: object
} = {}) {
  const reply = vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) })

  return {
    message: {
      author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
      channelId: 'channel-1',
      content,
      mentions: { has: vi.fn(() => mentioned) },
      components: [],
      reference: referencedMessage ? { messageId: 'message-0' } : null,
      guild: null,
      guildId: 'guild-1',
      member: { displayName: 'Alice' },
      attachments: [],
      channel: {
        sendTyping: vi.fn().mockResolvedValue(undefined),
        messages: { fetch: vi.fn().mockResolvedValue(referencedMessage) }
      },
      reply
    },
    reply
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
    mocks.isChannelBusy.mockReturnValue(false)
    mocks.tryConsume.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', metrics })
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
  ])('records one completed %s turn with an enriched summary', async (trigger, { message }) => {
    await createMessageHandler({ user: { id: 'bot-1' } } as never, createRateLimiter() as never)(message as never)

    expect(mocks.recordResponseEvent).toHaveBeenCalledOnce()
    expect(mocks.recordResponseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        channelId: 'channel-1',
        userId: 'user-1',
        trigger,
        tone: 'playful',
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
