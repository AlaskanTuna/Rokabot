import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { renderFactSentence } from '../agent/memory/factSentences.js'
import type { GuildMemoryClaim, UserMemoryClaim } from '../agent/memory/memoryClaims.js'
import { type RecallScope, canRecall } from '../agent/memory/privacy.js'
import {
  type RetrieveForTurnInput,
  type SubjectRetrievalSnapshot,
  type TurnRetrievalSnapshot
} from '../agent/memory/retriever.js'
import { config } from '../config.js'
import type { MediaRecallCandidate } from './mediaDigestStore.js'
import type { MemoryEpisode } from './memoryEpisodeStore.js'
import { type EpisodeEmbedding, isActiveVector } from './memoryEpisodeStore.js'
import { getAllUserNames } from './userNames.js'

type ItemFactRow = Readonly<{
  id: number
  guild_id: string
  subject_kind: 'user' | 'guild'
  subject_user_id: string | null
  predicate: string
  value: string
  object_kind: 'user' | null
  object_user_id: string | null
  source_kind: string
  status: string
  period: string
  confidence: number
  salience: number
  pinned: number
  needs_review: number
  superseded_by: number | null
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
  valid_until: number | null
  event_date: string | null
}>

type MemoryItemEmbeddingRow = Readonly<{
  fingerprint: string
  model_id: string | null
  dim: number
  renderer: 'fact_sentence' | 'summary'
  renderer_version: number
  text_hash: string | null
  vector: Buffer
}>

type EpisodeItemRow = Readonly<{
  id: number
  guild_id: string
  content: string
  first_seen_at: number
  last_seen_at: number
  created_at: number
  channel_id: string | null
}>

type MediaItemRow = Readonly<{
  id: number
  guild_id: string
  label: string
  content: string
  last_seen_at: number
  channel_ids: string | null
}>

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function decodeMemoryItemEmbedding(
  row: MemoryItemEmbeddingRow,
  renderedText: string,
  renderer: MemoryItemEmbeddingRow['renderer']
): EpisodeEmbedding | null {
  if (!Buffer.isBuffer(row.vector) || row.renderer !== renderer || row.renderer_version !== 1) return null
  if (row.text_hash !== null && row.text_hash !== sha256(renderedText)) return null
  if (!isActiveVector(row.fingerprint, row.dim, row.vector.byteLength)) return null

  const values = Array.from({ length: row.vector.byteLength / 4 }, (_, index) => row.vector.readFloatLE(index * 4))
  const squaredNorm = values.reduce((sum, value) => sum + value * value, 0)
  return values.every(Number.isFinite) && Number.isFinite(squaredNorm) && squaredNorm > 0 ? values : null
}

function itemEmbedding(
  database: Database.Database,
  itemId: number,
  text: string,
  renderer: MemoryItemEmbeddingRow['renderer']
): EpisodeEmbedding | null {
  const rows = database
    .prepare(`
      SELECT fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector
      FROM memory_item_embedding
      WHERE item_id = ?
      ORDER BY (fingerprint = ?) DESC, fingerprint
    `)
    .all(itemId, config.embeddings.fingerprint) as MemoryItemEmbeddingRow[]
  for (const row of rows) {
    const vector = decodeMemoryItemEmbedding(row, text, renderer)
    if (vector) return vector
  }
  return null
}

function mapUserFact(row: ItemFactRow): UserMemoryClaim {
  return {
    id: row.id,
    guildId: row.guild_id,
    predicate: row.predicate as UserMemoryClaim['predicate'],
    value: row.value,
    objectKind: row.object_kind,
    objectUserId: row.object_user_id,
    sourceKind: row.source_kind as UserMemoryClaim['sourceKind'],
    status: row.status as UserMemoryClaim['status'],
    period: row.period as UserMemoryClaim['period'],
    confidence: row.confidence,
    salience: row.salience,
    pinned: row.pinned === 1,
    needsReview: row.needs_review === 1,
    supersededBy: row.superseded_by,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRecalledAt: row.last_recalled_at,
    expiresAt: row.valid_until,
    eventDate: row.event_date,
    subjectKind: 'user',
    subjectUserId: row.subject_user_id as string
  }
}

function mapGuildFact(row: ItemFactRow): GuildMemoryClaim {
  return {
    id: row.id,
    guildId: row.guild_id,
    predicate: row.predicate as GuildMemoryClaim['predicate'],
    value: row.value,
    objectKind: row.object_kind,
    objectUserId: row.object_user_id,
    sourceKind: row.source_kind as GuildMemoryClaim['sourceKind'],
    status: row.status as GuildMemoryClaim['status'],
    period: row.period as GuildMemoryClaim['period'],
    confidence: row.confidence,
    salience: row.salience,
    pinned: row.pinned === 1,
    needsReview: row.needs_review === 1,
    supersededBy: row.superseded_by,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRecalledAt: row.last_recalled_at,
    expiresAt: row.valid_until,
    eventDate: row.event_date,
    subjectKind: 'guild',
    subjectUserId: null
  }
}

function itemFactRows(database: Database.Database, where: string, values: readonly unknown[]): ItemFactRow[] {
  return database
    .prepare(`
      SELECT id, guild_id, subject_kind, subject_user_id, predicate, content AS value, object_kind,
             object_user_id, source_kind, status, period, confidence, salience, pinned, needs_review,
             superseded_by, first_seen_at, last_seen_at, last_recalled_at, valid_until, event_date
      FROM memory_item
      WHERE ${where}
    `)
    .all(...values) as ItemFactRow[]
}

function visibleFactRows(database: Database.Database, rows: readonly ItemFactRow[], scope: RecallScope): ItemFactRow[] {
  if (config.memory.privacy === 'relaxed' || rows.length === 0) return [...rows]

  const itemIds = rows.map(({ id }) => id)
  const placeholders = itemIds.map(() => '?').join(', ')
  const evidence = database
    .prepare(`SELECT item_id, channel_id FROM memory_item_evidence WHERE item_id IN (${placeholders})`)
    .all(...itemIds) as Array<{ item_id: number; channel_id: string | null }>
  const channels = new Map<number, Array<string | null>>()
  for (const row of evidence) channels.set(row.item_id, [...(channels.get(row.item_id) ?? []), row.channel_id])
  return rows.filter((row) => canRecall(channels.get(row.id) ?? [null], scope))
}

function searchItemIds(database: Database.Database, guildId: string, userIds: string[], message: string): Set<number> {
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  if (userIds.length === 0 || terms.length === 0) return new Set()

  const placeholders = userIds.map(() => '?').join(', ')
  const query = terms.map((term) => `"${term}"`).join(' OR ')
  const rows = database
    .prepare(`
      SELECT memory_item.id FROM memory_item
      JOIN memory_item_fts ON memory_item.id = memory_item_fts.rowid
      WHERE memory_item.guild_id = ? AND memory_item.kind = 'fact' AND memory_item.subject_kind = 'user'
        AND memory_item.status = 'active' AND memory_item.needs_review = 0
        AND memory_item.subject_user_id IN (${placeholders}) AND memory_item_fts MATCH ?
      ORDER BY bm25(memory_item_fts), memory_item.salience DESC
      LIMIT ?
    `)
    .all(guildId, ...userIds, query, config.memory.maxClaimsPerTurn * 3) as Array<{ id: number }>
  return new Set(rows.map(({ id }) => id))
}

export function readItemSubjectSnapshot(
  database: Database.Database,
  guildId: string,
  subjectUserId: string,
  message: string,
  scope: RecallScope
): SubjectRetrievalSnapshot {
  const rows = itemFactRows(
    database,
    "guild_id = ? AND kind = 'fact' AND subject_kind = 'user' AND status = 'active' AND subject_user_id = ?",
    [guildId, subjectUserId]
  )
  return {
    activeClaims: visibleFactRows(database, rows, scope).map(mapUserFact),
    ftsIds: searchItemIds(database, guildId, [subjectUserId], message)
  }
}

export function readItemTurnSnapshot(
  database: Database.Database,
  input: RetrieveForTurnInput,
  userIds: string[]
): TurnRetrievalSnapshot {
  const rows =
    userIds.length === 0
      ? []
      : itemFactRows(
          database,
          `guild_id = ? AND kind = 'fact' AND subject_kind = 'user' AND status = 'active' AND subject_user_id IN (${userIds.map(() => '?').join(', ')})`,
          [input.guildId, ...userIds]
        )
  return {
    activeClaims: visibleFactRows(database, rows, input.scope).map(mapUserFact),
    ftsIds: searchItemIds(database, input.guildId, userIds, input.message),
    names: getAllUserNames()
  }
}

export function readItemGuildFacts(
  database: Database.Database,
  guildId: string,
  now: number,
  scope: RecallScope
): GuildMemoryClaim[] {
  const rows = itemFactRows(
    database,
    `guild_id = ? AND kind = 'fact' AND subject_kind = 'guild' AND status = 'active'
    AND needs_review = 0 AND (valid_until IS NULL OR valid_until > ?)`,
    [guildId, now]
  )
  return visibleFactRows(database, rows, scope).map(mapGuildFact)
}

export function readItemRecallableEpisodes(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MemoryEpisode[] {
  const rows = database
    .prepare(`
      SELECT item.id, item.guild_id, item.content, item.first_seen_at, item.last_seen_at, item.created_at,
             occurrence.channel_id
      FROM memory_item item
      LEFT JOIN memory_item_occurrence occurrence ON occurrence.item_id = item.id AND occurrence.origin = 'episode'
      WHERE item.guild_id = ? AND item.kind = 'episode'
      ORDER BY item.last_seen_at DESC, item.id DESC
    `)
    .all(guildId) as EpisodeItemRow[]
  const episodes = rows.map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id ?? '',
    startedAt: row.first_seen_at,
    endedAt: row.last_seen_at,
    summary: row.content,
    embedding: itemEmbedding(database, row.id, row.content, 'summary'),
    createdAt: row.created_at
  }))
  return config.memory.privacy === 'relaxed'
    ? episodes
    : episodes.filter((episode) => canRecall([episode.channelId], scope))
}

export function readItemMediaCandidates(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MediaRecallCandidate[] {
  const rows = database
    .prepare(`
      SELECT item.id, item.guild_id, item.label, item.content, item.last_seen_at,
             GROUP_CONCAT(DISTINCT occurrence.channel_id) AS channel_ids
      FROM memory_item item
      JOIN memory_item_embedding embedding ON embedding.item_id = item.id
      LEFT JOIN memory_item_occurrence occurrence ON occurrence.item_id = item.id
      WHERE item.guild_id = ? AND item.kind = 'media'
      GROUP BY item.id
      ORDER BY item.id
    `)
    .all(guildId) as MediaItemRow[]
  const candidates = rows.map((row) => ({
    id: row.id,
    label: row.label,
    summary: row.content,
    embedding: itemEmbedding(database, row.id, row.content, 'summary') ?? [],
    lastSharedAt: row.last_seen_at,
    channelIds: (row.channel_ids ?? '').split(',').filter(Boolean).sort()
  }))
  return config.memory.privacy === 'relaxed'
    ? candidates
    : candidates.filter((digest) => canRecall(digest.channelIds.length > 0 ? digest.channelIds : [''], scope))
}

export type { MemoryItemEmbeddingRow }
