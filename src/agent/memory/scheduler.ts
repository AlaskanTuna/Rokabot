import { config } from '../../config.js'
import {
  claimNextForGuild,
  getNextPendingAvailableAt,
  listGuildsWithPending,
  markDone,
  markFailed
} from '../../storage/extractionQueue.js'
import { logger } from '../../utils/logger.js'
import { isShuttingDown } from '../shutdownSignal.js'
import { persistEpisodeResult } from './episodePersistence.js'
import { classifyExtractionError } from './extractionErrors.js'
import { runEpisodePipeline } from './extractor.js'
import { embedPendingFacts } from './factEmbeddings.js'

let timer: ReturnType<typeof setTimeout> | undefined
let timerDeadline: number | undefined
let lastGuildId: string | undefined
let stopped = false
const inFlightGuilds = new Set<string>()
const inFlightTasks = new Set<Promise<void>>()

function scheduleDrainAt(availableAt: number): void {
  if (stopped || isShuttingDown()) return
  if (timer && timerDeadline !== undefined && timerDeadline <= availableAt) return
  if (timer) clearTimeout(timer)

  timerDeadline = availableAt
  timer = setTimeout(
    () => {
      timer = undefined
      timerDeadline = undefined
      drainOnce()
    },
    Math.max(0, availableAt - Date.now())
  )
  timer.unref?.()
}

function scheduleDrain(): void {
  scheduleDrainAt(Date.now())
}

function orderedGuilds(guildIds: string[]): string[] {
  if (!lastGuildId) return guildIds

  const nextIndex = guildIds.findIndex((guildId) => guildId > lastGuildId!)
  if (nextIndex === -1) return guildIds
  return [...guildIds.slice(nextIndex), ...guildIds.slice(0, nextIndex)]
}

function finishJob(guildId: string): void {
  inFlightGuilds.delete(guildId)
  scheduleDrain()
}

function runJob(job: NonNullable<ReturnType<typeof claimNextForGuild>>): void {
  inFlightGuilds.add(job.guildId)
  const task = runEpisodePipeline(job)
    .then(async (result) => {
      await persistEpisodeResult({ job, result })
      markDone(job.id)
      void embedPendingFacts({ limit: 20 })
    })
    .catch((error: unknown) => {
      const classification = classifyExtractionError(error, { shuttingDown: isShuttingDown() })
      const failure = markFailed(job.id, classification)
      logger.warn(
        {
          guildId: job.guildId,
          channelId: job.channelId,
          jobId: job.id,
          classification,
          scheduledDelayMs: failure?.scheduledDelayMs ?? 0
        },
        'Memory episode pipeline failed'
      )
    })
    .finally(() => {
      inFlightTasks.delete(task)
      finishJob(job.guildId)
    })
  inFlightTasks.add(task)
}

function drainOnce(): void {
  if (stopped || isShuttingDown() || config.memory.privacy === 'off') return

  const now = Date.now()
  const guildId = orderedGuilds(listGuildsWithPending(now).filter((id) => !inFlightGuilds.has(id)))[0]
  if (!guildId) {
    const nextAvailableAt = getNextPendingAvailableAt(now)
    if (nextAvailableAt !== undefined) scheduleDrainAt(nextAvailableAt)
    return
  }

  const job = claimNextForGuild(guildId, now)
  if (!job) {
    scheduleDrain()
    return
  }

  lastGuildId = guildId
  runJob(job)
  scheduleDrain()
}

/** Starts the lazy in-process drain loop; safe to call repeatedly. */
export function startExtractionScheduler(): void {
  if (isShuttingDown()) return
  stopped = false
  scheduleDrain()
}

/** Stops future queue drains without interrupting an extraction already in flight. */
export function stopExtractionScheduler(): void {
  stopped = true
  if (!timer) return
  clearTimeout(timer)
  timer = undefined
  timerDeadline = undefined
}

export async function waitForInFlightExtractions(): Promise<void> {
  while (inFlightTasks.size > 0) await Promise.all([...inFlightTasks])
}

/** Clears scheduler state for deterministic tests. */
export function resetForTest(): void {
  stopExtractionScheduler()
  lastGuildId = undefined
  inFlightGuilds.clear()
}
