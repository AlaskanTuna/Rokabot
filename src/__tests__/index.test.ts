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
    configureMemoryItemProjectionTriggers: vi.fn(),
    fillMemoryItemEmbeddingHashes: vi.fn(),
    sweepMemoryItemIntegrity: vi.fn().mockReturnValue({ fact: 0, episode: 0, media: 0 }),
    restoreOpenEpisodes: vi.fn(),
    getDb: vi.fn(),
    pruneStaleClaims: vi.fn(),
    reclassifyClaims: vi.fn().mockResolvedValue(0),
    pruneExtractionSamples: vi.fn().mockReturnValue(0),
    pruneFailedExtractionJobs: vi.fn(),
    ready: (handler: () => void) => {
      readyHandler = handler
    },
    resetStuckProcessing: vi.fn(),
    logger: { error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() },
    startupWarnings: [] as Array<{ fields: Record<string, unknown>; message: string }>,
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
  startupWarnings: mocks.startupWarnings,
  config: {
    discord: { token: 'token' },
    socialPosts: { enabled: false, ytDlpPath: 'yt-dlp' },
    jev: { apiKey: undefined },
    memory: {
      store: 'legacy',
      judge: 'none',
      claimRetentionDays: 90,
      episodeRetentionDays: 90,
      failedExtractionRetentionDays: 7
    },
    metrics: { retentionDays: 90 },
    session: { historyRetentionDays: 7 }
  }
}))
vi.mock('../agent/memory/channelMonitor.js', () => ({ cleanupExpired: vi.fn(), restoreMonitoredChannels: vi.fn() }))
vi.mock('../agent/memory/memoryClaims.js', () => ({ pruneStaleClaims: mocks.pruneStaleClaims }))
vi.mock('../agent/memory/reclassify.js', () => ({ reclassifyClaims: mocks.reclassifyClaims }))
vi.mock('../agent/memory/scheduler.js', () => ({
  startExtractionScheduler: mocks.startExtractionScheduler,
  stopExtractionScheduler: mocks.stopExtractionScheduler,
  waitForInFlightExtractions: mocks.waitForInFlightExtractions
}))
vi.mock('../agent/memory/episodeTracker.js', () => ({
  flushOpenEpisodes: mocks.flushOpenEpisodes,
  restoreOpenEpisodes: mocks.restoreOpenEpisodes
}))
vi.mock('../agent/memory/episodeMaintenance.js', () => ({ pruneEpisodesAndReembed: mocks.pruneEpisodesAndReembed }))
vi.mock('../agent/shutdownSignal.js', () => ({ beginShutdown: mocks.beginShutdown }))
vi.mock('../agent/session.js', () => ({ destroyAllSessions: mocks.destroyAllSessions }))
vi.mock('../discord/emojiReactor.js', () => ({ cleanupExpiredCooldowns: vi.fn() }))
vi.mock('../discord/reminderScheduler.js', () => ({ startReminderScheduler: vi.fn(), stopReminderScheduler: vi.fn() }))
vi.mock('../discord/statusCycler.js', () => ({ stopStatusCycler: vi.fn() }))
vi.mock('../games/shiritori.js', () => ({ destroyAllGames: vi.fn() }))
vi.mock('../storage/database.js', () => ({ closeDb: mocks.closeDb, getDb: mocks.getDb }))
vi.mock('../storage/extractionQueue.js', () => ({
  pruneFailedExtractionJobs: mocks.pruneFailedExtractionJobs,
  resetStuckProcessing: mocks.resetStuckProcessing
}))
vi.mock('../storage/extractionSampleStore.js', () => ({ pruneExtractionSamples: mocks.pruneExtractionSamples }))
vi.mock('../storage/memoryItemProjection.js', () => ({
  configureMemoryItemProjectionTriggers: mocks.configureMemoryItemProjectionTriggers
}))
vi.mock('../storage/memoryItemIntegrity.js', () => ({
  fillMemoryItemEmbeddingHashes: mocks.fillMemoryItemEmbeddingHashes,
  sweepMemoryItemIntegrity: mocks.sweepMemoryItemIntegrity
}))
vi.mock('../storage/metricsStore.js', () => ({ pruneOldMetrics: vi.fn(), pruneFailureDiagnostics: vi.fn() }))
vi.mock('../storage/sessionStore.js', () => ({ pruneOldHistory: vi.fn() }))
vi.mock('../utils/logger.js', () => ({ logger: mocks.logger }))

describe('startup memory tasks', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.startupWarnings.length = 0
    mocks.pruneEpisodesAndReembed.mockResolvedValue({ deleted: 0, reembedded: 0, failed: 0 })
    mocks.reclassifyClaims.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recovers stale processing jobs before starting the extraction scheduler', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.resetStuckProcessing).toHaveBeenCalledOnce()
    expect(mocks.pruneFailedExtractionJobs).toHaveBeenCalledWith(7)
    expect(mocks.pruneStaleClaims).toHaveBeenCalledWith(90, 'bot-1')
    expect(mocks.reclassifyClaims).toHaveBeenCalledOnce()
    expect(mocks.pruneStaleClaims.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reclassifyClaims.mock.invocationCallOrder[0]
    )
    expect(mocks.startExtractionScheduler).toHaveBeenCalledOnce()
    expect(mocks.restoreOpenEpisodes).toHaveBeenCalledOnce()
    expect(mocks.resetStuckProcessing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startExtractionScheduler.mock.invocationCallOrder[0]
    )
  })

  it('configures legacy projection state at startup without running dual maintenance', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.configureMemoryItemProjectionTriggers).toHaveBeenCalledOnce()
    expect(mocks.configureMemoryItemProjectionTriggers).toHaveBeenCalledWith(undefined, 'legacy')
    expect(mocks.sweepMemoryItemIntegrity).not.toHaveBeenCalled()
    expect(mocks.fillMemoryItemEmbeddingHashes).not.toHaveBeenCalled()
  })

  it('installs dual triggers and sweeps at startup and daily', async () => {
    vi.useFakeTimers()
    const { config } = await import('../config.js')
    Object.assign(config.memory, { store: 'dual' })
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.configureMemoryItemProjectionTriggers).toHaveBeenCalledWith(undefined, 'dual')
    expect(mocks.fillMemoryItemEmbeddingHashes).toHaveBeenCalledOnce()
    expect(mocks.sweepMemoryItemIntegrity).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(mocks.fillMemoryItemEmbeddingHashes).toHaveBeenCalledTimes(2)
    expect(mocks.sweepMemoryItemIntegrity).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('keeps dual triggers and daily integrity maintenance enabled in item mode', async () => {
    vi.useFakeTimers()
    const { config } = await import('../config.js')
    Object.assign(config.memory, { store: 'item' })
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.configureMemoryItemProjectionTriggers).toHaveBeenCalledWith(undefined, 'item')
    expect(mocks.fillMemoryItemEmbeddingHashes).toHaveBeenCalledOnce()
    expect(mocks.sweepMemoryItemIntegrity).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(mocks.fillMemoryItemEmbeddingHashes).toHaveBeenCalledTimes(2)
    expect(mocks.sweepMemoryItemIntegrity).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('warns once at startup when passive memory has no TypeSafe API key', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.logger.warn).toHaveBeenCalledOnce()
    expect(mocks.logger.warn).toHaveBeenCalledWith('Passive memory extraction is disabled: no TypeSafe API key')
  })

  it('does not warn about passive memory when the main model judges it', async () => {
    const { config } = await import('../config.js')
    Object.assign(config.memory, { judge: 'model' })

    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.logger.warn).not.toHaveBeenCalledWith('Passive memory extraction is disabled: no TypeSafe API key')
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

  it('runs episode maintenance and reclassification from the daily claim-prune interval', async () => {
    vi.useFakeTimers()
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.pruneEpisodesAndReembed).toHaveBeenCalledOnce()
    expect(mocks.pruneFailedExtractionJobs).toHaveBeenCalledOnce()
    expect(mocks.reclassifyClaims).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(mocks.reclassifyClaims).toHaveBeenCalledTimes(2)
    expect(mocks.pruneEpisodesAndReembed).toHaveBeenCalledTimes(2)
    expect(mocks.pruneFailedExtractionJobs).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('prunes expired extraction samples at startup and daily, logging only the count', async () => {
    vi.useFakeTimers()
    mocks.pruneExtractionSamples.mockReturnValueOnce(3).mockReturnValueOnce(0)
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.pruneExtractionSamples).toHaveBeenCalledOnce()
    expect(mocks.logger.info).toHaveBeenCalledWith({ removed: 3 }, 'Pruned extraction samples')
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(mocks.pruneExtractionSamples).toHaveBeenCalledTimes(2)
    expect(mocks.logger.info).not.toHaveBeenCalledWith({ removed: 0 }, 'Pruned extraction samples')
    vi.useRealTimers()
  })

  it('contains extraction sample pruning failures without stopping the other startup tasks', async () => {
    const error = new Error('sample pruning failed')
    mocks.pruneExtractionSamples.mockImplementationOnce(() => {
      throw error
    })
    await import('../index.js')

    expect(() => mocks.triggerReady()).not.toThrow()
    expect(mocks.logger.warn).toHaveBeenCalledWith({ err: error }, 'Failed to prune extraction samples')
    expect(mocks.startExtractionScheduler).toHaveBeenCalledOnce()
  })

  it('catches background episode maintenance and reclassification errors', async () => {
    const error = new Error('episode pruning failed')
    const reclassifyError = new Error('reclassification failed')
    mocks.pruneEpisodesAndReembed.mockRejectedValueOnce(error)
    mocks.reclassifyClaims.mockRejectedValueOnce(reclassifyError)
    await import('../index.js')
    mocks.triggerReady()

    await vi.waitFor(() =>
      expect(mocks.logger.error).toHaveBeenCalledWith({ err: error }, 'Failed to prune and repair memory episodes')
    )
    await vi.waitFor(() =>
      expect(mocks.logger.warn).toHaveBeenCalledWith({ err: reclassifyError }, 'Memory reclassification failed')
    )
    expect(mocks.startExtractionScheduler).toHaveBeenCalledOnce()
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

  it('logs each startup warning once at boot', async () => {
    mocks.startupWarnings.push(
      { fields: { provider: 'native' }, message: 'first warning' },
      { fields: { sessionTtlMs: 1, maxLiveRetryWindow: 2 }, message: 'second warning' }
    )
    await import('../index.js')

    expect(mocks.logger.warn).toHaveBeenCalledTimes(2)
    expect(mocks.logger.warn).toHaveBeenNthCalledWith(1, { provider: 'native' }, 'first warning')
    expect(mocks.logger.warn).toHaveBeenNthCalledWith(2, { sessionTtlMs: 1, maxLiveRetryWindow: 2 }, 'second warning')
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
