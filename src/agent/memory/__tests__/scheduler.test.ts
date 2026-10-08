import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'

const configMock = vi.hoisted(() => ({ memory: { privacy: 'relaxed' } }))

const mocks = vi.hoisted(() => {
  type QueuedJob = {
    id: number
    guildId: string
    channelId: string
    episode: ExtractionEpisode
    status: 'pending' | 'processing' | 'failed'
    attempts: number
    availableAt: number
    transientRetries: number
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
    embedPendingFacts: vi.fn().mockResolvedValue({ embedded: 0, failed: 0 }),
    logger: { warn: vi.fn() },
    resetQueue: () => {
      jobs.length = 0
      nextId = 1
    },
    enqueueEpisode: vi.fn((input: { guildId: string; channelId: string; episode: ExtractionEpisode }) => {
      const job = {
        ...input,
        id: nextId++,
        status: 'pending' as const,
        attempts: 0,
        availableAt: 0,
        transientRetries: 0
      }
      jobs.push(job)
      return job
    }),
    listGuildsWithPending: vi.fn(() =>
      [
        ...new Set(
          jobs.filter((job) => job.status === 'pending' && job.availableAt <= Date.now()).map((job) => job.guildId)
        )
      ].sort()
    ),
    getNextPendingAvailableAt: vi.fn(() => {
      const availableAt = jobs
        .filter((job) => job.status === 'pending' && job.availableAt > Date.now())
        .map((job) => job.availableAt)
        .sort((a, b) => a - b)[0]
      return availableAt
    }),
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
    markFailed: vi.fn((id: number, classification: 'transient' | 'permanent') => {
      const job = jobs.find((candidate) => candidate.id === id && candidate.status === 'processing')
      if (!job) return undefined
      const delays = [60_000, 300_000, 1_200_000, 3_600_000]
      if (classification === 'transient' && job.transientRetries < delays.length) {
        const scheduledDelayMs = delays[job.transientRetries++]
        job.availableAt = Date.now() + scheduledDelayMs
        job.status = 'pending'
        return { status: job.status, scheduledDelayMs }
      }
      job.attempts += 1
      job.status = job.attempts >= 2 ? 'failed' : 'pending'
      job.availableAt = 0
      return { status: job.status, scheduledDelayMs: 0 }
    })
  }
})

vi.mock('../../../storage/extractionQueue.js', () => ({
  enqueueEpisode: mocks.enqueueEpisode,
  listGuildsWithPending: mocks.listGuildsWithPending,
  getNextPendingAvailableAt: mocks.getNextPendingAvailableAt,
  claimNextForGuild: mocks.claimNextForGuild,
  markDone: mocks.markDone,
  markFailed: mocks.markFailed
}))
vi.mock('../../../config.js', () => ({ config: configMock }))
vi.mock('../../shutdownSignal.js', () => ({ isShuttingDown: mocks.isShuttingDown }))
vi.mock('../extractor.js', () => ({ runEpisodePipeline: mocks.runEpisodePipeline }))
vi.mock('../episodePersistence.js', () => ({ persistEpisodeResult: mocks.persistEpisodeResult }))
vi.mock('../factEmbeddings.js', () => ({ embedPendingFacts: mocks.embedPendingFacts }))
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

function enqueueDelayed(guildId: string, content: string, delayMs = 60_000) {
  const job = enqueue(guildId, content)
  job.availableAt = Date.now() + delayMs
  return job
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
    mocks.embedPendingFacts.mockClear()
    mocks.isShuttingDown.mockReturnValue(false)
    mocks.claimNextForGuild.mockClear()
    configMock.memory.privacy = 'relaxed'
  })

  afterEach(() => {
    stopExtractionScheduler()
    vi.useRealTimers()
    configMock.memory.privacy = 'relaxed'
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

  it('retries transient failures after the scheduled delay and logs the classification', async () => {
    mocks.runEpisodePipeline.mockRejectedValueOnce(Object.assign(new Error('service unavailable'), { status: 503 }))
    enqueue('A', 'transient')

    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    for (let settle = 0; settle < 10; settle++) await Promise.resolve()

    expect(mocks.markFailed).toHaveBeenCalledWith(1, 'transient')
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'transient', scheduledDelayMs: 60_000 }),
      'Memory episode pipeline failed'
    )
    expect(mocks.logger.warn.mock.calls[0]?.[0]).not.toHaveProperty('error')
    expect(mocks.runEpisodePipeline).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mocks.runEpisodePipeline).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await drain()
    expect(mocks.runEpisodePipeline).toHaveBeenCalledTimes(2)
  })

  it('wakes for a delayed job when it becomes available', async () => {
    const now = Date.now()
    enqueueDelayed('A', 'delayed')

    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
    expect(mocks.listGuildsWithPending).toHaveBeenCalledWith(now)
    expect(mocks.getNextPendingAvailableAt).toHaveBeenCalledWith(now)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await drain()

    expect(mocks.runEpisodePipeline).toHaveBeenCalledOnce()
  })

  it('drains a new enqueue immediately while a delayed retry is waiting', async () => {
    enqueueDelayed('A', 'delayed')
    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    enqueue('B', 'new')
    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    for (let settle = 0; settle < 10; settle++) await Promise.resolve()

    expect(mocks.runEpisodePipeline.mock.calls.map(([job]) => job.guildId)).toEqual(['B'])
  })

  it('does not drain delayed jobs while privacy is off', async () => {
    enqueueDelayed('A', 'privacy off')
    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    configMock.memory.privacy = 'off'

    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
  })

  it('cancels a delayed drain when stopped', async () => {
    enqueueDelayed('A', 'stopped')
    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    stopExtractionScheduler()

    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
  })

  it('does not drain delayed jobs after shutdown begins', async () => {
    enqueueDelayed('A', 'shutdown')
    startExtractionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    mocks.isShuttingDown.mockReturnValue(true)

    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
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

  it('embeds pending facts after a job is marked done, and not after a failed job', async () => {
    enqueue('A', 'facts')
    startExtractionScheduler()
    await drain()

    expect(mocks.markDone).toHaveBeenCalledOnce()
    expect(mocks.embedPendingFacts).toHaveBeenCalledOnce()
    expect(mocks.embedPendingFacts).toHaveBeenCalledWith({ limit: 20 })

    mocks.embedPendingFacts.mockClear()
    mocks.runEpisodePipeline.mockRejectedValue(new Error('schema mismatch'))
    enqueue('A', 'failing facts')
    startExtractionScheduler()
    await drain()

    expect(mocks.markFailed).toHaveBeenCalled()
    expect(mocks.embedPendingFacts).not.toHaveBeenCalled()
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

  it('claims no job and calls no extractor while memory is off, and resumes once it is back on', async () => {
    enqueue('A', 'queued before the switch')
    configMock.memory.privacy = 'off'

    startExtractionScheduler()
    await drain()

    expect(mocks.claimNextForGuild).not.toHaveBeenCalled()
    expect(mocks.runEpisodePipeline).not.toHaveBeenCalled()
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(mocks.markDone).not.toHaveBeenCalled()
    expect(mocks.jobs).toEqual([expect.objectContaining({ status: 'pending', attempts: 0 })])

    configMock.memory.privacy = 'relaxed'
    startExtractionScheduler()
    await drain()

    expect(mocks.runEpisodePipeline).toHaveBeenCalledOnce()
    expect(mocks.jobs).toHaveLength(0)
  })
})
