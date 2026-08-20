import { Collection } from 'discord.js'
import type { Interaction, Message } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../../utils/rateLimiter.js'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn()
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../agent/channelMonitor.js', () => ({ isMonitored: () => false, markActive: vi.fn() }))
vi.mock('../../agent/memoryExtractor.js', () => ({ maybeExtractFromBuffer: vi.fn() }))
vi.mock('../../agent/passiveBuffer.js', () => ({ addMessage: vi.fn(), getMessages: () => [] }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
vi.mock('../emojiReactor.js', () => ({ shouldReact: () => null }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../messageBuilder.js', () => ({ buildRokaMessage: (content: string) => content }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
  splitResponse: (response: string) => [response]
}))
vi.mock('../events/gachaMention.js', () => ({ handleGachaMention: vi.fn() }))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => vi.fn() }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => vi.fn() }))
vi.mock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { __resetTokenBudgetForTest, chargeTokens } from '../../agent/tokenBudget.js'
import { config } from '../../config.js'
import { attachmentOptionName } from '../attachments.js'
import { createInteractionHandler } from '../events/interactionCreate.js'
import { createMessageHandler } from '../events/messageCreate.js'

const BUDGET = config.gemini.maxTokensPerMinute
const FOUR_MB = 4 * 1024 * 1024

// The real limiter rather than a stand-in. It has no I/O, and a hand-rolled double of it drifted the moment
// `reserveCalls` arrived (#167) — every handler test failed at once on a method the double did not know
// about. Limits are set far above anything these tests reach, which is what the double was for.
const rateLimiter = () => new RateLimiter({ rpm: 1_000, rpd: 100_000 })

const upload = (size: number) => ({ url: 'https://cdn.example/i.png', contentType: 'image/png', size })

function createInteraction(channelId: string, attachments: ReturnType<typeof upload>[]) {
  const reply = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)
  return {
    interaction: {
      isChatInputCommand: () => true,
      commandName: 'ask',
      options: {
        getString: vi.fn((name: string) => (name === 'question' ? 'hello' : null)),
        getAttachment: vi.fn(
          (name: string) => attachments.find((_, index) => attachmentOptionName(index) === name) ?? null
        )
      },
      channelId,
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: null,
      reply,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
      deleteReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn()
    } as unknown as Interaction,
    editReply
  }
}

function createMessage(channelId: string, attachments: ReturnType<typeof upload>[]) {
  const reply = vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) })
  return {
    message: {
      author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
      channelId,
      content: '<@bot-1> hello',
      mentions: { has: vi.fn(() => true) },
      components: [],
      reference: null,
      guild: null,
      guildId: null,
      member: null,
      attachments,
      embeds: [],
      poll: null,
      stickers: new Collection(),
      messageSnapshots: new Collection(),
      channel: { sendTyping: vi.fn().mockResolvedValue(undefined), messages: { fetch: vi.fn() } },
      reply
    } as unknown as Message,
    reply
  }
}

const client = { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never

describe('per-minute token budget, at the handlers', () => {
  beforeEach(() => {
    __resetTokenBudgetForTest()
    vi.clearAllMocks()
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: []
    })
  })

  // Spent outright rather than nudged one token under the ceiling: the bucket drains against the real clock
  // at 3.3 tokens a millisecond, so a margin that thin is refilled by the handler's own awaits before the
  // gate is reached. The boundary itself is pinned in tokenBudget.test.ts, under fake timers.
  //
  // The gap this closes: byteBudget would admit every one of these. An 89-page PDF is 35 KB of a 32 MB byte
  // budget and 49,841 tokens of a 250,000 TPM one, so bytes cannot see the thing that runs out first.
  it('refuses a /ask attachment turn once the minute is spent', async () => {
    chargeTokens(BUDGET)
    const { interaction } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it('says so in character rather than dropping the /ask turn silently', async () => {
    chargeTokens(BUDGET)
    const { interaction, editReply } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(editReply).toHaveBeenCalledWith({ content: 'busy' })
  })

  it('refuses a mention attachment turn once the minute is spent', async () => {
    chargeTokens(BUDGET)
    const { message } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it('says so in character rather than dropping the mention turn silently', async () => {
    chargeTokens(BUDGET)
    const { message, reply } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(reply).toHaveBeenCalledWith('busy')
  })

  // The control for all four above: a gate that simply always refused would pass every one of them.
  it('admits an attachment turn while the minute can still fund one', async () => {
    const { interaction } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(mocks.generateResponse).toHaveBeenCalled()
  })

  // Text turns are deliberately never gated. rpm 15 already bounds them to about a third of the minute, and
  // gating them would refuse ordinary conversation to protect a quota that conversation does not threaten.
  it('admits a text-only /ask turn even with the minute fully spent', async () => {
    chargeTokens(BUDGET)
    const { interaction } = createInteraction('channel-1', [])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(mocks.generateResponse).toHaveBeenCalled()
  })

  it('admits a text-only mention turn even with the minute fully spent', async () => {
    chargeTokens(BUDGET)
    const { message } = createMessage('channel-2', [])
    await createMessageHandler(client, rateLimiter())(message)
    expect(mocks.generateResponse).toHaveBeenCalled()
  })

  // Refusing after the typing indicator has started means the interval is inherited and has to be cleared,
  // or she is left visibly typing in that channel forever.
  it('stops the typing indicator when it refuses a mention turn', async () => {
    vi.useFakeTimers()
    try {
      chargeTokens(BUDGET)
      const { message } = createMessage('channel-2', [upload(FOUR_MB)])
      const sendTyping = (message.channel as unknown as { sendTyping: ReturnType<typeof vi.fn> }).sendTyping
      await createMessageHandler(client, rateLimiter())(message)

      const atRefusal = sendTyping.mock.calls.length
      await vi.advanceTimersByTimeAsync(30_000)
      expect(sendTyping.mock.calls.length).toBe(atRefusal)
    } finally {
      vi.useRealTimers()
    }
  })
})

// A turn reserves `maxLlmCalls` slots before it runs and gives back what it never used. Both directions are
// pinned: without the release the reservation is simply a lowered `rpm`, and without the reservation the
// peak is unbounded (#167).
describe('per-turn call reservation, at the handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: [],
      modelCalls: 1
    })
  })

  it('hands back the slots a turn did not spend', async () => {
    const limiter = new RateLimiter({ rpm: 20, rpd: 500 })
    const { interaction } = createInteraction('channel-1', [])

    await createInteractionHandler(limiter)(interaction)

    expect(limiter.remainingRpm).toBe(19)
  })

  // The early peek, which nothing exercised: `concurrency.test.ts` drives the decline path through a double,
  // so the real `canAdmitCalls` could have returned true unconditionally and no test would have noticed.
  it('declines before the model when the minute cannot fund a whole turn', async () => {
    const limiter = new RateLimiter({ rpm: 4, rpd: 500 })
    limiter.reserveCalls(4)
    const { interaction } = createInteraction('channel-1', [])

    await createInteractionHandler(limiter)(interaction)

    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  // The discriminating one, and the only test that can tell reserving the ceiling from reserving a single
  // slot. Net of release the two are identical — reserve 4 and give back 3 leaves the same one slot as
  // reserving 1 — so every after-the-fact assertion passes either way. What differs is the window WHILE the
  // turn is in flight, which is exactly the peak this exists to bound.
  it('holds the whole ceiling while the turn is still running', async () => {
    const limiter = new RateLimiter({ rpm: 20, rpd: 500 })
    let finishTurn: () => void = () => {}
    mocks.generateResponse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishTurn = () => resolve({ text: 'hi', tone: 'neutral', metrics: {}, toolsUsed: [], modelCalls: 1 })
        })
    )
    const { interaction } = createInteraction('channel-1', [])

    const turn = createInteractionHandler(limiter)(interaction)
    await vi.waitFor(() => expect(limiter.remainingRpm).toBe(16))

    finishTurn()
    await turn
  })

  it('keeps every slot when the turn spends the whole ceiling', async () => {
    const limiter = new RateLimiter({ rpm: 20, rpd: 500 })
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: [],
      modelCalls: 4
    })
    const { interaction } = createInteraction('channel-1', [])

    await createInteractionHandler(limiter)(interaction)

    expect(limiter.remainingRpm).toBe(16)
  })

  it('hands back the slots on the mention path too', async () => {
    const limiter = new RateLimiter({ rpm: 20, rpd: 500 })
    const { message } = createMessage('channel-2', [])

    await createMessageHandler(client, limiter)(message)

    expect(limiter.remainingRpm).toBe(19)
  })
})
