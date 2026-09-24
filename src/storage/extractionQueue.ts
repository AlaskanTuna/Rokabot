import { config } from '../config.js'
import { getDb } from './database.js'

export const MAX_EXTRACTION_QUEUE_ATTEMPTS = 3

export type ExtractionPayloadMessage = Readonly<{
  userId: string
  displayName: string
  content: string
}>

export type ExtractionPayload = ReadonlyArray<ExtractionPayloadMessage>

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
  payload: ExtractionPayload
  status: 'pending' | 'processing'
  attempts: number
  enqueuedAt: number
  admittedBy?: 'jev'
}>

export type EnqueueExtractionInput = Readonly<{
  guildId: string
  channelId: string
  payload: ExtractionPayload
  admittedBy?: 'jev'
}>

type ExtractionQueueRow = {
  id: number
  guild_id: string
  channel_id: string
  payload: string
  status: 'pending' | 'processing'
  attempts: number
  enqueued_at: number
  admitted_by: 'jev' | null
}

function payloadFromEpisode(episode: ExtractionEpisode): ExtractionPayload {
  return episode.messages.map(({ userId, displayName, content }) => ({ userId, displayName, content }))
}

function episodeFromRow(row: ExtractionQueueRow): ExtractionEpisode {
  const payload: unknown = JSON.parse(row.payload)
  if (Array.isArray(payload)) {
    const messages = payload.map((message, index) => ({
      ...(message as ExtractionPayloadMessage),
      messageId: `legacy-${row.id}-${index}`,
      timestamp: row.enqueued_at,
      isBot: false
    }))
    return { messages, context: [], startedAt: row.enqueued_at, endedAt: row.enqueued_at }
  }
  return payload as ExtractionEpisode
}

function mapJob(row: ExtractionQueueRow): ExtractionQueueJob {
  const episode = episodeFromRow(row)
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    episode,
    payload: payloadFromEpisode(episode),
    status: row.status,
    attempts: row.attempts,
    enqueuedAt: row.enqueued_at,
    ...(row.admitted_by === 'jev' ? { admittedBy: 'jev' as const } : {})
  }
}

/** Stores an extraction snapshot and evicts the oldest pending work beyond a guild's queue limit. */
export function enqueueExtraction(input: EnqueueExtractionInput): ExtractionQueueJob {
  return getDb().transaction(() => {
    const db = getDb()
    const enqueuedAt = Date.now()
    const result = db
      .prepare(
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at, admitted_by) VALUES (?, ?, ?, 'pending', ?, ?)"
      )
      .run(input.guildId, input.channelId, JSON.stringify(input.payload), enqueuedAt, input.admittedBy ?? null)

    const pending = db
      .prepare("SELECT COUNT(*) AS count FROM extraction_queue WHERE guild_id = ? AND status = 'pending'")
      .get(input.guildId) as { count: number }
    const overflow = pending.count - config.memory.extractionQueueMaxPerGuild

    if (overflow > 0) {
      db.prepare(
        `DELETE FROM extraction_queue
             WHERE id IN (
               SELECT id FROM extraction_queue
               WHERE guild_id = ? AND status = 'pending'
               ORDER BY enqueued_at ASC, id ASC
               LIMIT ?
             )`
      ).run(input.guildId, overflow)
    }

    return mapJob({
      id: Number(result.lastInsertRowid),
      guild_id: input.guildId,
      channel_id: input.channelId,
      payload: JSON.stringify(input.payload),
      status: 'pending' as const,
      attempts: 0,
      enqueued_at: enqueuedAt,
      admitted_by: input.admittedBy ?? null
    })
  })()
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
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at, admitted_by) VALUES (?, ?, ?, 'pending', ?, NULL)"
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
      admitted_by: null
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
