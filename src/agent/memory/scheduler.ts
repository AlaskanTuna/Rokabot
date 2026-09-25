import { claimNextForGuild, listGuildsWithPending, markDone, markFailed } from '../../storage/extractionQueue.js'
import { logger } from '../../utils/logger.js'
import { isShuttingDown } from '../shutdownSignal.js'
import { persistEpisodeResult } from './episodePersistence.js'
import { runEpisodePipeline } from './extractor.js'

let timer: ReturnType<typeof setTimeout> | undefined
let lastGuildId: string | undefined
let stopped = false
const inFlightGuilds = new Set<string>()
const inFlightTasks = new Set<Promise<void>>()

function scheduleDrain(): void {
  if (timer || stopped || isShuttingDown()) return

  timer = setTimeout(() => {
    timer = undefined
    drainOnce()
  }, 0)
  timer.unref?.()
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
    })
    .catch((error: unknown) => {
      markFailed(job.id)
      logger.warn(
        { guildId: job.guildId, channelId: job.channelId, jobId: job.id, error },
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
  if (stopped || isShuttingDown()) return

  const guildId = orderedGuilds(listGuildsWithPending().filter((id) => !inFlightGuilds.has(id)))[0]
  if (!guildId) return

  const job = claimNextForGuild(guildId)
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
