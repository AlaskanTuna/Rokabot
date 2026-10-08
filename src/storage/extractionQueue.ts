import { getDb } from './database.js'

export const MAX_EXTRACTION_QUEUE_ATTEMPTS = 2
const TRANSIENT_RETRY_DELAYS = [60_000, 300_000, 1_200_000, 3_600_000]
const UNJUDGED_RETRY_DELAY_MS = 300_000
const DAY_MS = 24 * 60 * 60 * 1000

export type EpisodeLine = Readonly<{
  messageId: string
  userId: string
  displayName: string
  content: string
  timestamp: number
  isBot: boolean
}>

export type ExtractionEpisode = Readonly<{
  messages: readonly EpisodeLine[]
  context: readonly EpisodeLine[]
  startedAt: number
  endedAt: number
}>

export type EpisodeCursor = Readonly<{
  guildId: string
  channelId: string
  lastMessageId: string | null
  openedAt: number | null
  messageCount: number
}>

export type QueueWriteOptions = Readonly<{ transaction?: boolean }>
export type ExtractionFailureClassification = 'transient' | 'permanent' | 'unjudged'
export type ExtractionFailureResult = Readonly<{
  status: 'pending' | 'failed' | 'dropped'
  scheduledDelayMs: number
}>

export type ExtractionQueueJob = Readonly<{
  id: number
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  status: 'pending' | 'processing'
  attempts: number
  transientRetries: number
  enqueuedAt: number
}>

type ExtractionQueueRow = {
  id: number
  guild_id: string
  channel_id: string
  payload: string
  status: 'pending' | 'processing' | 'failed'
  attempts: number
  enqueued_at: number
  available_at: number
  transient_retries: number
}

function mapJob(row: ExtractionQueueRow): ExtractionQueueJob {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    episode: JSON.parse(row.payload) as ExtractionEpisode,
    status: row.status as ExtractionQueueJob['status'],
    attempts: row.attempts,
    transientRetries: row.transient_retries,
    enqueuedAt: row.enqueued_at
  }
}

export function enqueueEpisode(
  input: { guildId: string; channelId: string; episode: ExtractionEpisode },
  options: QueueWriteOptions = {}
): ExtractionQueueJob {
  const write = () => {
    const db = getDb()
    const enqueuedAt = Date.now()
    const payload = JSON.stringify(input.episode)
    const result = db
      .prepare(
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at) VALUES (?, ?, ?, 'pending', ?)"
      )
      .run(input.guildId, input.channelId, payload, enqueuedAt)
    return mapJob({
      id: Number(result.lastInsertRowid),
      guild_id: input.guildId,
      channel_id: input.channelId,
      payload,
      status: 'pending',
      attempts: 0,
      enqueued_at: enqueuedAt,
      available_at: 0,
      transient_retries: 0
    })
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

/** Atomically claims the oldest pending job for a guild. */
export function claimNextForGuild(guildId: string, now = Date.now()): ExtractionQueueJob | undefined {
  return getDb().transaction((): ExtractionQueueJob | undefined => {
    const row = getDb()
      .prepare(
        `SELECT * FROM extraction_queue
           WHERE guild_id = ? AND status = 'pending' AND available_at <= ?
           ORDER BY enqueued_at ASC, id ASC
           LIMIT 1`
      )
      .get(guildId, now) as ExtractionQueueRow | undefined
    if (!row) return undefined

    const claimed = getDb()
      .prepare("UPDATE extraction_queue SET status = 'processing' WHERE id = ? AND status = 'pending'")
      .run(row.id)
    if (claimed.changes === 0) return undefined

    return mapJob({ ...row, status: 'processing' })
  })()
}

/** Returns guild IDs with queued work, in deterministic order for round-robin scheduling. */
export function listGuildsWithPending(now = Date.now()): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT guild_id FROM extraction_queue WHERE status = 'pending' AND available_at <= ? ORDER BY guild_id ASC"
      )
      .all(now) as Array<{ guild_id: string }>
  ).map((row) => row.guild_id)
}

/** Returns the next future availability time for a pending job, if one exists. */
export function getNextPendingAvailableAt(now = Date.now()): number | undefined {
  const row = getDb()
    .prepare(
      "SELECT MIN(available_at) AS available_at FROM extraction_queue WHERE status = 'pending' AND available_at > ?"
    )
    .get(now) as { available_at: number | null }
  return row.available_at ?? undefined
}

/** Removes a processing job after its pipeline result and events have been recorded. */
export function markDone(id: number): boolean {
  return getDb().prepare("DELETE FROM extraction_queue WHERE id = ? AND status = 'processing'").run(id).changes > 0
}

/** Delays transient retries before falling back to the ordinary attempt limit. */
export function markFailed(
  id: number,
  classification: ExtractionFailureClassification = 'permanent'
): ExtractionFailureResult | undefined {
  return getDb().transaction((): ExtractionFailureResult | undefined => {
    const row = getDb().prepare("SELECT * FROM extraction_queue WHERE id = ? AND status = 'processing'").get(id) as
      | ExtractionQueueRow
      | undefined
    if (!row) return undefined

    if (classification === 'unjudged') {
      if (row.attempts > 0) {
        getDb().prepare('DELETE FROM extraction_queue WHERE id = ?').run(id)
        return { status: 'dropped', scheduledDelayMs: 0 }
      }
      getDb()
        .prepare("UPDATE extraction_queue SET status = 'pending', attempts = 1, available_at = ? WHERE id = ?")
        .run(Date.now() + UNJUDGED_RETRY_DELAY_MS, id)
      return { status: 'pending', scheduledDelayMs: UNJUDGED_RETRY_DELAY_MS }
    }

    if (classification === 'transient' && row.transient_retries < TRANSIENT_RETRY_DELAYS.length) {
      const scheduledDelayMs = TRANSIENT_RETRY_DELAYS[row.transient_retries]
      const availableAt = Date.now() + scheduledDelayMs
      getDb()
        .prepare(
          "UPDATE extraction_queue SET status = 'pending', transient_retries = transient_retries + 1, available_at = ? WHERE id = ?"
        )
        .run(availableAt, id)
      return { status: 'pending', scheduledDelayMs }
    }

    const attempts = row.attempts + 1
    const status = attempts >= MAX_EXTRACTION_QUEUE_ATTEMPTS ? 'failed' : 'pending'
    getDb()
      .prepare('UPDATE extraction_queue SET attempts = ?, status = ?, available_at = 0 WHERE id = ?')
      .run(attempts, status, id)
    return { status, scheduledDelayMs: 0 }
  })()
}

/** Deletes failed queue payloads older than the configured retention window. */
export function pruneFailedExtractionJobs(retentionDays: number, now = Date.now()): number {
  const cutoff = now - retentionDays * DAY_MS
  return getDb().prepare("DELETE FROM extraction_queue WHERE status = 'failed' AND enqueued_at < ?").run(cutoff).changes
}

/** Returns processing jobs to pending after a restart. */
export function resetStuckProcessing(): number {
  return getDb().prepare("UPDATE extraction_queue SET status = 'pending' WHERE status = 'processing'").run().changes
}
