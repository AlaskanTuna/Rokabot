import { config } from '../config.js'
import { getDb } from './database.js'

export const MAX_EXTRACTION_QUEUE_ATTEMPTS = 3

export type ExtractionPayloadMessage = Readonly<{
  userId: string
  displayName: string
  content: string
}>

export type ExtractionPayload = ReadonlyArray<ExtractionPayloadMessage>

export type ExtractionQueueJob = Readonly<{
  id: number
  guildId: string
  channelId: string
  payload: ExtractionPayload
  status: 'pending' | 'processing'
  attempts: number
  enqueuedAt: number
}>

export type EnqueueExtractionInput = Readonly<{
  guildId: string
  channelId: string
  payload: ExtractionPayload
}>

type ExtractionQueueRow = {
  id: number
  guild_id: string
  channel_id: string
  payload: string
  status: 'pending' | 'processing'
  attempts: number
  enqueued_at: number
}

function mapJob(row: ExtractionQueueRow): ExtractionQueueJob {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    payload: JSON.parse(row.payload) as ExtractionPayload,
    status: row.status,
    attempts: row.attempts,
    enqueuedAt: row.enqueued_at
  }
}

/** Stores an extraction snapshot and evicts the oldest pending work beyond a guild's queue limit. */
export function enqueueExtraction(input: EnqueueExtractionInput): ExtractionQueueJob {
  return getDb().transaction(() => {
    const enqueuedAt = Date.now()
    const result = getDb()
      .prepare(
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at) VALUES (?, ?, ?, 'pending', ?)"
      )
      .run(input.guildId, input.channelId, JSON.stringify(input.payload), enqueuedAt)

    const pending = getDb()
      .prepare("SELECT COUNT(*) AS count FROM extraction_queue WHERE guild_id = ? AND status = 'pending'")
      .get(input.guildId) as { count: number }
    const overflow = pending.count - config.memory.extractionQueueMaxPerGuild

    if (overflow > 0) {
      getDb()
        .prepare(
          `DELETE FROM extraction_queue
             WHERE id IN (
               SELECT id FROM extraction_queue
               WHERE guild_id = ? AND status = 'pending'
               ORDER BY enqueued_at ASC, id ASC
               LIMIT ?
             )`
        )
        .run(input.guildId, overflow)
    }

    return {
      id: Number(result.lastInsertRowid),
      guildId: input.guildId,
      channelId: input.channelId,
      payload: input.payload,
      status: 'pending' as const,
      attempts: 0,
      enqueuedAt
    }
  })()
}

/** Atomically claims the oldest pending job for a guild. */
export function claimNextForGuild(guildId: string): ExtractionQueueJob | undefined {
  return getDb().transaction(() => {
    const row = getDb()
      .prepare(
        `SELECT * FROM extraction_queue
           WHERE guild_id = ? AND status = 'pending'
           ORDER BY enqueued_at ASC, id ASC
           LIMIT 1`
      )
      .get(guildId) as ExtractionQueueRow | undefined
    if (!row) return undefined

    const claimed = getDb()
      .prepare("UPDATE extraction_queue SET status = 'processing' WHERE id = ? AND status = 'pending'")
      .run(row.id)
    if (claimed.changes === 0) return undefined

    return mapJob({ ...row, status: 'processing' })
  })()
}

/** Returns guild IDs with queued work, in deterministic order for round-robin scheduling. */
export function listGuildsWithPending(): string[] {
  return (
    getDb()
      .prepare("SELECT DISTINCT guild_id FROM extraction_queue WHERE status = 'pending' ORDER BY guild_id ASC")
      .all() as Array<{ guild_id: string }>
  ).map((row) => row.guild_id)
}

/** Removes a processing job. Repeating the operation is safe and returns false after the first call. */
export function markDone(id: number): boolean {
  return getDb().prepare("DELETE FROM extraction_queue WHERE id = ? AND status = 'processing'").run(id).changes > 0
}

/** Requeues a failed processing job until its attempt cap is reached, then drops it. */
export function markFailed(id: number): 'pending' | 'dropped' | undefined {
  return getDb().transaction(() => {
    const row = getDb().prepare("SELECT * FROM extraction_queue WHERE id = ? AND status = 'processing'").get(id) as
      | ExtractionQueueRow
      | undefined
    if (!row) return undefined

    const attempts = row.attempts + 1
    if (attempts >= MAX_EXTRACTION_QUEUE_ATTEMPTS) {
      getDb().prepare('DELETE FROM extraction_queue WHERE id = ?').run(id)
      return 'dropped'
    }

    getDb().prepare("UPDATE extraction_queue SET attempts = ?, status = 'pending' WHERE id = ?").run(attempts, id)
    return 'pending'
  })()
}

/** Returns processing jobs to pending after a restart when their persisted age exceeds the threshold. */
export function resetStuckProcessing(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs
  return getDb()
    .prepare("UPDATE extraction_queue SET status = 'pending' WHERE status = 'processing' AND enqueued_at <= ?")
    .run(cutoff).changes
}
