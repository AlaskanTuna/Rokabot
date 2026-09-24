import { getDb } from './database.js'
import { enqueueEpisode } from './extractionQueue.js'
import type { EpisodeCursor, ExtractionEpisode, ExtractionQueueJob } from './extractionQueue.js'

export type EpisodeEmbedding = readonly number[]

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

type MemoryEpisodeRow = {
  id: number
  guild_id: string
  channel_id: string
  started_at: number
  ended_at: number
  summary: string
  embedding: Buffer | null
  created_at: number
}

const EMBEDDING_DIMENSIONS = 768
const EMBEDDING_BYTES = EMBEDDING_DIMENSIONS * 4

function encodeEmbedding(values: EpisodeEmbedding): Buffer {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
  ) {
    throw new Error('Episode embedding must contain 768 finite values')
  }

  const bytes = Buffer.allocUnsafe(EMBEDDING_BYTES)
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
  return bytes
}

function decodeEmbedding(bytes: Buffer | null): EpisodeEmbedding | null {
  if (!bytes || bytes.byteLength !== EMBEDDING_BYTES) return null

  const values = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => bytes.readFloatLE(index * 4))
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
    embedding: decodeEmbedding(row.embedding),
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

export function saveMemoryEpisode(input: Omit<MemoryEpisode, 'createdAt'> & { createdAt?: number }): MemoryEpisode {
  const createdAt = input.createdAt ?? Date.now()
  const embedding = input.embedding ? encodeEmbedding(input.embedding) : null
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
    `INSERT INTO memory_episode (id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, embedding = excluded.embedding, created_at = excluded.created_at`
  ).run(input.id, input.guildId, input.channelId, input.startedAt, input.endedAt, input.summary, embedding, createdAt)

  return { ...input, embedding: input.embedding ?? null, createdAt }
}

export function listEpisodesForGuild(guildId: string): MemoryEpisode[] {
  const rows = getDb()
    .prepare(
      `SELECT id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at
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
}): EpisodeCursor {
  const db = getDb()
  db.prepare(
    `INSERT INTO memory_episode_cursor (channel_id, guild_id, last_message_id, opened_at, message_count)
     VALUES (?, ?, NULL, ?, 1)
     ON CONFLICT(channel_id) DO UPDATE SET
       guild_id = excluded.guild_id,
       opened_at = COALESCE(memory_episode_cursor.opened_at, excluded.opened_at),
       message_count = memory_episode_cursor.message_count + 1`
  ).run(input.channelId, input.guildId, input.openedAt)
  return getEpisodeCursor(input.channelId) as EpisodeCursor
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
