import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let readyHandler: (() => void) | undefined
  return {
    backfillLegacyClaims: vi.fn(),
    createServer: vi.fn(() => ({ listen: vi.fn() })),
    getDb: vi.fn(),
    ready: (handler: () => void) => {
      readyHandler = handler
    },
    resetStuckProcessing: vi.fn(),
    logger: { error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() },
    startExtractionScheduler: vi.fn(),
    stopExtractionScheduler: vi.fn(),
    triggerReady: () => readyHandler?.()
  }
})

vi.mock('node:http', () => ({ default: { createServer: mocks.createServer } }))
vi.mock('../discord/client.js', () => ({
  createClient: () => ({
    destroy: vi.fn(),
    isReady: () => true,
    login: vi.fn().mockResolvedValue(undefined),
    once: (_event: string, handler: () => void) => mocks.ready(handler),
    user: { displayName: 'Roka' }
  })
}))
vi.mock('../config.js', () => ({
  config: {
    discord: { token: 'token' },
    memory: { claimRetentionDays: 90 },
    metrics: { retentionDays: 90 },
    session: { historyRetentionDays: 7 }
  }
}))
vi.mock('../agent/channelMonitor.js', () => ({ cleanupExpired: vi.fn(), restoreMonitoredChannels: vi.fn() }))
vi.mock('../agent/memory/memoryClaims.js', () => ({ pruneStaleClaims: vi.fn() }))
vi.mock('../agent/memory/scheduler.js', () => ({
  startExtractionScheduler: mocks.startExtractionScheduler,
  stopExtractionScheduler: mocks.stopExtractionScheduler
}))
vi.mock('../agent/roka.js', () => ({ destroyAllSessions: vi.fn() }))
vi.mock('../discord/emojiReactor.js', () => ({ cleanupExpiredCooldowns: vi.fn() }))
vi.mock('../discord/reminderScheduler.js', () => ({ startReminderScheduler: vi.fn(), stopReminderScheduler: vi.fn() }))
vi.mock('../discord/statusCycler.js', () => ({ stopStatusCycler: vi.fn() }))
vi.mock('../games/shiritori.js', () => ({ destroyAllGames: vi.fn() }))
vi.mock('../storage/database.js', () => ({ closeDb: vi.fn(), getDb: mocks.getDb }))
vi.mock('../storage/extractionQueue.js', () => ({ resetStuckProcessing: mocks.resetStuckProcessing }))
vi.mock('../storage/memoryMigration.js', () => ({ backfillLegacyClaims: mocks.backfillLegacyClaims }))
vi.mock('../storage/metricsStore.js', () => ({ pruneOldMetrics: vi.fn() }))
vi.mock('../storage/sessionStore.js', () => ({ pruneOldHistory: vi.fn() }))
vi.mock('../storage/userMemory.js', () => ({ pruneOldFacts: vi.fn() }))
vi.mock('../utils/logger.js', () => ({ logger: mocks.logger }))

describe('startup memory tasks', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('recovers stale processing jobs before starting the extraction scheduler', async () => {
    await import('../index.js')
    mocks.triggerReady()

    expect(mocks.resetStuckProcessing).toHaveBeenCalledOnce()
    expect(mocks.resetStuckProcessing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startExtractionScheduler.mock.invocationCallOrder[0]
    )
  })

  it('contains startup memory task failures', async () => {
    const error = new Error('backfill failed')
    mocks.backfillLegacyClaims.mockImplementation(() => {
      throw error
    })

    await import('../index.js')

    expect(() => mocks.triggerReady()).not.toThrow()
    expect(mocks.logger.error).toHaveBeenCalledWith({ err: error }, 'Failed to start memory tasks')
  })
})
