import { config } from '../config.js'
import { getDb } from './database.js'
import { enqueueEpisode } from './extractionQueue.js'
import type { EpisodeCursor, EpisodeLine, ExtractionEpisode, ExtractionQueueJob } from './extractionQueue.js'
import { UNKNOWN_FINGERPRINT, embeddingFingerprint } from './vectorProvenance.js'

const LEGACY_GEMINI_FINGERPRINT = embeddingFingerprint('gemini', 'gemini-embedding-2', 768)

export type EpisodeEmbedding = readonly number[]

/** A vector and the embedding space it was made in. Every stored vector carries one. */
export type EmbeddingVector = Readonly<{ values: readonly number[]; modelId: string; dim: number; fingerprint: string }>

export type StoredVector = {
  embedding: Buffer | null
  embedding_dim: number | null
  embedding_fingerprint: string | null
}

export type MemoryEpisode = Readonly<{
  id: number
  guildId: string
  channelId: string
  startedAt: number
  endedAt: number
  summary: string
  embedding: EpisodeEmbedding | null
  createdAt: number
}>

type MemoryEpisodeRow = StoredVector & {
  id: number
  guild_id: string
  channel_id: string
  started_at: number
  ended_at: number
  summary: string
  created_at: number
}

export function encodeFloat32Embedding(vector: EmbeddingVector, label = 'Episode'): Buffer {
  const { values, dim } = vector
  if (
    !Number.isInteger(dim) ||
    dim <= 0 ||
    values.length !== dim ||
    values.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
  ) {
    throw new Error(`${label} embedding must contain ${dim} finite values`)
  }

  const bytes = Buffer.allocUnsafe(dim * 4)
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
  return bytes
}

export function vectorParams(
  vector: EmbeddingVector | null | undefined,
  label?: string
): [Buffer | null, string | null, number | null, string | null] {
  return vector
    ? [encodeFloat32Embedding(vector, label), vector.modelId, vector.dim, vector.fingerprint]
    : [null, null, null, null]
}

// Every vector stored before provenance was recorded came from gemini-embedding-2 at 768 dimensions (#223), so only
// that exact space may still read those.
export function isActiveVector(fingerprint: string | null, dim: number | null, byteLength: number): boolean {
  const active = config.embeddings
  if (dim === null || dim !== active.dim || byteLength !== dim * 4) return false
  return (
    fingerprint === active.fingerprint ||
    (fingerprint === UNKNOWN_FINGERPRINT && active.fingerprint === LEGACY_GEMINI_FINGERPRINT)
  )
}

export function decodeFloat32Embedding(row: StoredVector): EpisodeEmbedding | null {
  const bytes = row.embedding
  if (!bytes || !isActiveVector(row.embedding_fingerprint, row.embedding_dim, bytes.byteLength)) return null

  const values = Array.from({ length: bytes.byteLength / 4 }, (_, index) => bytes.readFloatLE(index * 4))
  const squaredNorm = values.reduce((sum, value) => sum + value * value, 0)
  return values.every(Number.isFinite) && squaredNorm > 0 ? values : null
}

function mapMemoryEpisode(row: MemoryEpisodeRow): MemoryEpisode {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    summary: row.summary,
    embedding: decodeFloat32Embedding(row),
    createdAt: row.created_at
  }
}

type EpisodeCursorRow = {
  guild_id: string
  channel_id: string
  last_message_id: string | null
  opened_at: number | null
  message_count: number
}

function mapCursor(row: EpisodeCursorRow): EpisodeCursor {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    lastMessageId: row.last_message_id,
    openedAt: row.opened_at,
    messageCount: row.message_count
  }
}

export function saveMemoryEpisode(
  input: Omit<MemoryEpisode, 'createdAt' | 'embedding'> & { embedding: EmbeddingVector | null; createdAt?: number }
): MemoryEpisode {
  const createdAt = input.createdAt ?? Date.now()
  const vector = vectorParams(input.embedding)
  const db = getDb()
  const existing = db
    .prepare('SELECT guild_id, channel_id, started_at, ended_at FROM memory_episode WHERE id = ?')
    .get(input.id) as { guild_id: string; channel_id: string; started_at: number; ended_at: number } | undefined

  if (
    existing &&
    (existing.guild_id !== input.guildId ||
      existing.channel_id !== input.channelId ||
      existing.started_at !== input.startedAt ||
      existing.ended_at !== input.endedAt)
  ) {
    throw new Error('Episode queue ID collision')
  }

  db.prepare(
    `INSERT INTO memory_episode (id, guild_id, channel_id, started_at, ended_at, summary, embedding, embedding_model_id,
       embedding_dim, embedding_fingerprint, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, embedding = excluded.embedding,
       embedding_model_id = excluded.embedding_model_id, embedding_dim = excluded.embedding_dim,
       embedding_fingerprint = excluded.embedding_fingerprint, created_at = excluded.created_at`
  ).run(input.id, input.guildId, input.channelId, input.startedAt, input.endedAt, input.summary, ...vector, createdAt)

  return { ...input, embedding: input.embedding?.values ?? null, createdAt }
}

export function listEpisodesForGuild(guildId: string): MemoryEpisode[] {
  const rows = getDb()
    .prepare(
      `SELECT id, guild_id, channel_id, started_at, ended_at, summary, embedding, embedding_dim, embedding_fingerprint,
              created_at
       FROM memory_episode
       WHERE guild_id = ?
       ORDER BY ended_at DESC, id DESC`
    )
    .all(guildId) as MemoryEpisodeRow[]
  return rows.map(mapMemoryEpisode)
}

export function listEpisodeGuildIds(): string[] {
  const rows = getDb().prepare('SELECT DISTINCT guild_id FROM memory_episode ORDER BY guild_id').all() as Array<{
    guild_id: string
  }>
  return rows.map(({ guild_id }) => guild_id)
}

export function pruneExpiredEpisodes(cutoffMs: number): number {
  return getDb().prepare('DELETE FROM memory_episode WHERE ended_at < ?').run(cutoffMs).changes
}

/** Stores a vector only while the summary it was made from is still the stored one. */
export function setEpisodeEmbedding(input: {
  guildId: string
  id: number
  summary: string
  embedding: EmbeddingVector
}): boolean {
  const result = getDb()
    .prepare(
      `UPDATE memory_episode SET embedding = ?, embedding_model_id = ?, embedding_dim = ?, embedding_fingerprint = ?
       WHERE guild_id = ? AND id = ? AND summary = ?`
    )
    .run(...vectorParams(input.embedding), input.guildId, input.id, input.summary)
  return result.changes === 1
}

export function getEpisodeCursor(channelId: string): EpisodeCursor | undefined {
  const row = getDb()
    .prepare(
      'SELECT guild_id, channel_id, last_message_id, opened_at, message_count FROM memory_episode_cursor WHERE channel_id = ?'
    )
    .get(channelId) as EpisodeCursorRow | undefined
  return row ? mapCursor(row) : undefined
}

export function recordOpenEpisodeMessage(input: {
  guildId: string
  channelId: string
  openedAt: number
  line: EpisodeLine
}): EpisodeCursor {
  const db = getDb()
  return db.transaction(() => {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO memory_episode_line
           (channel_id, message_id, guild_id, user_id, display_name, content, timestamp, is_bot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.channelId,
        input.line.messageId,
        input.guildId,
        input.line.userId,
        input.line.displayName,
        input.line.content,
        input.line.timestamp,
        input.line.isBot ? 1 : 0
      )
    if (inserted.changes === 0) return getEpisodeCursor(input.channelId) as EpisodeCursor
    db.prepare(
      `INSERT INTO memory_episode_cursor (channel_id, guild_id, last_message_id, opened_at, message_count)
       VALUES (?, ?, NULL, ?, 1)
       ON CONFLICT(channel_id) DO UPDATE SET
         guild_id = excluded.guild_id,
         opened_at = COALESCE(memory_episode_cursor.opened_at, excluded.opened_at),
         message_count = memory_episode_cursor.message_count + 1`
    ).run(input.channelId, input.guildId, input.openedAt)
    return getEpisodeCursor(input.channelId) as EpisodeCursor
  })()
}

export function enqueueEpisodeAndAdvanceCursor(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  lastMessageId: string
}): ExtractionQueueJob {
  const db = getDb()
  return db.transaction(() => {
    const job = enqueueEpisode(input, { transaction: true })
    if (input.episode.messages.length > 0) {
      const placeholders = input.episode.messages.map(() => '?').join(', ')
      db.prepare(`DELETE FROM memory_episode_line WHERE channel_id = ? AND message_id IN (${placeholders})`).run(
        input.channelId,
        ...input.episode.messages.map((message) => message.messageId)
      )
    }
    const cursor = db
      .prepare(
        `UPDATE memory_episode_cursor
         SET last_message_id = ?, opened_at = NULL, message_count = 0
         WHERE channel_id = ? AND guild_id = ?`
      )
      .run(input.lastMessageId, input.channelId, input.guildId)
    if (cursor.changes !== 1) throw new Error('Episode cursor not found')
    return job
  })()
}

export type SavedOpenEpisodeLine = Readonly<{
  channelId: string
  guildId: string
  messageId: string
  userId: string
  displayName: string
  content: string
  timestamp: number
  isBot: boolean
}>

type OpenEpisodeLineRow = {
  channel_id: string
  guild_id: string
  message_id: string
  user_id: string
  display_name: string
  content: string
  timestamp: number
  is_bot: number
}

/** Open episode lines in capture order: oldest first, ties broken by stable message ID. */
export function listOpenEpisodeLines(): SavedOpenEpisodeLine[] {
  const rows = getDb()
    .prepare(
      `SELECT channel_id, guild_id, message_id, user_id, display_name, content, timestamp, is_bot
       FROM memory_episode_line
       ORDER BY timestamp ASC, message_id COLLATE BINARY ASC`
    )
    .all() as OpenEpisodeLineRow[]
  return rows.map((row) => ({
    channelId: row.channel_id,
    guildId: row.guild_id,
    messageId: row.message_id,
    userId: row.user_id,
    displayName: row.display_name,
    content: row.content,
    timestamp: row.timestamp,
    isBot: row.is_bot !== 0
  }))
}

/** Trust the saved lines over the cursor: a count from before this table covers lines that were never saved. */
export function syncOpenEpisodeCursorsToLineCounts(): void {
  getDb().transaction(() => {
    getDb().exec(`
        UPDATE memory_episode_cursor
        SET message_count = (SELECT COUNT(*) FROM memory_episode_line
                             WHERE memory_episode_line.channel_id = memory_episode_cursor.channel_id),
            opened_at = CASE WHEN (SELECT COUNT(*) FROM memory_episode_line
                                   WHERE memory_episode_line.channel_id = memory_episode_cursor.channel_id) = 0
                             THEN NULL ELSE opened_at END
      `)
  })()
}

/** Privacy off keeps no open text and no open count. */
export function clearSavedOpenEpisodes(): void {
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM memory_episode_line').run()
    getDb().prepare('UPDATE memory_episode_cursor SET opened_at = NULL, message_count = 0').run()
  })()
}
