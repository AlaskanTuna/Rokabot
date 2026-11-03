import { Collection, MessageFlags } from 'discord.js'
import type { Interaction, Message } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../../utils/rateLimiter.js'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  isIgnorableDiscordError: vi.fn(() => false),
  buildRokaMessage: vi.fn((content: string) => content),
  splitResponse: vi.fn((response: string) => [response])
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../agent/memory/channelMonitor.js', () => ({ isMonitored: () => false, markActive: vi.fn() }))
vi.mock('../../agent/memory/passiveBuffer.js', () => ({ addMessage: vi.fn(), getMessages: () => [] }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
vi.mock('../emojiReactor.js', () => ({ shouldReact: () => null }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: mocks.isIgnorableDiscordError }))
vi.mock('../messageBuilder.js', () => ({ buildRokaMessage: mocks.buildRokaMessage }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
  getRandomOversizedAttachment: () => 'that file was too big~',
  getRandomSkippedAttachments: () => 'Roka looked at the first files~',
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gachaMention.js', () => ({ handleGachaMention: vi.fn() }))
vi.mock('../commands/games/router.js', () => ({ createGameCommandHandler: () => vi.fn() }))
vi.mock('../commands/tools/router.js', () => ({ createToolCommandHandler: () => vi.fn() }))
vi.mock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { __resetTokenBudgetForTest, chargeTokens } from '../../agent/llm/tokenBudget.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { inFlightBytes, release, tryReserve } from '../byteBudget.js'
import { isChannelBusy } from '../concurrency.js'
import { createInteractionHandler } from '../events/interactionCreate.js'
import { createMessageHandler } from '../events/messageCreate.js'

const BUDGET_BYTES = config.discord.maxInFlightAttachmentBytes
const BUDGET_TOKENS = config.gemini.maxTokensPerMinute
const CEILING = config.gemini.maxLlmCalls

// The real limiter rather than a stand-in. It has no I/O, and a hand-rolled double of it drifted the moment
// `reserveCalls` arrived (#167) — every handler test failed at once on a method the double did not know
// about. Limits are set far above anything these tests reach, which is what the double was for.
const rateLimiter = () => new RateLimiter({ rpm: 1_000, rpd: 100_000 })

const upload = (size: number) => ({ url: 'https://cdn.example/i.png', contentType: 'image/png', size })

function createInteraction(
  channelId: string,
  opts: { attachments?: Array<{ url: string; contentType: string; size: number }> } = {}
) {
  const seenEditReplyThis: unknown[] = []
  const seenFollowUpThis: unknown[] = []
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'ask',
    options: {
      getString: vi.fn((name: string) => (name === 'question' ? 'hello' : null)),
      getAttachment: vi.fn((name: string) => {
        const slot = /^attachment_(\d+)$/.exec(name)
        return (slot && opts.attachments?.[Number(slot[1]) - 1]) ?? null
      })
    },
    channelId,
    member: null,
    user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
    guildId: null,
    deferred: false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockImplementation(async () => {
      interaction.deferred = true
    }),
    editReply: vi.fn(async function (this: unknown) {
      seenEditReplyThis.push(this)
    }),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn(async function (this: unknown) {
      seenFollowUpThis.push(this)
    })
  }
  return {
    interaction: interaction as unknown as Interaction,
    editReply: interaction.editReply,
    deferReply: interaction.deferReply,
    followUp: interaction.followUp,
    reply: interaction.reply,
    deleteReply: interaction.deleteReply,
    seenEditReplyThis,
    seenFollowUpThis
  }
}

function createMessage(
  channelId: string,
  opts: { withSend?: boolean; replyImpl?: (payload: unknown) => Promise<unknown>; attachments?: unknown[] } = {}
) {
  const seenReplyThis: unknown[] = []
  const seenSendThis: unknown[] = []
  const sent = { delete: vi.fn().mockResolvedValue(undefined) }
  const message = {
    author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
    channelId,
    content: '<@bot-1> hello',
    mentions: { has: vi.fn(() => true) },
    components: [],
    reference: null,
    guild: null,
    guildId: null,
    member: null,
    attachments: opts.attachments ?? [],
    embeds: [],
    poll: null,
    stickers: new Collection(),
    messageSnapshots: new Collection(),
    channel: {
      sendTyping: vi.fn().mockResolvedValue(undefined),
      messages: { fetch: vi.fn() },
      ...(opts.withSend
        ? {
            send: vi.fn(async function (this: unknown) {
              seenSendThis.push(this)
            })
          }
        : {})
    },
    reply: vi.fn(async function (this: unknown, _payload: unknown) {
      seenReplyThis.push(this)
      if (opts.replyImpl) return opts.replyImpl(_payload)
      return sent
    })
  }
  return {
    message: message as unknown as Message,
    reply: message.reply,
    sendTyping: (message.channel as { sendTyping: ReturnType<typeof vi.fn> }).sendTyping,
    seenReplyThis,
    seenSendThis,
    channel: message.channel
  }
}

const client = { user: { id: 'bot-1', displayName: 'Roka', username: 'roka' } } as never

const turnEnding = { droppedAttachments: 0, truncatedAttachments: 0, refusedAttachments: 0, watchOutcome: null }

describe('shared turn pipeline, at the handlers', () => {
  beforeEach(() => {
    __resetTokenBudgetForTest()
    release(inFlightBytes())
    vi.clearAllMocks()
    mocks.isIgnorableDiscordError.mockReturnValue(false)
    mocks.buildRokaMessage.mockImplementation((content: string) => content)
    mocks.splitResponse.mockImplementation((response: string) => [response])
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: [],
      modelCalls: 1,
      ...turnEnding
    })
  })

  it('keeps the receiver on message.reply', async () => {
    const { message, reply, seenReplyThis } = createMessage('channel-this-1')

    await createMessageHandler(client, rateLimiter())(message)

    expect(reply).toHaveBeenCalledTimes(1)
    expect(seenReplyThis).toHaveLength(1)
    expect(seenReplyThis[0]).toBe(message)
  })

  it('keeps the receiver on channel.send for follow-up chunks', async () => {
    mocks.splitResponse.mockReturnValue(['one', 'two'])
    const { message, reply, seenReplyThis, seenSendThis, channel } = createMessage('channel-this-2', { withSend: true })

    await createMessageHandler(client, rateLimiter())(message)

    expect(reply).toHaveBeenCalledTimes(1)
    expect(seenReplyThis[0]).toBe(message)
    expect(seenSendThis).toHaveLength(1)
    expect(seenSendThis[0]).toBe(channel)
  })

  it('keeps the receiver on editReply and followUp', async () => {
    mocks.splitResponse.mockReturnValue(['one', 'two'])
    const { interaction, editReply, followUp, seenEditReplyThis, seenFollowUpThis } =
      createInteraction('channel-this-3')

    await createInteractionHandler(rateLimiter())(interaction)

    expect(editReply).toHaveBeenCalledTimes(1)
    expect(seenEditReplyThis[0]).toBe(interaction)
    expect(followUp).toHaveBeenCalledTimes(1)
    expect(seenFollowUpThis[0]).toBe(interaction)
  })

  // Delivery throws after the model returned, so the turn owes the truth rather than the ceiling, and the
  // metrics row must not be written for a reply that never arrived.
  it('releases the used calls and records nothing when delivery fails after the model returned', async () => {
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: [],
      modelCalls: 2,
      ...turnEnding
    })
    const replyImpl = () => Promise.reject(new Error('send down'))
    const { message } = createMessage('channel-truth-1', { replyImpl })
    const limiter = rateLimiter()
    const beforeRpm = limiter.remainingRpm

    await createMessageHandler(client, limiter)(message)

    expect(mocks.recordResponseEvent).not.toHaveBeenCalled()
    expect(limiter.remainingRpm).toBe(beforeRpm - CEILING + 2)
    expect(inFlightBytes()).toBe(0)
    expect(isChannelBusy('channel-truth-1')).toBe(false)
  })

  // The first reply itself is rejected as ignorable: no error reply goes out, and the lock, the bytes and
  // the slots all come back.
  it('sends no error reply and releases everything when the first reply is ignorably rejected', async () => {
    mocks.isIgnorableDiscordError.mockReturnValue(true)
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: [],
      modelCalls: 2,
      ...turnEnding
    })
    const { interaction, editReply } = createInteraction('channel-ignor-1')
    editReply.mockRejectedValueOnce(Object.assign(new Error('Unknown Message'), { code: 10008 }))
    const limiter = rateLimiter()
    const beforeRpm = limiter.remainingRpm

    await createInteractionHandler(limiter)(interaction)

    expect(editReply).toHaveBeenCalledTimes(1)
    expect(mocks.recordResponseEvent).not.toHaveBeenCalled()
    expect(limiter.remainingRpm).toBe(beforeRpm - CEILING + 2)
    expect(inFlightBytes()).toBe(0)
    expect(isChannelBusy('channel-ignor-1')).toBe(false)
  })

  // A channel with no `send` skips the later chunks instead of throwing, and the turn still counts.
  it('still records metrics for several chunks when the channel cannot take them', async () => {
    mocks.splitResponse.mockReturnValue(['one', 'two', 'three'])
    const { message, reply } = createMessage('channel-nosend-1')

    await createMessageHandler(client, rateLimiter())(message)

    expect(reply).toHaveBeenCalledTimes(1)
    expect(mocks.buildRokaMessage).toHaveBeenCalledTimes(1)
    expect(mocks.recordResponseEvent).toHaveBeenCalledTimes(1)
  })

  // A decline inside the budget step happens after the typing indicator has started, so the interval has to
  // be cleared or she is left visibly typing in that channel forever.
  it('stops the typing indicator when the token budget declines a mention turn', async () => {
    vi.useFakeTimers()
    try {
      chargeTokens(BUDGET_TOKENS)
      const { message, reply, sendTyping } = createMessage('channel-decline-1', { attachments: [upload(1024)] })
      await createMessageHandler(client, rateLimiter())(message)

      expect(mocks.generateResponse).not.toHaveBeenCalled()
      expect(reply).toHaveBeenCalledWith('busy')
      const atRefusal = sendTyping.mock.calls.length
      await vi.advanceTimersByTimeAsync(30_000)
      expect(sendTyping.mock.calls.length).toBe(atRefusal)
    } finally {
      vi.useRealTimers()
    }
  })

  // The busy reply itself throws after a byte refusal: the slots already came back with `release(0)`
  // inside the budget step, and the handler holds no reservation for its own release to return again.
  it('returns the slots once when the busy reply throws after a byte refusal', async () => {
    tryReserve(BUDGET_BYTES - 1)
    const replyImpl = () => Promise.reject(new Error('send down'))
    const { message } = createMessage('channel-slot-1', { replyImpl, attachments: [upload(4 * 1024 * 1024)] })
    const limiter = rateLimiter()
    const beforeRpm = limiter.remainingRpm
    const beforeRpd = limiter.remainingRpd

    await createMessageHandler(client, limiter)(message)

    expect(mocks.generateResponse).not.toHaveBeenCalled()
    expect(limiter.remainingRpm).toBe(beforeRpm)
    expect(limiter.remainingRpd).toBe(beforeRpd)
  })

  // Three full-size images exceed the 10 MB per-turn ceiling, so the third is skipped: the model must see
  // only the kept two. Passing the input list instead would hand it all three.
  it('passes only the kept attachments to the model on /ask', async () => {
    const full = (index: number) => ({
      url: `https://cdn.example/k${index}.png`,
      contentType: 'image/png',
      size: 4 * 1024 * 1024
    })
    const { interaction } = createInteraction('channel-kept-1', { attachments: [full(1), full(2), full(3)] })

    await createInteractionHandler(rateLimiter())(interaction)

    expect(mocks.generateResponse).toHaveBeenCalledTimes(1)
    expect(mocks.generateResponse.mock.calls[0][0].imageAttachments).toHaveLength(2)
  })

  // Same turn as above: one file is skipped, so the count reaching the model must be 1 rather than 0.
  it('passes the real skipped count to the model on /ask', async () => {
    const full = (index: number) => ({
      url: `https://cdn.example/s${index}.png`,
      contentType: 'image/png',
      size: 4 * 1024 * 1024
    })
    const { interaction } = createInteraction('channel-skipped-1', { attachments: [full(1), full(2), full(3)] })

    await createInteractionHandler(rateLimiter())(interaction)

    expect(mocks.generateResponse).toHaveBeenCalledTimes(1)
    expect(mocks.generateResponse.mock.calls[0][0].skippedAttachments).toBe(1)
  })

  // The turn throws before defer, so the interaction was never acknowledged: the error must go through
  // reply, since editReply there throws InteractionNotReplied and the user sees nothing.
  it('sends a pre-defer failure through reply on /ask', async () => {
    const { interaction, deferReply, editReply, reply } = createInteraction('channel-fail-0')
    deferReply.mockRejectedValueOnce(new Error('defer down'))

    await createInteractionHandler(rateLimiter())(interaction)

    expect(reply).toHaveBeenCalledWith({ content: 'error', flags: MessageFlags.Ephemeral })
    expect(editReply).not.toHaveBeenCalled()
  })

  // The model throws after defer, so the error reply must go through editReply: a reply on an
  // already-acknowledged interaction is a real Discord rejection, not an in-character answer.
  it('sends a post-defer failure through editReply on /ask', async () => {
    mocks.generateResponse.mockRejectedValueOnce(new Error('model down'))
    const { interaction, editReply, reply } = createInteraction('channel-fail-1')

    await createInteractionHandler(rateLimiter())(interaction)

    expect(editReply).toHaveBeenCalledWith({ content: 'error' })
    expect(reply).not.toHaveBeenCalled()
  })

  // The budget declines after defer, so the busy line goes through sayAfterDefer, whose reply must vanish
  // after 5 seconds like every other in-character decline.
  it('deletes the reply after 5 seconds when a post-defer decline answers on /ask', async () => {
    vi.useFakeTimers()
    try {
      chargeTokens(BUDGET_TOKENS)
      const { interaction, editReply, deleteReply } = createInteraction('channel-vanish-1', {
        attachments: [upload(1024)]
      })

      await createInteractionHandler(rateLimiter())(interaction)

      expect(editReply).toHaveBeenCalledWith({ content: 'busy' })
      expect(deleteReply).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      expect(deleteReply).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // A decline on the message path answers through say, whose reply must vanish after 5 seconds too.
  it('deletes the reply after 5 seconds when a decline answers on the message path', async () => {
    vi.useFakeTimers()
    try {
      chargeTokens(BUDGET_TOKENS)
      const { message, reply } = createMessage('channel-vanish-2', { attachments: [upload(1024)] })

      await createMessageHandler(client, rateLimiter())(message)

      expect(reply).toHaveBeenCalledWith('busy')
      const sent = await reply.mock.results[0].value
      expect(sent.delete).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      expect(sent.delete).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // Each path names itself in the failure log, so a swapped or edited label shows up here.
  it('logs the right label on each path when the turn fails', async () => {
    mocks.generateResponse.mockRejectedValue(new Error('model down'))
    const { message } = createMessage('channel-label-1')
    await createMessageHandler(client, rateLimiter())(message)
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.anything(), 'Error handling message')
    vi.mocked(logger.error).mockClear()

    const { interaction } = createInteraction('channel-label-2')
    await createInteractionHandler(rateLimiter())(interaction)
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.anything(), 'Error handling /ask command')
  })
})
