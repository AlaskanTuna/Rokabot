import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  info: vi.fn()
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: mocks.info, warn: vi.fn() }
}))
vi.mock('../concurrency.js', () => ({ isChannelBusy: () => false, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../messageBuilder.js', () => ({ buildRokaMessage: (content: string) => content }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  splitResponse: (response: string) => [response]
}))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => vi.fn() }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => vi.fn() }))

import { createInteractionHandler } from '../events/interactionCreate.js'

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

describe('interaction handler metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateResponse.mockResolvedValue({ text: 'Hello~', tone: 'playful', metrics })
  })

  it('records one completed slash turn with an enriched summary', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'chat',
      options: { getString: vi.fn(() => 'hello'), getAttachment: vi.fn() },
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
  })
})
