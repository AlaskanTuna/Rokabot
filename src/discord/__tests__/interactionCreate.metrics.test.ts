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
  splitResponse: vi.fn((response: string) => [response])
}))

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
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => mocks.gameCommandHandler }))
vi.mock('../events/stats/statsCommand.js', () => ({ handleStatsCommand: mocks.handleStatsCommand }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => mocks.toolCommandHandler }))

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
    expect(JSON.stringify(interaction.editReply.mock.calls[0][0].components[0].toJSON())).not.toContain('-# 🌸')
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
      commandName: 'chat',
      options: { getString: vi.fn(() => 'roll a die'), getAttachment: vi.fn() },
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
