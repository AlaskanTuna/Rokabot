import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'

const mocks = vi.hoisted(() => {
  type QueuedJob = {
    id: number
    guildId: string
    channelId: string
    episode: ExtractionEpisode
    status: 'pending' | 'processing' | 'failed'
    attempts: number
  }

  let nextId = 1
  const jobs: QueuedJob[] = []

  return {
    jobs,
    runEpisodePipeline: vi
      .fn()
      .mockResolvedValue({ status: 'completed', summary: null, appliedOps: 0, duplicateOps: 0 }),
    persistEpisodeResult: vi.fn().mockResolvedValue(undefined),
    isShuttingDown: vi.fn(() => false),
    logger: { warn: vi.fn() },
    resetQueue: () => {
      jobs.length = 0
      nextId = 1
    },
    enqueueEpisode: vi.fn((input: { guildId: string; channelId: string; episode: ExtractionEpisode }) => {
      const job = { ...input, id: nextId++, status: 'pending' as const, attempts: 0 }
      jobs.push(job)
      return job
    }),
    listGuildsWithPending: vi.fn(() =>
      [...new Set(jobs.filter((job) => job.status === 'pending').map((job) => job.guildId))].sort()
    ),
    claimNextForGuild: vi.fn((guildId: string) => {
      const job = jobs.find((candidate) => candidate.guildId === guildId && candidate.status === 'pending')
      if (!job) return undefined
      job.status = 'processing'
      return job
    }),
    markDone: vi.fn((id: number) => {
      const index = jobs.findIndex((job) => job.id === id && job.status === 'processing')
      if (index === -1) return false
      jobs.splice(index, 1)
      return true
    }),
    markFailed: vi.fn((id: number) => {
      const job = jobs.find((candidate) => candidate.id === id && candidate.status === 'processing')
      if (!job) return undefined
      job.attempts += 1
      job.status = job.attempts >= 2 ? 'failed' : 'pending'
      return job.status
    })
  }
})

vi.mock('../../../storage/extractionQueue.js', () => ({
  enqueueEpisode: mocks.enqueueEpisode,
  listGuildsWithPending: mocks.listGuildsWithPending,
  claimNextForGuild: mocks.claimNextForGuild,
  markDone: mocks.markDone,
  markFailed: mocks.markFailed
}))
vi.mock('../../shutdownSignal.js', () => ({ isShuttingDown: mocks.isShuttingDown }))
vi.mock('../extractor.js', () => ({ runEpisodePipeline: mocks.runEpisodePipeline }))
vi.mock('../episodePersistence.js', () => ({ persistEpisodeResult: mocks.persistEpisodeResult }))
vi.mock('../../../utils/logger.js', () => ({ logger: mocks.logger }))

import { resetForTest, startExtractionScheduler, stopExtractionScheduler } from '../scheduler.js'

function episode(content: string): ExtractionEpisode {
  const message = {
    messageId: `${content}-1`,
    userId: 'user-1',
    displayName: 'Mio',
    content,
    timestamp: 1_000,
    isBot: false
  }
  return { messages: [message], context: [], startedAt: 1_000, endedAt: 1_000 }
}

function enqueue(guildId: string, content: string) {
  return mocks.enqueueEpisode({ guildId, channelId: `channel-${guildId}`, episode: episode(content) })
}

async function drain(): Promise<void> {
  for (let index = 0; index < 20; index++) {
    for (let settle = 0; settle < 10; settle++) await Promise.resolve()
    if (vi.getTimerCount() === 0) break
    await vi.runOnlyPendingTimersAsync()
  }
}

describe('episode extraction scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetForTest()
    mocks.resetQueue()
    mocks.runEpisodePipeline.mockReset()
    mocks.runEpisodePipeline.mockResolvedValue({ status: 'completed', summary: null, appliedOps: 0, duplicateOps: 0 })
    mocks.persistEpisodeResult.mockReset().mockResolvedValue(undefined)
    mocks.markDone.mockClear()
    mocks.markFailed.mockClear()
    mocks.logger.warn.mockClear()
    mocks.isShuttingDown.mockReturnValue(false)
  })

  afterEach(() => {
    stopExtractionScheduler()
    vi.useRealTimers()
  })

  it('drains queued guilds in deterministic round-robin order', async () => {
    enqueue('A', 'first A')
    enqueue('A', 'second A')
    enqueue('B', 'first B')
    enqueue('C', 'first C')

    startExtractionScheduler()
    await drain()

    expect(mocks.runEpisodePipeline.mock.calls.map(([job]) => job.guildId)).toEqual(['A', 'B', 'C', 'A'])
    expect(mocks.jobs).toHaveLength(0)
  })

  it('runs one job at a time per guild while other guilds continue draining', async () => {
    let finishA: (() => void) | undefined
    const blockedA = new Promise<{ status: 'completed'; summary: null; appliedOps: number; duplicateOps: number }>(
      (resolve) => {
        finishA = () => resolve({ status: 'completed', summary: null, appliedOps: 1, duplicateOps: 0 })
      }
    )
    mocks.runEpisodePipeline.mockImplementation((job: { guildId: string }) =>
      job.guildId === 'A'
        ? blockedA
        : Promise.resolve({ status: 'completed', summary: null, appliedOps: 1, duplicateOps: 0 })
    )
    enqueue('A', 'first A')
    enqueue('A', 'second A')
    enqueue('B', 'first B')

    startExtractionScheduler()
    await drain()

    expect(mocks.runEpisodePipeline.mock.calls.map(([job]) => job.guildId)).toEqual(['A', 'B'])
    expect(mocks.jobs.filter((job) => job.guildId === 'A' && job.status === 'processing')).toHaveLength(1)
    finishA?.()
    await drain()

    expect(mocks.runEpisodePipeline.mock.calls.map(([job]) => job.guildId)).toEqual(['A', 'B', 'A'])
  })

  it('retries a thrown episode pipeline once and retains the failed job', async () => {
    mocks.runEpisodePipeline
      .mockRejectedValueOnce(new Error('schema mismatch'))
      .mockRejectedValueOnce(new Error('schema mismatch'))
    const queued = enqueue('A', 'retry')

    startExtractionScheduler()
    await drain()

    expect(mocks.runEpisodePipeline).toHaveBeenCalledTimes(2)
    expect(mocks.markFailed).toHaveBeenCalledTimes(2)
    expect(mocks.jobs).toEqual([expect.objectContaining({ id: queued.id, status: 'failed', attempts: 2 })])
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(Object), 'Memory episode pipeline failed')
  })

  it('completes a normally dropped admission and continues despite no legacy gates', async () => {
    mocks.runEpisodePipeline.mockResolvedValueOnce({ status: 'dropped', summary: null, appliedOps: 0, duplicateOps: 0 })
    enqueue('A', 'drop')

    startExtractionScheduler()
    await drain()

    expect(mocks.runEpisodePipeline).toHaveBeenCalledOnce()
    expect(mocks.markDone).toHaveBeenCalledOnce()
    expect(mocks.jobs).toHaveLength(0)
  })

  it('persists a completed summary before marking its queue job done', async () => {
    let finishPersistence: (() => void) | undefined
    const persistence = new Promise<void>((resolve) => {
      finishPersistence = resolve
    })
    mocks.runEpisodePipeline.mockResolvedValueOnce({
      status: 'completed',
      summary: 'The group planned a picnic.',
      appliedOps: 0,
      duplicateOps: 0
    })
    mocks.persistEpisodeResult.mockReturnValueOnce(persistence)
    const queued = enqueue('A', 'summary')

    startExtractionScheduler()
    await drain()

    expect(mocks.persistEpisodeResult).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: queued.id }),
      result: { status: 'completed', summary: 'The group planned a picnic.', appliedOps: 0, duplicateOps: 0 }
    })
    expect(mocks.markDone).not.toHaveBeenCalled()

    finishPersistence?.()
    await drain()

    expect(mocks.markDone).toHaveBeenCalledWith(queued.id)
    expect(mocks.persistEpisodeResult.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markDone.mock.invocationCallOrder[0]
    )
  })

  it('does not start work after shutdown or leave a scheduled drain when stopped', async () => {
    enqueue('A', 'shutdown')
    mocks.isShuttingDown.mockReturnValue(true)
    startExtractionScheduler()
    await drain()
    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()

    mocks.isShuttingDown.mockReturnValue(false)
    startExtractionScheduler()
    stopExtractionScheduler()
    expect(vi.getTimerCount()).toBe(0)
    await drain()
    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
  })
})
