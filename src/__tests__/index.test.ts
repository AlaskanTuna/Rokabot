import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let readyHandler: (() => void) | undefined
  return {
    beginShutdown: vi.fn(),
    closeDb: vi.fn(),
    createServer: vi.fn(() => ({ listen: vi.fn() })),
    destroyAllSessions: vi.fn().mockResolvedValue(undefined),
    destroyClient: vi.fn(),
    flushOpenEpisodes: vi.fn(),
    getDb: vi.fn(),
    pruneStaleClaims: vi.fn(),
    ready: (handler: () => void) => {
      readyHandler = handler
    },
    resetStuckProcessing: vi.fn(),
    logger: { error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() },
    startExtractionScheduler: vi.fn(),
    pruneEpisodesAndReembed: vi.fn().mockResolvedValue({ deleted: 0, reembedded: 0, failed: 0 }),
    stopExtractionScheduler: vi.fn(),
    waitForInFlightExtractions: vi.fn().mockResolvedValue(undefined),
    triggerReady: () => readyHandler?.()
  }
})

vi.mock('node:http', () => ({ default: { createServer: mocks.createServer } }))
vi.mock('../discord/client.js', () => ({
  createClient: () => ({
    destroy: mocks.destroyClient,
    isReady: () => true,
    login: vi.fn().mockResolvedValue(undefined),
    once: (_event: string, handler: () => void) => mocks.ready(handler),
    user: { id: 'bot-1', displayName: 'Roka' }
  })
}))
vi.mock('../config.js', () => ({
  config: {
    discord: { token: 'token' },
    jev: { apiKey: undefined },
    memory: { claimRetentionDays: 90, episodeRetentionDays: 90 },
    metrics: { retentionDays: 90 },
    session: { historyRetentionDays: 7 }
  }
}))
vi.mock('../agent/channelMonitor.js', () => ({ cleanupExpired: vi.fn(), restoreMonitoredChannels: vi.fn() }))
vi.mock('../agent/memory/memoryClaims.js', () => ({ pruneStaleClaims: mocks.pruneStaleClaims }))
vi.mock('../agent/memory/scheduler.js', () => ({
  startExtractionScheduler: mocks.startExtractionScheduler,
  stopExtractionScheduler: mocks.stopExtractionScheduler,
  waitForInFlightExtractions: mocks.waitForInFlightExtractions
}))
vi.mock('../agent/memory/episodeTracker.js', () => ({ flushOpenEpisodes: mocks.flushOpenEpisodes }))
vi.mock('../agent/memory/episodeMaintenance.js', () => ({ pruneEpisodesAndReembed: mocks.pruneEpisodesAndReembed }))
vi.mock('../agent/shutdownSignal.js', () => ({ beginShutdown: mocks.beginShutdown }))
vi.mock('../agent/session.js', () => ({ destroyAllSessions: mocks.destroyAllSessions }))
vi.mock('../discord/emojiReactor.js', () => ({ cleanupExpiredCooldowns: vi.fn() }))
vi.mock('../discord/reminderScheduler.js', () => ({ startReminderScheduler: vi.fn(), stopReminderScheduler: vi.fn() }))
vi.mock('../discord/statusCycler.js', () => ({ stopStatusCycler: vi.fn() }))
vi.mock('../games/shiritori.js', () => ({ destroyAllGames: vi.fn() }))
vi.mock('../storage/database.js', () => ({ closeDb: mocks.closeDb, getDb: mocks.getDb }))
vi.mock('../storage/extractionQueue.js', () => ({ resetStuckProcessing: mocks.resetStuckProcessing }))
vi.mock('../storage/metricsStore.js', () => ({ pruneOldMetrics: vi.fn(), pruneFailureDiagnostics: vi.fn() }))
vi.mock('../storage/sessionStore.js', () => ({ pruneOldHistory: vi.fn() }))
vi.mock('../utils/logger.js', () => ({ logger: mocks.logger }))

describe('startup memory tasks', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.pruneEpisodesAndReembed.mockResolvedValue({ deleted: 0, reembedded: 0, failed: 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recovers stale processing jobs before starting the extraction scheduler', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.resetStuckProcessing).toHaveBeenCalledOnce()
    expect(mocks.pruneStaleClaims).toHaveBeenCalledWith(90, 'bot-1')
    expect(mocks.startExtractionScheduler).toHaveBeenCalledOnce()
    expect(mocks.resetStuckProcessing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startExtractionScheduler.mock.invocationCallOrder[0]
    )
  })

  it('warns once at startup when passive memory has no TypeSafe API key', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.logger.warn).toHaveBeenCalledOnce()
    expect(mocks.logger.warn).toHaveBeenCalledWith('Passive memory extraction is disabled: no TypeSafe API key')
  })

  it('starts episode maintenance without waiting for the pass to finish', async () => {
    let finishMaintenance: (() => void) | undefined
    mocks.pruneEpisodesAndReembed.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishMaintenance = resolve
      })
    )
    await import('../index.js')

    expect(() => mocks.triggerReady()).not.toThrow()
    expect(mocks.pruneEpisodesAndReembed).toHaveBeenCalledOnce()
    finishMaintenance?.()
  })

  it('runs episode maintenance from the daily claim-prune interval', async () => {
    vi.useFakeTimers()
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.pruneEpisodesAndReembed).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(mocks.pruneEpisodesAndReembed).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('catches background episode maintenance errors', async () => {
    const error = new Error('episode pruning failed')
    mocks.pruneEpisodesAndReembed.mockRejectedValueOnce(error)
    await import('../index.js')
    mocks.triggerReady()

    await vi.waitFor(() =>
      expect(mocks.logger.error).toHaveBeenCalledWith({ err: error }, 'Failed to prune and repair memory episodes')
    )
  })

  it('flushes open episodes and waits for active extraction before closing SQLite', async () => {
    await import('../index.js')
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const shutdown = process.listeners('SIGTERM').at(-1) as (() => Promise<void>) | undefined
    expect(shutdown).toBeDefined()
    await shutdown?.()

    expect(mocks.beginShutdown).toHaveBeenCalledOnce()
    expect(mocks.flushOpenEpisodes).toHaveBeenCalledOnce()
    expect(mocks.stopExtractionScheduler).toHaveBeenCalledOnce()
    expect(mocks.waitForInFlightExtractions).toHaveBeenCalledOnce()
    expect(mocks.closeDb).toHaveBeenCalledOnce()
    expect(mocks.beginShutdown.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.flushOpenEpisodes.mock.invocationCallOrder[0]
    )
    expect(mocks.flushOpenEpisodes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.stopExtractionScheduler.mock.invocationCallOrder[0]
    )
    expect(mocks.waitForInFlightExtractions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.closeDb.mock.invocationCallOrder[0]
    )
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('contains startup memory task failures', async () => {
    const error = new Error('claim pruning failed')
    mocks.pruneStaleClaims.mockImplementation(() => {
      throw error
    })

    await import('../index.js')

    expect(() => mocks.triggerReady()).not.toThrow()
    expect(mocks.logger.error).toHaveBeenCalledWith({ err: error }, 'Failed to start memory tasks')
  })
})
