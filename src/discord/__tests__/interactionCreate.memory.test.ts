import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  gameCommandHandler: vi.fn(),
  toolCommandHandler: vi.fn(),
  handleStatsCommand: vi.fn(),
  splitResponse: vi.fn((response: string) => [response]),
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] })),
  getSharedRateLimiter: vi.fn(() => ({ tryConsumeAboveFloor: () => true })),
  getLocalHour: vi.fn(() => 12),
  runnerRequests: [] as Array<{ stateDelta?: Record<string, unknown> }>
}))

// roka.js is intentionally left unmocked — this suite drives the real handler through generateResponse's
// request construction, captured at runner.runAsync, the last hop this repo owns. It reconstructs
// toolContext.state from that stateDelta instead of observing ADK's own propagation of it, which happens inside ADK.
vi.mock('@google/adk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/adk')>()

  class CapturingRunner extends actual.Runner {
    override runAsync(request: Parameters<InstanceType<typeof actual.Runner>['runAsync']>[0]) {
      mocks.runnerRequests.push(request)
      return (async function* () {
        yield actual.createEvent({
          author: 'roka',
          content: { role: 'model', parts: [{ text: 'Captured fake model reply~' }] }
        })
      })()
    }
  }

  return { ...actual, Runner: CapturingRunner }
})
vi.mock('../../agent/memory/retriever.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../agent/memory/retriever.js')>()),
  retrieveForTurn: mocks.retrieveForTurn
}))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: mocks.error, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../../utils/rateLimiter.js', () => ({ getSharedRateLimiter: mocks.getSharedRateLimiter }))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: mocks.getLocalHour }))
vi.mock('../concurrency.js', () => ({ isChannelBusy: () => false, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => mocks.gameCommandHandler }))
vi.mock('../events/stats/statsCommand.js', () => ({ handleStatsCommand: mocks.handleStatsCommand }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => mocks.toolCommandHandler }))

import { destroySession } from '../../agent/roka.js'
import { recallUserTool, rememberUserTool } from '../../agent/tools/index.js'
import { closeDb } from '../../storage/database.js'
import { createInteractionHandler } from '../events/interactionCreate.js'

const CHANNEL_A = 'memory-bridge-dm-channel-a'
const CHANNEL_B = 'memory-bridge-dm-channel-b'
const USER_A = 'memory-bridge-user-a'

function makeInteraction(channelId: string, userId: string, message: string) {
  return {
    isChatInputCommand: () => true,
    commandName: 'ask',
    options: { getString: vi.fn((name: string) => (name === 'question' ? message : null)), getAttachment: vi.fn() },
    channelId,
    member: null,
    user: { displayName: 'Rin', username: 'rin', id: userId },
    guildId: null,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined)
  }
}

describe('interaction handler DM memory tenant bridge', () => {
  const rateLimiter = { tryConsume: vi.fn(() => true), remainingRpm: 14, remainingRpd: 499 }

  /** Drives one real turn and returns the tool state generateResponse handed to runner.runAsync for it. */
  async function turnState(
    handler: ReturnType<typeof createInteractionHandler>,
    channelId: string,
    message: string
  ): Promise<Map<string, unknown>> {
    mocks.runnerRequests.length = 0
    await handler(makeInteraction(channelId, USER_A, message) as never)
    expect(mocks.runnerRequests).toHaveLength(1)
    const stateDelta = mocks.runnerRequests[0].stateDelta
    if (!stateDelta) throw new Error('runner.runAsync was reached without a stateDelta')
    return new Map(Object.entries(stateDelta))
  }

  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    vi.clearAllMocks()
    mocks.runnerRequests.length = 0
  })

  afterEach(async () => {
    await destroySession(CHANNEL_A)
    await destroySession(CHANNEL_B)
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('keeps a fact written in one DM invisible to the same user in a different DM, visible in its own DM', async () => {
    const handler = createInteractionHandler(rateLimiter as never)

    await expect(
      rememberUserTool.runAsync({
        args: { fact_key: 'favorite_anime', fact_value: 'Frieren' },
        toolContext: { state: await turnState(handler, CHANNEL_A, 'Remember I like Frieren') }
      })
    ).resolves.toMatchObject({ success: true })

    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: { state: await turnState(handler, CHANNEL_B, 'What do you remember about me?') }
      })
    ).resolves.toMatchObject({ factCount: 0 })

    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: { state: await turnState(handler, CHANNEL_A, 'What do you remember about me?') }
      })
    ).resolves.toMatchObject({ factCount: 1 })
  })
})
