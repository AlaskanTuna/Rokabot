import { getDb } from './database.js'
import { decodeFloat32Embedding, encodeFloat32Embedding } from './memoryEpisodeStore.js'

export type MediaOrigin = 'upload' | 'reply' | 'forward' | 'link'

export type StoredMediaDigest = Readonly<{
  id: number
  guildId: string
  contentKey: string
  kind: 'audio' | 'video'
  label: string
  summary: string
  digestJson: string
  embedding: readonly number[] | null
  createdAt: number
  lastSharedAt: number
}>

type MediaDigestRow = {
  id: number
  guild_id: string
  content_key: string
  kind: 'audio' | 'video'
  label: string
  summary: string
  digest_json: string
  embedding: Buffer | null
  created_at: number
  last_shared_at: number | null
}

function isDirectMessageGuild(guildId: string): boolean {
  return guildId.startsWith('dm:')
}

function mapMediaDigest(row: MediaDigestRow): StoredMediaDigest {
  return {
    id: row.id,
    guildId: row.guild_id,
    contentKey: row.content_key,
    kind: row.kind,
    label: row.label,
    summary: row.summary,
    digestJson: row.digest_json,
    embedding: decodeFloat32Embedding(row.embedding),
    createdAt: row.created_at,
    lastSharedAt: row.last_shared_at ?? row.created_at
  }
}

function mediaDigestSelect(where: string): string {
  return `
    SELECT d.id, d.guild_id, d.content_key, d.kind, d.label, d.summary, d.digest_json,
           d.embedding, d.created_at, MAX(o.observed_at) AS last_shared_at
    FROM media_digest d
    LEFT JOIN media_occurrence o ON o.digest_id = d.id AND o.guild_id = d.guild_id
    ${where}
    GROUP BY d.id
  `
}

export function saveMediaDigest(input: {
  guildId: string
  contentKey: string
  kind: 'audio' | 'video'
  label: string
  summary: string
  digestJson: string
  embedding?: readonly number[] | null
  createdAt?: number
}): StoredMediaDigest | null {
  if (isDirectMessageGuild(input.guildId)) return null

  const db = getDb()
  const createdAt = input.createdAt ?? Date.now()
  const embedding = input.embedding == null ? null : encodeFloat32Embedding(input.embedding, 'Media')
  db.prepare(
    `INSERT INTO media_digest (guild_id, content_key, kind, label, summary, digest_json, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, content_key) DO UPDATE SET
       kind = excluded.kind,
       label = excluded.label,
       summary = excluded.summary,
       digest_json = excluded.digest_json,
       embedding = CASE WHEN ? THEN excluded.embedding ELSE media_digest.embedding END,
       created_at = excluded.created_at`
  ).run(
    input.guildId,
    input.contentKey,
    input.kind,
    input.label,
    input.summary,
    input.digestJson,
    embedding,
    createdAt,
    input.embedding !== undefined ? 1 : 0
  )

  return findMediaDigest(input.guildId, input.contentKey)
}

export function findMediaDigest(guildId: string, contentKey: string): StoredMediaDigest | null {
  if (isDirectMessageGuild(guildId)) return null

  const row = getDb()
    .prepare(mediaDigestSelect('WHERE d.guild_id = ? AND d.content_key = ?'))
    .get(guildId, contentKey) as MediaDigestRow | undefined
  return row ? mapMediaDigest(row) : null
}

export function recordMediaOccurrence(input: {
  digestId: number
  guildId: string
  channelId: string
  messageId: string
  sharedByUserId: string
  sourceAuthorId: string | null
  origin: MediaOrigin
  observedAt?: number
}): void {
  if (isDirectMessageGuild(input.guildId)) return

  const db = getDb()
  const digest = db.prepare('SELECT guild_id FROM media_digest WHERE id = ?').get(input.digestId) as
    | { guild_id: string }
    | undefined
  if (!digest) throw new Error('Media digest not found')
  if (digest.guild_id !== input.guildId) throw new Error('Media digest guild mismatch')

  db.prepare(
    `INSERT OR IGNORE INTO media_occurrence
      (digest_id, guild_id, channel_id, message_id, shared_by_user_id, source_author_id, origin, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.digestId,
    input.guildId,
    input.channelId,
    input.messageId,
    input.sharedByUserId,
    input.sourceAuthorId,
    input.origin,
    input.observedAt ?? Date.now()
  )
}

export function listMediaDigestsForGuild(guildId: string): StoredMediaDigest[] {
  if (isDirectMessageGuild(guildId)) return []

  const rows = getDb()
    .prepare(`${mediaDigestSelect('WHERE d.guild_id = ?')} ORDER BY d.id`)
    .all(guildId) as MediaDigestRow[]
  return rows.map(mapMediaDigest)
}

export function listMediaGuildIds(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT guild_id FROM media_digest WHERE guild_id NOT LIKE 'dm:%' ORDER BY guild_id")
    .all() as Array<{ guild_id: string }>
  return rows.map(({ guild_id }) => guild_id)
}

export function setMediaDigestEmbedding(input: {
  guildId: string
  id: number
  embedding: readonly number[]
}): boolean {
  if (isDirectMessageGuild(input.guildId)) return false

  const result = getDb()
    .prepare('UPDATE media_digest SET embedding = ? WHERE guild_id = ? AND id = ?')
    .run(encodeFloat32Embedding(input.embedding, 'Media'), input.guildId, input.id)
  return result.changes === 1
}

export function pruneExpiredMediaDigests(cutoffMs: number): number {
  const db = getDb()
  return db.transaction(() => {
    db.prepare('DELETE FROM media_occurrence WHERE observed_at < ?').run(cutoffMs)
    return db
      .prepare(
        'DELETE FROM media_digest WHERE NOT EXISTS (SELECT 1 FROM media_occurrence WHERE digest_id = media_digest.id)'
      )
      .run().changes
  })()
}

export function findMediaSharedBy(
  guildId: string,
  userId: string,
  terms: string[],
  limit: number
): StoredMediaDigest[] {
  if (isDirectMessageGuild(guildId) || limit <= 0) return []

  const rows = getDb()
    .prepare(
      `${mediaDigestSelect(`
         WHERE d.guild_id = ?
           AND EXISTS (
             SELECT 1 FROM media_occurrence matching_occurrence
             WHERE matching_occurrence.digest_id = d.id
               AND matching_occurrence.guild_id = d.guild_id
               AND (matching_occurrence.shared_by_user_id = ? OR matching_occurrence.source_author_id = ?)
           )
       `)}
       ORDER BY d.id`
    )
    .all(guildId, userId, userId) as MediaDigestRow[]
  const normalizedTerms = terms.map((term) => term.toLowerCase())
  return rows
    .filter(({ label, summary }) => {
      const normalizedLabel = label.toLowerCase()
      const normalizedSummary = summary.toLowerCase()
      return normalizedTerms.every((term) => normalizedLabel.includes(term) || normalizedSummary.includes(term))
    })
    .slice(0, Math.floor(limit))
    .map(mapMediaDigest)
}

export function forgetMediaForUser(guildId: string, userId: string, digestIds: number[]): number {
  if (isDirectMessageGuild(guildId) || digestIds.length === 0) return 0

  const db = getDb()
  const placeholders = digestIds.map(() => '?').join(', ')
  return db.transaction(() => {
    const touchedRows = db
      .prepare(
        `SELECT DISTINCT digest_id FROM media_occurrence
         WHERE guild_id = ? AND (shared_by_user_id = ? OR source_author_id = ?)
           AND digest_id IN (${placeholders})`
      )
      .all(guildId, userId, userId, ...digestIds) as Array<{ digest_id: number }>
    if (touchedRows.length === 0) return 0

    db.prepare(
      `DELETE FROM media_occurrence
       WHERE guild_id = ? AND (shared_by_user_id = ? OR source_author_id = ?)
         AND digest_id IN (${placeholders})`
    ).run(guildId, userId, userId, ...digestIds)
    db.prepare(
      `DELETE FROM media_digest
       WHERE guild_id = ? AND id IN (${placeholders})
         AND NOT EXISTS (SELECT 1 FROM media_occurrence WHERE digest_id = media_digest.id)`
    ).run(guildId, ...digestIds)
    return touchedRows.length
  })()
}
