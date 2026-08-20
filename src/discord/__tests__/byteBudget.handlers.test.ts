import { Collection } from 'discord.js'
import type { Interaction, Message } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RateLimiter } from '../../utils/rateLimiter.js'

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

import { config } from '../../config.js'
import { MAX_ATTACHMENTS, attachmentOptionName } from '../attachments.js'
import { inFlightBytes, release, tryReserve } from '../byteBudget.js'
import { createInteractionHandler } from '../events/interactionCreate.js'
import { createMessageHandler } from '../events/messageCreate.js'

const BUDGET = config.discord.maxInFlightAttachmentBytes
const FOUR_MB = 4 * 1024 * 1024

const rateLimiter = () =>
  ({ tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }) as unknown as RateLimiter

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

describe('global in-flight byte budget, at the handlers', () => {
  beforeEach(() => {
    release(inFlightBytes())
    vi.clearAllMocks()
    mocks.generateResponse.mockResolvedValue({
      text: 'hi',
      tone: 'neutral',
      metrics: {},
      toolsUsed: []
    })
  })

  it('refuses a /ask turn that would push in-flight bytes past the budget', async () => {
    tryReserve(BUDGET - 1)
    const { interaction } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it('says so in character rather than dropping the /ask turn silently', async () => {
    tryReserve(BUDGET - 1)
    const { interaction, editReply } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(editReply).toHaveBeenCalledWith({ content: 'busy' })
  })

  it('refuses a mention turn that would push in-flight bytes past the budget', async () => {
    tryReserve(BUDGET - 1)
    const { message } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it('says so in character rather than dropping the mention turn silently', async () => {
    tryReserve(BUDGET - 1)
    const { message, reply } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(reply).toHaveBeenCalledWith('busy')
  })

  it('leaves the budget at zero after a successful turn', async () => {
    const { interaction } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(inFlightBytes()).toBe(0)
  })

  it('leaves the budget at zero after a successful mention turn', async () => {
    const { message } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(inFlightBytes()).toBe(0)
  })

  // Refusing after the typing indicator has started means the interval is inherited and has to be cleared,
  // or she is left visibly typing in that channel forever.
  it('stops the typing indicator when it refuses a mention turn', async () => {
    vi.useFakeTimers()
    try {
      tryReserve(BUDGET - 1)
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

  // A leak here degrades into a permanent refusal rather than one failed turn, which is the harder failure
  // to notice — so the failing path is pinned separately from the succeeding one.
  it('leaves the budget at zero after the model fails the turn', async () => {
    mocks.generateResponse.mockRejectedValue(new Error('model exploded'))
    const { interaction } = createInteraction('channel-1', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(interaction)
    expect(inFlightBytes()).toBe(0)
  })

  it('leaves the budget at zero after the model fails a mention turn', async () => {
    mocks.generateResponse.mockRejectedValue(new Error('model exploded'))
    const { message } = createMessage('channel-2', [upload(FOUR_MB)])
    await createMessageHandler(client, rateLimiter())(message)
    expect(inFlightBytes()).toBe(0)
  })

  // The whole point of the feature: the per-channel guard admits both of these, because they are different
  // channels. Only the global budget sees that their bytes coexist.
  it('bounds turns in different channels in aggregate, which the per-channel guard does not', async () => {
    let releaseFirst: () => void = () => {}
    mocks.generateResponse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              text: 'hi',
              tone: 'neutral',
              metrics: {},
              toolsUsed: [],
              droppedAttachments: 0,
              truncatedAttachments: 0
            })
        })
    )

    // A maximal turn, expressed in terms of the ceiling rather than a fixed count: this test is about two
    // channels sharing one global budget, and it should keep saying that whatever MAX_ATTACHMENTS becomes.
    const maximalTurn = Array.from({ length: MAX_ATTACHMENTS }, () => upload(FOUR_MB))
    const first = createInteraction('channel-1', maximalTurn)
    const firstTurn = createInteractionHandler(rateLimiter())(first.interaction)
    await vi.waitFor(() => expect(inFlightBytes()).toBe(MAX_ATTACHMENTS * FOUR_MB))

    tryReserve(BUDGET - MAX_ATTACHMENTS * FOUR_MB - 1)
    const second = createInteraction('channel-2', [upload(FOUR_MB)])
    await createInteractionHandler(rateLimiter())(second.interaction)
    expect(second.editReply).toHaveBeenCalledWith({ content: 'busy' })

    releaseFirst()
    await firstTurn
  })
})
