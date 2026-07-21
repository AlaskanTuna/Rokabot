import type { Interaction, Message } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RateLimiter } from '../../utils/rateLimiter.js'

const mocks = vi.hoisted(() => {
  const busyChannels = new Set<string>()

  return {
    busyChannels,
    generateResponse: vi.fn(),
    isChannelBusy: vi.fn((channelId: string) => busyChannels.has(channelId)),
    markBusy: vi.fn((channelId: string) => busyChannels.add(channelId)),
    markFree: vi.fn((channelId: string) => busyChannels.delete(channelId))
  }
})

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../concurrency.js', () => ({
  isChannelBusy: mocks.isChannelBusy,
  markBusy: mocks.markBusy,
  markFree: mocks.markFree
}))
vi.mock('../../agent/channelMonitor.js', () => ({ isMonitored: () => false, markActive: vi.fn() }))
vi.mock('../../agent/memoryExtractor.js', () => ({ maybeExtractFromBuffer: vi.fn() }))
vi.mock('../../agent/passiveBuffer.js', () => ({ addMessage: vi.fn() }))
vi.mock('../../storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
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
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => vi.fn() }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => vi.fn() }))
vi.mock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { createInteractionHandler } from '../events/interactionCreate.js'
import { createMessageHandler } from '../events/messageCreate.js'

function createRateLimiter(allowed = true): RateLimiter {
  return {
    tryConsume: vi.fn(() => allowed),
    remainingRpm: 14,
    remainingRpd: 499
  } as unknown as RateLimiter
}

function createMessage(channelId = 'channel-1') {
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
      attachments: [],
      channel: { sendTyping: vi.fn().mockResolvedValue(undefined), messages: { fetch: vi.fn() } },
      reply
    } as unknown as Message,
    reply
  }
}

function createInteraction(channelId = 'channel-1') {
  const reply = vi.fn().mockResolvedValue({ delete: vi.fn().mockResolvedValue(undefined) })
  const deferReply = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      isChatInputCommand: () => true,
      commandName: 'chat',
      options: { getString: vi.fn(() => 'hello'), getAttachment: vi.fn() },
      channelId,
      member: null,
      user: { displayName: 'Alice', username: 'alice', id: 'user-1' },
      guildId: null,
      reply,
      deferReply,
      editReply,
      followUp: vi.fn()
    } as unknown as Interaction,
    reply,
    deferReply,
    editReply
  }
}

describe('Discord concurrency guards', () => {
  beforeEach(() => {
    mocks.busyChannels.clear()
    vi.clearAllMocks()
  })

  it('drops a busy message with the busy reply without consuming a token or generating a response', async () => {
    const { message, reply } = createMessage()
    const rateLimiter = createRateLimiter()
    mocks.busyChannels.add(message.channelId)

    await createMessageHandler({ user: { id: 'bot-1' } } as never, rateLimiter)(message)

    expect(reply).toHaveBeenCalledWith('busy')
    expect(rateLimiter.tryConsume).not.toHaveBeenCalled()
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it('drops a busy interaction with the busy reply without consuming a token or generating a response', async () => {
    const { interaction, reply } = createInteraction()
    const rateLimiter = createRateLimiter()
    mocks.busyChannels.add(interaction.channelId)

    await createInteractionHandler(rateLimiter)(interaction)

    expect(reply).toHaveBeenCalledWith({ content: 'busy', fetchReply: true })
    expect(rateLimiter.tryConsume).not.toHaveBeenCalled()
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })

  it.each([
    [
      'message',
      async (rateLimiter: RateLimiter) => {
        const { message } = createMessage()
        return createMessageHandler({ user: { id: 'bot-1' } } as never, rateLimiter)(message)
      }
    ],
    [
      'interaction',
      async (rateLimiter: RateLimiter) => {
        const { interaction } = createInteraction()
        return createInteractionHandler(rateLimiter)(interaction)
      }
    ]
  ])('checks busy before consuming one token and frees a %s channel after completion', async (_kind, invoke) => {
    const rateLimiter = createRateLimiter()
    let resolveResponse!: (value: { text: string; tone: string }) => void
    mocks.generateResponse.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve
      })
    )

    const handling = invoke(rateLimiter)
    await vi.waitFor(() => expect(mocks.generateResponse).toHaveBeenCalledOnce())

    expect(mocks.isChannelBusy).toHaveBeenCalledBefore(rateLimiter.tryConsume as ReturnType<typeof vi.fn>)
    expect(rateLimiter.tryConsume).toHaveBeenCalledOnce()
    expect(mocks.markBusy).toHaveBeenCalledWith('channel-1')
    expect(mocks.busyChannels.has('channel-1')).toBe(true)

    resolveResponse({ text: 'response', tone: 'playful' })
    await handling

    expect(mocks.markFree).toHaveBeenCalledWith('channel-1')
    expect(mocks.busyChannels.has('channel-1')).toBe(false)
  })

  it.each([
    [
      'message',
      async (rateLimiter: RateLimiter) => {
        const { message } = createMessage()
        return createMessageHandler({ user: { id: 'bot-1' } } as never, rateLimiter)(message)
      }
    ],
    [
      'interaction',
      async (rateLimiter: RateLimiter) => {
        const { interaction } = createInteraction()
        return createInteractionHandler(rateLimiter)(interaction)
      }
    ]
  ])('frees a %s channel when generation throws', async (_kind, invoke) => {
    const rateLimiter = createRateLimiter()
    mocks.generateResponse.mockRejectedValueOnce(new Error('Gemini unavailable'))

    await invoke(rateLimiter)

    expect(mocks.markBusy).toHaveBeenCalledWith('channel-1')
    expect(mocks.markFree).toHaveBeenCalledWith('channel-1')
    expect(mocks.busyChannels.has('channel-1')).toBe(false)
  })

  it.each([
    [
      'message',
      async (rateLimiter: RateLimiter) => {
        const { message, reply } = createMessage()
        await createMessageHandler({ user: { id: 'bot-1' } } as never, rateLimiter)(message)
        expect(reply).toHaveBeenCalledWith('decline')
      }
    ],
    [
      'interaction',
      async (rateLimiter: RateLimiter) => {
        const { interaction, reply } = createInteraction()
        await createInteractionHandler(rateLimiter)(interaction)
        expect(reply).toHaveBeenCalledWith({ content: 'decline', fetchReply: true })
      }
    ]
  ])('keeps the rate-limit decline path for a free %s channel', async (_kind, invoke) => {
    const rateLimiter = createRateLimiter(false)

    await invoke(rateLimiter)

    expect(mocks.isChannelBusy).toHaveBeenCalledWith('channel-1')
    expect(rateLimiter.tryConsume).toHaveBeenCalledOnce()
    expect(mocks.generateResponse).not.toHaveBeenCalled()
  })
})
