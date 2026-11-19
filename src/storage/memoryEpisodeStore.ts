import { config } from '../config.js'
import { getDb } from './database.js'
import { enqueueEpisode } from './extractionQueue.js'
import type { EpisodeCursor, EpisodeLine, ExtractionEpisode, ExtractionQueueJob } from './extractionQueue.js'
import {
  decodeMemoryItemEmbedding,
  deleteMemoryItem,
  insertMemoryItem,
  updateMemoryItem,
  writeMemoryItemEmbedding
} from './memoryItemStore.js'
import { encodeFloat32Embedding, vectorParams } from './memoryVector.js'
import { UNKNOWN_FINGERPRINT, embeddingFingerprint } from './vectorProvenance.js'

export { encodeFloat32Embedding, vectorParams } from './memoryVector.js'

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
  if (config.memory.store === 'item') return saveItemMemoryEpisode(input, createdAt)
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

function saveItemMemoryEpisode(
  input: Omit<MemoryEpisode, 'createdAt' | 'embedding'> & { embedding: EmbeddingVector | null; createdAt?: number },
  createdAt: number
): MemoryEpisode {
  const database = getDb()
  database.transaction(() => {
    const existing = database
      .prepare(`
        SELECT item.id, item.guild_id, item.content, item.first_seen_at, item.last_seen_at, item.created_at, item.version,
               occurrence.channel_id, occurrence.span_start, occurrence.observed_at
        FROM memory_item item
        LEFT JOIN memory_item_occurrence occurrence ON occurrence.item_id = item.id AND occurrence.origin = 'episode'
        WHERE item.kind = 'episode' AND item.source_job_id = ?
      `)
      .get(input.id) as
      | {
          id: number
          guild_id: string
          content: string
          first_seen_at: number
          last_seen_at: number
          created_at: number | null
          version: number
          channel_id: string | null
          span_start: number | null
          observed_at: number | null
        }
      | undefined
    if (
      existing &&
      (existing.guild_id !== input.guildId ||
        existing.channel_id !== input.channelId ||
        existing.span_start !== input.startedAt ||
        existing.observed_at !== input.endedAt)
    ) {
      throw new Error('Episode queue ID collision')
    }
    const itemId = existing
      ? existing.id
      : insertMemoryItem(database, {
          guild_id: input.guildId,
          kind: 'episode',
          subject_kind: 'guild',
          subject_user_id: null,
          predicate: null,
          content: input.summary,
          label: null,
          media_kind: null,
          content_key: null,
          source_job_id: input.id,
          period: 'current',
          object_kind: null,
          object_user_id: null,
          source_kind: null,
          status: 'active',
          needs_review: 0,
          end_reason: null,
          ended_at: null,
          superseded_by: null,
          confidence: null,
          salience: null,
          pinned: 0,
          valid_until: null,
          event_date: null,
          first_seen_at: input.startedAt,
          last_seen_at: input.endedAt,
          last_recalled_at: null,
          created_at: createdAt,
          legacy_table: null,
          legacy_id: null,
          legacy_embedding_text: null
        })
    if (existing) {
      updateMemoryItem(database, itemId, {
        content: input.summary,
        first_seen_at: input.startedAt,
        last_seen_at: input.endedAt,
        created_at: createdAt,
        version: existing.version + (existing.content === input.summary ? 0 : 1)
      })
    }
    const occurrence = database
      .prepare("SELECT id FROM memory_item_occurrence WHERE item_id = ? AND origin = 'episode'")
      .get(itemId) as { id: number } | undefined
    if (occurrence) {
      database
        .prepare(
          'UPDATE memory_item_occurrence SET guild_id = ?, channel_id = ?, span_start = ?, observed_at = ? WHERE id = ?'
        )
        .run(input.guildId, input.channelId, input.startedAt, input.endedAt, occurrence.id)
    } else {
      database
        .prepare(`
          INSERT INTO memory_item_occurrence
            (item_id, guild_id, channel_id, origin, message_id, shared_by_user_id, source_author_id, span_start, observed_at)
          VALUES (?, ?, ?, 'episode', NULL, NULL, NULL, ?, ?)
        `)
        .run(itemId, input.guildId, input.channelId, input.startedAt, input.endedAt)
    }
    if (input.embedding) {
      const [vector, modelId, dim, fingerprint] = vectorParams(input.embedding)
      writeMemoryItemEmbedding(database, {
        itemId,
        fingerprint: fingerprint ?? UNKNOWN_FINGERPRINT,
        modelId,
        dim: dim ?? input.embedding.dim,
        renderer: 'summary',
        text: input.summary,
        vector: vector as Buffer
      })
    } else {
      database.prepare('DELETE FROM memory_item_embedding WHERE item_id = ?').run(itemId)
    }
  })()
  return { ...input, embedding: input.embedding?.values ?? null, createdAt }
}

export function listEpisodesForGuild(guildId: string): MemoryEpisode[] {
  if (config.memory.store === 'item') {
    const rows = getDb()
      .prepare(`
        SELECT item.source_job_id AS id, item.guild_id, occurrence.channel_id, item.first_seen_at AS started_at,
               item.last_seen_at AS ended_at, item.content AS summary, item.created_at,
               embedding.fingerprint AS embedding_fingerprint, embedding.dim AS embedding_dim,
               embedding.text_hash AS embedding_text_hash, embedding.vector AS embedding
        FROM memory_item item
        JOIN memory_item_occurrence occurrence ON occurrence.item_id = item.id AND occurrence.origin = 'episode'
        LEFT JOIN memory_item_embedding embedding ON embedding.item_id = item.id
        WHERE item.guild_id = ? AND item.kind = 'episode'
        ORDER BY item.last_seen_at DESC, item.source_job_id DESC
      `)
      .all(guildId) as Array<
      MemoryEpisodeRow & {
        embedding_fingerprint: string | null
        embedding_dim: number | null
        embedding_text_hash: string | null
      }
    >
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: row.summary,
      embedding: row.embedding
        ? decodeMemoryItemEmbedding(
            {
              fingerprint: row.embedding_fingerprint ?? UNKNOWN_FINGERPRINT,
              model_id: null,
              dim: row.embedding_dim ?? 0,
              renderer: 'summary',
              renderer_version: 1,
              text_hash: row.embedding_text_hash,
              vector: row.embedding
            },
            row.summary,
            'summary'
          )
        : null,
      createdAt: row.created_at
    }))
  }
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
  if (config.memory.store === 'item') {
    const rows = getDb()
      .prepare("SELECT DISTINCT guild_id FROM memory_item WHERE kind = 'episode' ORDER BY guild_id")
      .all() as Array<{ guild_id: string }>
    return rows.map(({ guild_id }) => guild_id)
  }
  const rows = getDb().prepare('SELECT DISTINCT guild_id FROM memory_episode ORDER BY guild_id').all() as Array<{
    guild_id: string
  }>
  return rows.map(({ guild_id }) => guild_id)
}

export function pruneExpiredEpisodes(cutoffMs: number): number {
  if (config.memory.store === 'item') {
    const database = getDb()
    return database.transaction(() => {
      const expired = database
        .prepare("SELECT id FROM memory_item WHERE kind = 'episode' AND last_seen_at < ?")
        .all(cutoffMs) as Array<{ id: number }>
      for (const { id } of expired) deleteMemoryItem(database, id)
      return expired.length
    })()
  }
  return getDb().prepare('DELETE FROM memory_episode WHERE ended_at < ?').run(cutoffMs).changes
}

/** Stores a vector only while the summary it was made from is still the stored one. */
export function setEpisodeEmbedding(input: {
  guildId: string
  id: number
  summary: string
  embedding: EmbeddingVector
}): boolean {
  if (config.memory.store === 'item') {
    const database = getDb()
    return database.transaction(() => {
      const row = database
        .prepare(
          "SELECT id FROM memory_item WHERE guild_id = ? AND kind = 'episode' AND source_job_id = ? AND content = ?"
        )
        .get(input.guildId, input.id, input.summary) as { id: number } | undefined
      if (!row) return false
      const [vector, modelId, dim, fingerprint] = vectorParams(input.embedding)
      writeMemoryItemEmbedding(database, {
        itemId: row.id,
        fingerprint: fingerprint ?? UNKNOWN_FINGERPRINT,
        modelId,
        dim: dim ?? input.embedding.dim,
        renderer: 'summary',
        text: input.summary,
        vector: vector as Buffer
      })
      return true
    })()
  }
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
