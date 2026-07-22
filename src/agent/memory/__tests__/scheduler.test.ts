import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  type QueuedJob = {
    id: number
    guildId: string
    channelId: string
    payload: Array<{ userId: string; displayName: string; content: string }>
    status: 'pending' | 'processing'
  }

  let nextId = 1
  const jobs: QueuedJob[] = []
  const limiter = { remainingRpm: 15, remainingRpd: 500 }

  return {
    jobs,
    limiter,
    runExtraction: vi.fn().mockResolvedValue(undefined),
    isShuttingDown: vi.fn(() => false),
    logger: { debug: vi.fn(), warn: vi.fn() },
    resetQueue: () => {
      jobs.length = 0
      nextId = 1
    },
    enqueueExtraction: vi.fn((input: Omit<QueuedJob, 'id' | 'status'>) => {
      const job = { ...input, id: nextId++, status: 'pending' as const }
      jobs.push(job)
      return { ...job, enqueuedAt: Date.now(), attempts: 0 }
    }),
    listGuildsWithPending: vi.fn(() =>
      [...new Set(jobs.filter((job) => job.status === 'pending').map((job) => job.guildId))].sort()
    ),
    claimNextForGuild: vi.fn((guildId: string) => {
      const job = jobs.find((candidate) => candidate.guildId === guildId && candidate.status === 'pending')
      if (!job) return undefined
      job.status = 'processing'
      return { ...job, enqueuedAt: Date.now(), attempts: 0 }
    }),
    markDone: vi.fn((id: number) => {
      const index = jobs.findIndex((job) => job.id === id)
      if (index === -1) return false
      jobs.splice(index, 1)
      return true
    }),
    markFailed: vi.fn()
  }
})

vi.mock('../../../config.js', () => ({
  config: {
    gemini: { extractionRpmFloor: 3 },
    memory: { extractionDailyBudgetRatio: 0.4, perGuildGapMs: 1_000 },
    rateLimit: { rpm: 15, rpd: 5 }
  }
}))

vi.mock('../../../storage/extractionQueue.js', () => ({
  enqueueExtraction: mocks.enqueueExtraction,
  listGuildsWithPending: mocks.listGuildsWithPending,
  claimNextForGuild: mocks.claimNextForGuild,
  markDone: mocks.markDone,
  markFailed: mocks.markFailed
}))

vi.mock('../../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: () => mocks.limiter
}))

vi.mock('../../shutdownSignal.js', () => ({
  isShuttingDown: mocks.isShuttingDown
}))

vi.mock('../extractor.js', () => ({
  runExtraction: mocks.runExtraction
}))

vi.mock('../../../utils/logger.js', () => ({ logger: mocks.logger }))

import { enqueueAndSchedule, resetForTest, startExtractionScheduler, stopExtractionScheduler } from '../scheduler.js'

function job(guildId: string, content = 'I like tea') {
  return {
    guildId,
    channelId: `channel-${guildId}`,
    messages: [{ userId: `user-${guildId}`, displayName: guildId, content }]
  }
}

async function drain(): Promise<void> {
  await vi.runOnlyPendingTimersAsync()
}

describe('extraction scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T12:00:00'))
    resetForTest()
    mocks.resetQueue()
    mocks.runExtraction.mockClear()
    mocks.markDone.mockClear()
    mocks.markFailed.mockClear()
    mocks.logger.debug.mockClear()
    mocks.isShuttingDown.mockReturnValue(false)
    mocks.limiter.remainingRpm = 15
    mocks.limiter.remainingRpd = 500
  })

  afterEach(() => {
    stopExtractionScheduler()
    vi.useRealTimers()
  })

  it('drains guilds in round-robin order and revisits a guild after its own gap', async () => {
    enqueueAndSchedule(job('A', 'first A'))
    enqueueAndSchedule(job('A', 'second A'))
    enqueueAndSchedule(job('B'))
    enqueueAndSchedule(job('C'))

    await drain()
    await drain()
    await drain()
    await drain()

    expect(mocks.runExtraction.mock.calls.map(([queued]) => queued.guildId)).toEqual(['A', 'B', 'C'])

    await vi.advanceTimersByTimeAsync(1_000)

    expect(mocks.runExtraction.mock.calls.map(([queued]) => queued.guildId)).toEqual(['A', 'B', 'C', 'A'])
  })

  it('does not let a gapped busy guild block other guilds', async () => {
    enqueueAndSchedule(job('A', 'first A'))
    enqueueAndSchedule(job('A', 'second A'))
    await drain()

    enqueueAndSchedule(job('B'))
    enqueueAndSchedule(job('C'))
    await drain()
    await drain()
    await drain()

    expect(mocks.runExtraction.mock.calls.map(([queued]) => queued.guildId)).toEqual(['A', 'B', 'C'])
  })

  it('defers work at the extraction floor so a live retry reserve remains available', async () => {
    mocks.limiter.remainingRpm = 2
    enqueueAndSchedule(job('A'))

    await drain()

    expect(mocks.runExtraction).not.toHaveBeenCalled()
    expect(mocks.jobs).toHaveLength(1)
  })

  it('stops at the daily extraction budget and resumes after local midnight', async () => {
    enqueueAndSchedule(job('A'))
    enqueueAndSchedule(job('B'))
    enqueueAndSchedule(job('C'))

    await drain()
    await drain()
    await drain()

    expect(mocks.runExtraction).toHaveBeenCalledTimes(2)
    expect(mocks.logger.debug).toHaveBeenCalledWith(expect.any(Object), 'Memory extraction daily budget exhausted')

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1_000)

    expect(mocks.runExtraction).toHaveBeenCalledTimes(3)
  })

  it('halts within one tick on shutdown and leaves no scheduler timer after stopping', async () => {
    mocks.isShuttingDown.mockReturnValue(true)
    enqueueAndSchedule(job('A'))

    await drain()

    expect(mocks.runExtraction).not.toHaveBeenCalled()
    stopExtractionScheduler()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('can be started explicitly for task-87 lifecycle wiring', async () => {
    mocks.enqueueExtraction({ guildId: 'A', channelId: 'channel-A', payload: job('A').messages })

    startExtractionScheduler()
    await drain()

    expect(mocks.runExtraction).toHaveBeenCalledTimes(1)
  })
})
