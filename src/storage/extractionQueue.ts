import { getDb } from './database.js'

export const MAX_EXTRACTION_QUEUE_ATTEMPTS = 2

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

export type ExtractionQueueJob = Readonly<{
  id: number
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  status: 'pending' | 'processing'
  attempts: number
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
}

function mapJob(row: ExtractionQueueRow): ExtractionQueueJob {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    episode: JSON.parse(row.payload) as ExtractionEpisode,
    status: row.status as ExtractionQueueJob['status'],
    attempts: row.attempts,
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
      enqueued_at: enqueuedAt
    })
  }
  return options.transaction ? write() : getDb().transaction(write)()
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

/** Removes a processing job after its pipeline result and events have been recorded. */
export function markDone(id: number): boolean {
  return getDb().prepare("DELETE FROM extraction_queue WHERE id = ? AND status = 'processing'").run(id).changes > 0
}

/** Requeues once, then retains the failed job for inspection. */
export function markFailed(id: number): 'pending' | 'failed' | undefined {
  return getDb().transaction(() => {
    const row = getDb().prepare("SELECT * FROM extraction_queue WHERE id = ? AND status = 'processing'").get(id) as
      | ExtractionQueueRow
      | undefined
    if (!row) return undefined

    const attempts = row.attempts + 1
    const status = attempts >= MAX_EXTRACTION_QUEUE_ATTEMPTS ? 'failed' : 'pending'
    getDb().prepare('UPDATE extraction_queue SET attempts = ?, status = ? WHERE id = ?').run(attempts, status, id)
    return status
  })()
}

/** Returns processing jobs to pending after a restart when their persisted age exceeds the threshold. */
export function resetStuckProcessing(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs
  return getDb()
    .prepare("UPDATE extraction_queue SET status = 'pending' WHERE status = 'processing' AND enqueued_at <= ?")
    .run(cutoff).changes
}
