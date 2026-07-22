import { config } from '../../config.js'
import {
  type ExtractionQueueJob,
  claimNextForGuild,
  enqueueExtraction,
  listGuildsWithPending,
  markDone,
  markFailed
} from '../../storage/extractionQueue.js'
import { logger } from '../../utils/logger.js'
import { getSharedRateLimiter } from '../../utils/rateLimiter.js'
import { isShuttingDown } from '../shutdownSignal.js'
import { type ExtractionJob, runExtraction } from './extractor.js'

type ExtractionLimiter = Readonly<{
  remainingRpm: number
  remainingRpd: number
}>

export type SchedulerJob = ExtractionJob

export type SchedulerTestDependencies = Readonly<{
  now?: () => number
  limiter?: ExtractionLimiter
}>

let timer: ReturnType<typeof setTimeout> | undefined
let lastGuildId: string | undefined
let dailyExtractionCount = 0
let dailyDate: string | undefined
let now = () => Date.now()
let limiter: ExtractionLimiter | undefined
const lastRunAt = new Map<string, number>()

function localDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function resetDailyBudget(timestamp: number): void {
  const currentDate = localDate(timestamp)
  if (dailyDate !== currentDate) {
    dailyDate = currentDate
    dailyExtractionCount = 0
  }
}

function dailyBudget(): number {
  return Math.floor(config.rateLimit.rpd * config.memory.extractionDailyBudgetRatio)
}

function msUntilLocalMidnight(timestamp: number): number {
  const midnight = new Date(timestamp)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(1, midnight.getTime() - timestamp)
}

function schedulerLimiter(): ExtractionLimiter {
  return limiter ?? getSharedRateLimiter(config.rateLimit)
}

function hasExtractionHeadroom(): boolean {
  const currentLimiter = schedulerLimiter()
  return currentLimiter.remainingRpm >= config.gemini.extractionRpmFloor && currentLimiter.remainingRpd > 0
}

function scheduleDrain(delayMs = 0): void {
  if (timer || isShuttingDown()) return

  timer = setTimeout(() => {
    timer = undefined
    drainOnce()
  }, delayMs)
  timer.unref?.()
}

function orderedGuilds(guildIds: string[]): string[] {
  if (!lastGuildId) return guildIds

  const nextIndex = guildIds.findIndex((guildId) => guildId > lastGuildId!)
  if (nextIndex === -1) return guildIds
  return [...guildIds.slice(nextIndex), ...guildIds.slice(0, nextIndex)]
}

function nextGapDelay(guildIds: string[], timestamp: number): number {
  return Math.min(
    ...guildIds.map((guildId) => {
      const lastRun = lastRunAt.get(guildId)
      return lastRun === undefined ? 0 : Math.max(0, lastRun + config.memory.perGuildGapMs - timestamp)
    })
  )
}

function completeJob(job: ExtractionQueueJob): void {
  void runExtraction({ guildId: job.guildId, channelId: job.channelId, messages: job.payload })
    .then(() => {
      markDone(job.id)
    })
    .catch((error: unknown) => {
      markFailed(job.id)
      logger.warn(
        { guildId: job.guildId, channelId: job.channelId, jobId: job.id, error },
        'Memory extraction scheduler failed'
      )
    })
    .finally(() => {
      startExtractionScheduler()
    })
}

function drainOnce(): void {
  if (isShuttingDown()) return

  const timestamp = now()
  resetDailyBudget(timestamp)
  const guildIds = listGuildsWithPending()
  if (guildIds.length === 0) return

  if (dailyExtractionCount >= dailyBudget()) {
    logger.debug({ dailyExtractionCount, dailyBudget: dailyBudget() }, 'Memory extraction daily budget exhausted')
    scheduleDrain(msUntilLocalMidnight(timestamp))
    return
  }

  if (!hasExtractionHeadroom()) {
    logger.debug(
      { extractionRpmFloor: config.gemini.extractionRpmFloor },
      'Memory extraction deferred for live traffic'
    )
    scheduleDrain(1_000)
    return
  }

  const eligibleGuildId = orderedGuilds(guildIds).find((guildId) => {
    const lastRun = lastRunAt.get(guildId)
    return lastRun === undefined || timestamp - lastRun >= config.memory.perGuildGapMs
  })

  if (!eligibleGuildId) {
    scheduleDrain(nextGapDelay(guildIds, timestamp))
    return
  }

  const job = claimNextForGuild(eligibleGuildId)
  if (!job) {
    scheduleDrain()
    return
  }

  lastGuildId = eligibleGuildId
  lastRunAt.set(eligibleGuildId, timestamp)
  dailyExtractionCount += 1
  completeJob(job)

  if (listGuildsWithPending().length > 0) scheduleDrain()
}

/** Starts the lazy in-process drain loop; safe to call repeatedly. */
export function startExtractionScheduler(): void {
  scheduleDrain()
}

/** Stops future queue drains without interrupting an extraction already in flight. */
export function stopExtractionScheduler(): void {
  if (!timer) return
  clearTimeout(timer)
  timer = undefined
}

/** Enqueues a claim-extraction batch and starts the scheduler when necessary. */
export function enqueueAndSchedule(job: SchedulerJob): void {
  enqueueExtraction({ guildId: job.guildId, channelId: job.channelId, payload: job.messages })
  startExtractionScheduler()
}

/** Overrides time and rate-limit reads for deterministic scheduler tests. */
export function configureForTest(dependencies: SchedulerTestDependencies): void {
  now = dependencies.now ?? (() => Date.now())
  limiter = dependencies.limiter
}

/** Clears scheduler state and test overrides. */
export function resetForTest(): void {
  stopExtractionScheduler()
  lastGuildId = undefined
  dailyExtractionCount = 0
  dailyDate = undefined
  lastRunAt.clear()
  now = () => Date.now()
  limiter = undefined
}
