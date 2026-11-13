import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { type RecallScope, canRecall } from '../agent/memory/privacy.js'
import { config } from '../config.js'
import { getDb } from './database.js'
import { type EpisodeEmbedding, isActiveVector } from './memoryEpisodeStore.js'
import { tableExists } from './memoryLegacyDrop.js'

declare const recallableMemoryItem: unique symbol
declare const writeMemoryItem: unique symbol

type RecallableBrand = Readonly<{ [recallableMemoryItem]: true }>
type WriteBrand = Readonly<{ [writeMemoryItem]: true }>

export type MemoryItemKind = 'fact' | 'episode' | 'media'

export type RecallableFactFilter = Readonly<{
  kind: 'fact'
  subjectKind?: 'user' | 'guild'
  subjectUserId?: string
  subjectUserIds?: readonly string[]
  predicate?: string
  period?: 'current' | 'past'
  message?: string
  now?: number
}>

export type RecallableEpisodeFilter = Readonly<{ kind: 'episode'; now?: number }>
export type RecallableMediaFilter = Readonly<{ kind: 'media'; now?: number }>
export type RecallableFilter = RecallableFactFilter | RecallableEpisodeFilter | RecallableMediaFilter

type RecallableBase = Readonly<{
  itemId: number
  id: number
  legacyId: number | null
  guildId: string
  sourceChannels: readonly (string | null)[]
}>

export type RecallableFactItem = RecallableBrand &
  RecallableBase &
  Readonly<{
    kind: 'fact'
    subjectKind: 'user' | 'guild'
    subjectUserId: string | null
    predicate: string
    content: string
    objectKind: 'user' | null
    objectUserId: string | null
    sourceKind: string
    status: string
    period: 'current' | 'past'
    confidence: number
    salience: number
    pinned: boolean
    needsReview: boolean
    firstSeenAt: number
    lastSeenAt: number
    lastRecalledAt: number | null
    validUntil: number | null
    eventDate: string | null
    keywordMatch: boolean
  }>

export type RecallableEpisodeItem = RecallableBrand &
  RecallableBase &
  Readonly<{
    kind: 'episode'
    content: string
    firstSeenAt: number
    lastSeenAt: number
    createdAt: number
    channelId: string
    embedding: EpisodeEmbedding
  }>

export type RecallableMediaItem = RecallableBrand &
  RecallableBase &
  Readonly<{
    kind: 'media'
    content: string
    label: string
    lastSeenAt: number
    createdAt: number
    channelIds: readonly string[]
    embedding: EpisodeEmbedding
  }>

export type RecallableMemoryItem = RecallableFactItem | RecallableEpisodeItem | RecallableMediaItem

export type WriteItemFilter = Readonly<{
  guildId?: string
  kind?: MemoryItemKind
  subjectKind?: 'user' | 'guild'
  subjectUserId?: string
  predicate?: string
  period?: 'current' | 'past'
  statuses?: readonly string[]
  needsReview?: boolean
  now?: number
  ftsQuery?: string
  mediaUserId?: string
  terms?: readonly string[]
  limit?: number
}>

export type WriteMemoryItem = WriteBrand &
  Readonly<{
    itemId: number
    id: number
    legacyId: number | null
    guildId: string
    kind: MemoryItemKind
    subjectKind: 'user' | 'guild'
    subjectUserId: string | null
    predicate: string | null
    content: string
    label: string | null
    mediaKind: 'audio' | 'video' | null
    contentKey: string | null
    sourceKind: string | null
    status: string
    needsReview: boolean
    endReason: string | null
    endedAt: number | null
    supersededBy: number | null
    period: 'current' | 'past'
    objectKind: 'user' | null
    objectUserId: string | null
    confidence: number | null
    salience: number | null
    pinned: boolean
    validUntil: number | null
    eventDate: string | null
    firstSeenAt: number
    lastSeenAt: number
    lastRecalledAt: number | null
    createdAt: number | null
    version: number
    sourceJobId: number | null
    sourceChannels: readonly (string | null)[]
    occurrences: readonly Readonly<{
      channelId: string
      origin: string
      messageId: string | null
      sharedByUserId: string | null
      sourceAuthorId: string | null
      observedAt: number
    }>[]
  }>

export type MemoryItemEmbeddingRow = Readonly<{
  fingerprint: string
  model_id: string | null
  dim: number
  renderer: 'fact_sentence' | 'summary'
  renderer_version: number
  text_hash: string | null
  vector: Buffer
}>

export type StoredMemoryItem = Readonly<{
  id: number
  guild_id: string
  kind: MemoryItemKind
  subject_kind: 'user' | 'guild'
  subject_user_id: string | null
  predicate: string | null
  content: string
  label: string | null
  media_kind: 'audio' | 'video' | null
  content_key: string | null
  source_job_id: number | null
  period: 'current' | 'past'
  object_kind: 'user' | null
  object_user_id: string | null
  source_kind: string | null
  status: string
  needs_review: number
  end_reason: string | null
  ended_at: number | null
  superseded_by: number | null
  confidence: number | null
  salience: number | null
  pinned: number
  valid_until: number | null
  event_date: string | null
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
  created_at: number | null
  version: number
  legacy_table: string | null
  legacy_id: number | null
  legacy_embedding_text: string | null
}>

export type NewMemoryItem = Readonly<Omit<StoredMemoryItem, 'id' | 'version'> & { id?: number; version?: number }>

export type ItemEvidenceWrite = Readonly<{
  channelId: string | null
  sourceKind: string
  observedAt: number
  effectiveAt: number | null
  jobId: number | null
  sourceMessageId: string | null
  speakerUserId: string | null
}>

const ITEM_COLUMNS = new Set<keyof StoredMemoryItem>([
  'guild_id',
  'kind',
  'subject_kind',
  'subject_user_id',
  'predicate',
  'content',
  'label',
  'media_kind',
  'content_key',
  'source_job_id',
  'period',
  'object_kind',
  'object_user_id',
  'source_kind',
  'status',
  'needs_review',
  'end_reason',
  'ended_at',
  'superseded_by',
  'confidence',
  'salience',
  'pinned',
  'valid_until',
  'event_date',
  'first_seen_at',
  'last_seen_at',
  'last_recalled_at',
  'created_at',
  'version',
  'legacy_table',
  'legacy_id',
  'legacy_embedding_text'
])

/**
 * Resolves the ID callers see: `legacy_id` for a migrated item, the item's own ID for one written under `item`.
 * `reserveMemoryItemIds` keeps the second above every legacy ID, so the two never collide.
 */
export function findMemoryItemById(
  database: Database.Database,
  kind: MemoryItemKind,
  id: number,
  legacyTable: string
): StoredMemoryItem | undefined {
  return database
    .prepare(`
      SELECT * FROM memory_item
      WHERE kind = ? AND ((legacy_table = ? AND legacy_id = ?) OR (legacy_id IS NULL AND id = ?))
    `)
    .get(kind, legacyTable, id, id) as StoredMemoryItem | undefined
}

export function insertMemoryItem(database: Database.Database, input: NewMemoryItem): number {
  const values = { version: 1, ...input }
  const columns = Object.keys(values)
  const result = database
    .prepare(
      `INSERT INTO memory_item (${columns.join(', ')}) VALUES (${columns.map((column) => `@${column}`).join(', ')})`
    )
    .run(values)
  return Number(result.lastInsertRowid)
}

export function updateMemoryItem(
  database: Database.Database,
  itemId: number,
  values: Partial<Omit<StoredMemoryItem, 'id'>>
): number {
  const entries = Object.entries(values) as Array<[keyof StoredMemoryItem, unknown]>
  if (entries.some(([column]) => !ITEM_COLUMNS.has(column))) throw new Error('Unsupported memory item column')
  if (entries.length === 0) return 0
  const result = database
    .prepare(`UPDATE memory_item SET ${entries.map(([column]) => `${column} = @${column}`).join(', ')} WHERE id = @id`)
    .run({ ...values, id: itemId })
  return result.changes
}

export function insertMemoryItemEvidence(
  database: Database.Database,
  itemId: number,
  input: ItemEvidenceWrite
): number {
  return database
    .prepare(`
      INSERT OR IGNORE INTO memory_item_evidence
        (item_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      itemId,
      input.channelId,
      input.sourceKind,
      input.observedAt,
      input.effectiveAt,
      input.jobId,
      input.sourceMessageId,
      input.speakerUserId
    ).changes
}

export function copyMemoryItemEvidence(database: Database.Database, fromItemId: number, toItemId: number): void {
  database
    .prepare(`
      INSERT OR IGNORE INTO memory_item_evidence
        (item_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id)
      SELECT ?, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id
      FROM memory_item_evidence WHERE item_id = ?
    `)
    .run(toItemId, fromItemId)
}

export function deleteLatestMemoryItemEvidence(database: Database.Database, itemId: number): void {
  database
    .prepare('DELETE FROM memory_item_evidence WHERE id = (SELECT MAX(id) FROM memory_item_evidence WHERE item_id = ?)')
    .run(itemId)
}

export function writeMemoryItemEmbedding(
  database: Database.Database,
  input: {
    itemId: number
    fingerprint: string
    modelId: string | null
    dim: number
    renderer: 'fact_sentence' | 'summary'
    text: string
    vector: Buffer
  }
): void {
  database
    .prepare('DELETE FROM memory_item_embedding WHERE item_id = ? AND fingerprint != ?')
    .run(input.itemId, input.fingerprint)
  database
    .prepare(`
      INSERT INTO memory_item_embedding
        (item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
      ON CONFLICT (item_id, fingerprint) DO UPDATE SET
        model_id = excluded.model_id,
        dim = excluded.dim,
        renderer = excluded.renderer,
        renderer_version = excluded.renderer_version,
        text_hash = excluded.text_hash,
        vector = excluded.vector,
        created_at = NULL
    `)
    .run(
      input.itemId,
      input.fingerprint,
      input.modelId,
      input.dim,
      input.renderer,
      createHash('sha256').update(input.text).digest('hex'),
      input.vector
    )
}

export function deleteMemoryItem(database: Database.Database, itemId: number): void {
  database.prepare('UPDATE memory_item SET superseded_by = NULL WHERE superseded_by = ?').run(itemId)
  database.prepare('DELETE FROM memory_item_evidence WHERE item_id = ?').run(itemId)
  database.prepare('DELETE FROM memory_item_occurrence WHERE item_id = ?').run(itemId)
  database.prepare('DELETE FROM memory_item_payload WHERE item_id = ?').run(itemId)
  database.prepare('DELETE FROM memory_item_embedding WHERE item_id = ?').run(itemId)
  database.prepare('DELETE FROM memory_item WHERE id = ?').run(itemId)
}

export function reserveMemoryItemIds(database: Database.Database): void {
  // After the Phase 7 drop the legacy tables are gone, so migrated items' `legacy_id` keeps new IDs above them.
  const maxima = ['memory_claim', 'memory_episode', 'media_digest']
    .filter((table) => tableExists(database, table))
    .map((table) => (database.prepare(`SELECT MAX(id) AS id FROM ${table}`).get() as { id: number | null }).id ?? 0)
  const items = database
    .prepare('SELECT COALESCE(MAX(id), 0) AS id, COALESCE(MAX(legacy_id), 0) AS legacy_id FROM memory_item')
    .get() as { id: number; legacy_id: number }
  const maximum = Math.max(0, ...maxima, items.id, items.legacy_id)
  const current = database.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'memory_item'").get() as
    | { seq: number }
    | undefined
  if (current) {
    database.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'memory_item'").run(maximum)
  } else {
    database.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('memory_item', ?)").run(maximum)
  }
}

type ItemIdRow = Readonly<{ item_id: number }>

type FactRow = Readonly<{
  item_id: number
  legacy_id: number | null
  guild_id: string
  subject_kind: 'user' | 'guild'
  subject_user_id: string | null
  predicate: string
  content: string
  object_kind: 'user' | null
  object_user_id: string | null
  source_kind: string
  status: string
  period: 'current' | 'past'
  confidence: number
  salience: number
  pinned: number
  needs_review: number
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
  valid_until: number | null
  event_date: string | null
}>

type EpisodeRow = Readonly<{
  item_id: number
  legacy_id: number | null
  source_job_id: number
  guild_id: string
  content: string
  first_seen_at: number
  last_seen_at: number
  created_at: number
}>

type MediaRow = Readonly<{
  item_id: number
  legacy_id: number | null
  guild_id: string
  label: string
  content: string
  last_seen_at: number
  created_at: number
}>

type OccurrenceRow = Readonly<{
  item_id: number
  channel_id: string
  origin: string
  message_id: string | null
  shared_by_user_id: string | null
  source_author_id: string | null
  observed_at: number
}>

function sourceChannels(
  database: Database.Database,
  kind: MemoryItemKind,
  itemIds: readonly number[]
): Map<number, Array<string | null>> {
  const result = new Map<number, Array<string | null>>()
  if (itemIds.length === 0) return result

  const placeholders = itemIds.map(() => '?').join(', ')
  const rows =
    kind === 'fact'
      ? (database
          .prepare(`SELECT item_id, channel_id FROM memory_item_evidence WHERE item_id IN (${placeholders})`)
          .all(...itemIds) as Array<{ item_id: number; channel_id: string | null }>)
      : (database
          .prepare(
            `SELECT item_id, channel_id FROM memory_item_occurrence
             WHERE item_id IN (${placeholders}) AND origin ${kind === 'episode' ? '=' : '!='} 'episode'`
          )
          .all(...itemIds) as Array<{ item_id: number; channel_id: string | null }>)
  for (const row of rows) result.set(row.item_id, [...(result.get(row.item_id) ?? []), row.channel_id])
  return result
}

function recallableRows<T extends { item_id: number }>(
  database: Database.Database,
  kind: MemoryItemKind,
  rows: readonly T[],
  scope: RecallScope
): { rows: T[]; sources: Map<number, Array<string | null>> } {
  if (config.memory.privacy === 'relaxed') return { rows: [...rows], sources: new Map() }
  const sources = sourceChannels(
    database,
    kind,
    rows.map(({ item_id }) => item_id)
  )
  const visible = rows.filter((row) => {
    const itemSources = sources.get(row.item_id)
    if (!itemSources || itemSources.length === 0) {
      return kind === 'fact' && canRecall([null], scope, config.memory.privacy)
    }
    return canRecall(itemSources, scope, config.memory.privacy)
  })
  return { rows: visible, sources }
}

function validScope(scope: RecallScope): boolean {
  return Boolean(scope?.guildId && scope.guildId !== 'global' && !scope.guildId.startsWith('dm:'))
}

function factRows(database: Database.Database, scope: RecallScope, filter: RecallableFactFilter): FactRow[] {
  if (filter.subjectUserIds && filter.subjectUserIds.length === 0) return []
  const orderBy =
    filter.predicate === 'nickname'
      ? 'COALESCE(legacy_id, id) ASC'
      : filter.subjectKind === 'user'
        ? 'pinned DESC, salience DESC, last_seen_at DESC, COALESCE(legacy_id, id) DESC'
        : filter.subjectKind === 'guild'
          ? 'salience DESC, last_seen_at DESC, COALESCE(legacy_id, id) DESC'
          : 'COALESCE(legacy_id, id) ASC'
  const clauses = [
    'guild_id = ?',
    "kind = 'fact'",
    "status = 'active'",
    'needs_review = 0',
    '(valid_until IS NULL OR valid_until > ?)'
  ]
  const values: unknown[] = [scope.guildId, filter.now ?? Date.now()]
  if (filter.subjectKind) {
    clauses.push('subject_kind = ?')
    values.push(filter.subjectKind)
  }
  if (filter.subjectUserId) {
    clauses.push('subject_user_id = ?')
    values.push(filter.subjectUserId)
  }
  if (filter.subjectUserIds) {
    clauses.push(`subject_user_id IN (${filter.subjectUserIds.map(() => '?').join(', ')})`)
    values.push(...filter.subjectUserIds)
  }
  if (filter.predicate) {
    clauses.push('predicate = ?')
    values.push(filter.predicate)
  }
  if (filter.period) {
    clauses.push('period = ?')
    values.push(filter.period)
  }
  return database
    .prepare(`
      SELECT id AS item_id, legacy_id, guild_id, subject_kind, subject_user_id, predicate, content,
             object_kind, object_user_id, source_kind, status, period, confidence, salience, pinned,
             needs_review, first_seen_at, last_seen_at, last_recalled_at, valid_until, event_date
      FROM memory_item
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${orderBy}
    `)
    .all(...values) as FactRow[]
}

function keywordMatchIds(
  database: Database.Database,
  scope: RecallScope,
  filter: RecallableFactFilter,
  visibleItemIds: readonly number[],
  message: string | undefined
): Set<number> {
  const terms = [...new Set(message?.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  if (visibleItemIds.length === 0 || terms.length === 0 || filter.subjectKind === 'guild') return new Set()
  const query = terms.map((term) => `"${term}"`).join(' OR ')
  const clauses = [
    'item.guild_id = ?',
    "item.kind = 'fact'",
    "item.subject_kind = 'user'",
    "item.status = 'active'",
    'item.needs_review = 0',
    'memory_item_fts MATCH ?'
  ]
  const values: unknown[] = [scope.guildId, query]
  if (filter.subjectUserId) {
    clauses.push('item.subject_user_id = ?')
    values.push(filter.subjectUserId)
  }
  if (filter.subjectUserIds) {
    if (filter.subjectUserIds.length === 0) return new Set()
    clauses.push(`item.subject_user_id IN (${filter.subjectUserIds.map(() => '?').join(', ')})`)
    values.push(...filter.subjectUserIds)
  }
  if (filter.predicate) {
    clauses.push('item.predicate = ?')
    values.push(filter.predicate)
  }
  // The legacy boost set is the top matches before the privacy filter, so the limit applies first.
  // Only IDs already admitted by the source privacy filter are retained.
  const rows = database
    .prepare(`
      SELECT item.id AS item_id
      FROM memory_item item
      JOIN memory_item_fts ON item.id = memory_item_fts.rowid
      WHERE ${clauses.join(' AND ')}
      ORDER BY bm25(memory_item_fts), item.salience DESC, COALESCE(item.legacy_id, item.id)
      LIMIT ?
    `)
    .all(...values, config.memory.maxClaimsPerTurn * 3) as ItemIdRow[]
  const visible = new Set(visibleItemIds)
  return new Set(rows.filter(({ item_id }) => visible.has(item_id)).map(({ item_id }) => item_id))
}

function legacyId(itemId: number, legacy: number | null): number {
  return legacy ?? itemId
}

export function decodeMemoryItemEmbedding(
  row: MemoryItemEmbeddingRow,
  renderedText: string,
  renderer: MemoryItemEmbeddingRow['renderer']
): EpisodeEmbedding | null {
  if (!Buffer.isBuffer(row.vector) || row.renderer !== renderer || row.renderer_version !== 1) return null
  if (row.text_hash !== null && row.text_hash !== createHash('sha256').update(renderedText).digest('hex')) return null
  if (!isActiveVector(row.fingerprint, row.dim, row.vector.byteLength)) return null

  // One bulk copy instead of a read per value: stored vectors are little-endian float32, the host byte order on the Pi and x86.
  const values = Array.from(new Float32Array(new Uint8Array(row.vector).buffer))
  const squaredNorm = values.reduce((sum, value) => sum + value * value, 0)
  return values.every(Number.isFinite) && Number.isFinite(squaredNorm) && squaredNorm > 0 ? values : null
}

function recallableEmbeddings(
  database: Database.Database,
  rows: readonly { item_id: number; content: string }[]
): Map<number, EpisodeEmbedding> {
  const result = new Map<number, EpisodeEmbedding>()
  if (rows.length === 0) return result
  const placeholders = rows.map(() => '?').join(', ')
  const textByItemId = new Map(rows.map(({ item_id, content }) => [item_id, content]))
  const embeddings = database
    .prepare(`
      SELECT item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector
      FROM memory_item_embedding
      WHERE item_id IN (${placeholders})
      ORDER BY item_id, (fingerprint = ?) DESC, fingerprint
    `)
    .all(...rows.map(({ item_id }) => item_id), config.embeddings.fingerprint) as Array<
    MemoryItemEmbeddingRow & { item_id: number }
  >
  for (const row of embeddings) {
    if (result.has(row.item_id)) continue
    const text = textByItemId.get(row.item_id)
    if (text === undefined) continue
    const decoded = decodeMemoryItemEmbedding(row, text, 'summary')
    if (decoded) result.set(row.item_id, decoded)
  }
  return result
}

function selectRecallableFacts(
  database: Database.Database,
  scope: RecallScope,
  filter: RecallableFactFilter
): RecallableFactItem[] {
  const rows = factRows(database, scope, filter)
  const { rows: visible, sources } = recallableRows(database, 'fact', rows, scope)
  const keywordIds = keywordMatchIds(
    database,
    scope,
    filter,
    visible.map(({ item_id }) => item_id),
    filter.subjectKind === 'guild' ? undefined : filter.message
  )
  return visible.map((row) => ({
    kind: 'fact',
    itemId: row.item_id,
    id: legacyId(row.item_id, row.legacy_id),
    legacyId: row.legacy_id,
    guildId: row.guild_id,
    subjectKind: row.subject_kind,
    subjectUserId: row.subject_user_id,
    predicate: row.predicate,
    content: row.content,
    objectKind: row.object_kind,
    objectUserId: row.object_user_id,
    sourceKind: row.source_kind,
    status: row.status,
    period: row.period,
    confidence: row.confidence,
    salience: row.salience,
    pinned: row.pinned === 1,
    needsReview: row.needs_review === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRecalledAt: row.last_recalled_at,
    validUntil: row.valid_until,
    eventDate: row.event_date,
    sourceChannels: sources.get(row.item_id) ?? [],
    keywordMatch: keywordIds.has(row.item_id)
  })) as unknown as RecallableFactItem[]
}

function selectRecallableEpisodes(
  database: Database.Database,
  scope: RecallScope,
  filter: RecallableEpisodeFilter
): RecallableEpisodeItem[] {
  const rows = database
    .prepare(`
      SELECT id AS item_id, legacy_id, source_job_id, guild_id, content, first_seen_at, last_seen_at, created_at
      FROM memory_item
      WHERE guild_id = ? AND kind = 'episode' AND status = 'active' AND needs_review = 0
        AND (valid_until IS NULL OR valid_until > ?)
      ORDER BY last_seen_at DESC, source_job_id DESC
    `)
    .all(scope.guildId, filter.now ?? Date.now()) as EpisodeRow[]
  const { rows: visible, sources } = recallableRows(database, 'episode', rows, scope)
  const embeddings = recallableEmbeddings(database, visible)
  return visible.flatMap((row) => {
    const embedding = embeddings.get(row.item_id)
    if (!embedding) return []
    const channels = sources.get(row.item_id) ?? []
    return [
      {
        kind: 'episode' as const,
        itemId: row.item_id,
        // An episode's ID is its extraction job, the legacy `memory_episode.id`, whichever store wrote it.
        id: row.source_job_id,
        legacyId: row.legacy_id,
        guildId: row.guild_id,
        content: row.content,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        channelId: typeof channels[0] === 'string' ? channels[0] : '',
        sourceChannels: channels,
        embedding
      }
    ]
  }) as unknown as RecallableEpisodeItem[]
}

function selectRecallableMedia(
  database: Database.Database,
  scope: RecallScope,
  filter: RecallableMediaFilter
): RecallableMediaItem[] {
  const rows = database
    .prepare(`
      SELECT id AS item_id, legacy_id, guild_id, label, content, last_seen_at, created_at
      FROM memory_item
      WHERE guild_id = ? AND kind = 'media' AND status = 'active' AND needs_review = 0
        AND (valid_until IS NULL OR valid_until > ?)
      ORDER BY COALESCE(legacy_id, id)
    `)
    .all(scope.guildId, filter.now ?? Date.now()) as MediaRow[]
  const { rows: visible, sources } = recallableRows(database, 'media', rows, scope)
  const embeddings = recallableEmbeddings(database, visible)
  return visible.flatMap((row) => {
    const embedding = embeddings.get(row.item_id)
    if (!embedding) return []
    const channelIds = (sources.get(row.item_id) ?? []).filter((channel): channel is string => channel !== null)
    return [
      {
        kind: 'media' as const,
        itemId: row.item_id,
        id: legacyId(row.item_id, row.legacy_id),
        legacyId: row.legacy_id,
        guildId: row.guild_id,
        content: row.content,
        label: row.label,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        sourceChannels: sources.get(row.item_id) ?? [],
        channelIds: [...new Set(channelIds)].sort(),
        embedding
      }
    ]
  }) as unknown as RecallableMediaItem[]
}

export function listRecallable(
  scope: RecallScope,
  filter: RecallableFactFilter,
  database?: Database.Database
): RecallableFactItem[]
export function listRecallable(
  scope: RecallScope,
  filter: RecallableEpisodeFilter,
  database?: Database.Database
): RecallableEpisodeItem[]
export function listRecallable(
  scope: RecallScope,
  filter: RecallableMediaFilter,
  database?: Database.Database
): RecallableMediaItem[]
export function listRecallable(
  scope: RecallScope,
  filter: RecallableFilter,
  database?: Database.Database
): RecallableMemoryItem[] {
  if (!validScope(scope) || config.memory.privacy === 'off') return []
  const source = database ?? getDb()
  if (filter.kind === 'fact') return selectRecallableFacts(source, scope, filter)
  if (filter.kind === 'episode') return selectRecallableEpisodes(source, scope, filter)
  return selectRecallableMedia(source, scope, filter)
}

type WriteItemRow = Readonly<{
  item_id: number
  legacy_id: number | null
  guild_id: string
  kind: MemoryItemKind
  subject_kind: 'user' | 'guild'
  subject_user_id: string | null
  predicate: string | null
  content: string
  label: string | null
  media_kind: 'audio' | 'video' | null
  content_key: string | null
  source_kind: string | null
  status: string
  needs_review: number
  end_reason: string | null
  ended_at: number | null
  superseded_by: number | null
  period: 'current' | 'past'
  object_kind: 'user' | null
  object_user_id: string | null
  confidence: number | null
  salience: number | null
  pinned: number
  valid_until: number | null
  event_date: string | null
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
  created_at: number | null
  version: number
  source_job_id: number | null
}>

function writeRows(database: Database.Database, filter: WriteItemFilter): WriteItemRow[] {
  if (filter.limit !== undefined && filter.limit <= 0) return []
  if (filter.terms?.length && filter.kind !== 'media') return []
  const clauses: string[] = []
  const values: unknown[] = []
  if (filter.guildId !== undefined) {
    clauses.push('item.guild_id = ?')
    values.push(filter.guildId)
  }
  if (filter.kind) {
    clauses.push('item.kind = ?')
    values.push(filter.kind)
  }
  if (filter.subjectKind) {
    clauses.push('item.subject_kind = ?')
    values.push(filter.subjectKind)
  }
  if (filter.subjectUserId) {
    clauses.push('item.subject_user_id = ?')
    values.push(filter.subjectUserId)
  }
  if (filter.predicate) {
    clauses.push('item.predicate = ?')
    values.push(filter.predicate)
  }
  if (filter.period) {
    clauses.push('item.period = ?')
    values.push(filter.period)
  }
  if (filter.statuses) {
    if (filter.statuses.length === 0) return []
    clauses.push(`item.status IN (${filter.statuses.map(() => '?').join(', ')})`)
    values.push(...filter.statuses)
  }
  if (filter.needsReview !== undefined) {
    clauses.push('item.needs_review = ?')
    values.push(filter.needsReview ? 1 : 0)
  }
  if (filter.now !== undefined) {
    clauses.push('(item.valid_until IS NULL OR item.valid_until > ?)')
    values.push(filter.now)
  }
  if (filter.mediaUserId) {
    clauses.push(`EXISTS (
      SELECT 1 FROM memory_item_occurrence occurrence
      WHERE occurrence.item_id = item.id
        AND (occurrence.shared_by_user_id = ? OR occurrence.source_author_id = ?)
    )`)
    values.push(filter.mediaUserId, filter.mediaUserId)
  }
  const termsJoin = filter.ftsQuery ? 'JOIN memory_item_fts ON item.id = memory_item_fts.rowid' : ''
  if (filter.ftsQuery) clauses.push('memory_item_fts MATCH ?')
  if (filter.ftsQuery) values.push(filter.ftsQuery)
  const applySqlLimit = filter.limit !== undefined && !filter.terms?.length
  let rows = database
    .prepare(`
      SELECT item.id AS item_id, item.legacy_id, item.guild_id, item.kind, item.subject_kind,
             item.subject_user_id, item.predicate, item.content, item.label, item.media_kind, item.content_key,
             item.source_kind, item.status, item.needs_review, item.end_reason, item.ended_at, item.superseded_by,
             item.period, item.object_kind, item.object_user_id,
             item.confidence, item.salience, item.pinned, item.valid_until, item.event_date, item.first_seen_at,
             item.last_seen_at, item.last_recalled_at, item.created_at, item.version, item.source_job_id
      FROM memory_item item ${termsJoin}
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ${filter.ftsQuery ? 'bm25(memory_item_fts), item.salience DESC, COALESCE(item.legacy_id, item.id)' : 'COALESCE(item.legacy_id, item.id)'}
      ${applySqlLimit ? 'LIMIT ?' : ''}
    `)
    .all(...values, ...(applySqlLimit ? [Math.floor(filter.limit as number)] : [])) as WriteItemRow[]

  if (filter.terms?.length) {
    const terms = filter.terms.map((term) => term.toLowerCase())
    rows = rows.filter(({ label, content }) => {
      const normalizedLabel = (label ?? '').toLowerCase()
      const normalizedContent = content.toLowerCase()
      return terms.every((term) => normalizedLabel.includes(term) || normalizedContent.includes(term))
    })
    if (filter.limit !== undefined) rows = rows.slice(0, Math.floor(filter.limit))
  }
  return rows
}

function writeSources(
  database: Database.Database,
  rows: readonly WriteItemRow[]
): { sources: Map<number, Array<string | null>>; occurrences: Map<number, OccurrenceRow[]> } {
  const sourceMap = new Map<number, Array<string | null>>()
  const occurrenceMap = new Map<number, OccurrenceRow[]>()
  if (rows.length === 0) return { sources: sourceMap, occurrences: occurrenceMap }
  const ids = rows.map(({ item_id }) => item_id)
  const placeholders = ids.map(() => '?').join(', ')
  const factIds = rows.filter(({ kind }) => kind === 'fact').map(({ item_id }) => item_id)
  if (factIds.length > 0) {
    const factPlaceholders = factIds.map(() => '?').join(', ')
    const evidence = database
      .prepare(`SELECT item_id, channel_id FROM memory_item_evidence WHERE item_id IN (${factPlaceholders})`)
      .all(...factIds) as Array<{ item_id: number; channel_id: string | null }>
    for (const row of evidence) sourceMap.set(row.item_id, [...(sourceMap.get(row.item_id) ?? []), row.channel_id])
  }
  const occurrences = database
    .prepare(`
      SELECT item_id, channel_id, origin, message_id, shared_by_user_id, source_author_id, observed_at
      FROM memory_item_occurrence
      WHERE item_id IN (${placeholders})
    `)
    .all(...ids) as OccurrenceRow[]
  for (const row of occurrences) {
    occurrenceMap.set(row.item_id, [...(occurrenceMap.get(row.item_id) ?? []), row])
    sourceMap.set(row.item_id, [...(sourceMap.get(row.item_id) ?? []), row.channel_id])
  }
  return { sources: sourceMap, occurrences: occurrenceMap }
}

export function listForWrite(filter: WriteItemFilter = {}, database: Database.Database = getDb()): WriteMemoryItem[] {
  const rows = writeRows(database, filter)
  const { sources, occurrences } = writeSources(database, rows)
  return rows.map((row) => {
    const itemSources = sources.get(row.item_id) ?? (row.kind === 'fact' ? [null] : [])
    return {
      itemId: row.item_id,
      id: legacyId(row.item_id, row.legacy_id),
      legacyId: row.legacy_id,
      guildId: row.guild_id,
      kind: row.kind,
      subjectKind: row.subject_kind,
      subjectUserId: row.subject_user_id,
      predicate: row.predicate,
      content: row.content,
      label: row.label,
      mediaKind: row.media_kind,
      contentKey: row.content_key,
      sourceKind: row.source_kind,
      status: row.status,
      needsReview: row.needs_review === 1,
      endReason: row.end_reason,
      endedAt: row.ended_at,
      supersededBy: row.superseded_by,
      period: row.period,
      objectKind: row.object_kind,
      objectUserId: row.object_user_id,
      confidence: row.confidence,
      salience: row.salience,
      pinned: row.pinned === 1,
      validUntil: row.valid_until,
      eventDate: row.event_date,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      lastRecalledAt: row.last_recalled_at,
      createdAt: row.created_at,
      version: row.version,
      sourceJobId: row.source_job_id,
      sourceChannels: itemSources,
      occurrences: (occurrences.get(row.item_id) ?? []).map((occurrence) => ({
        channelId: occurrence.channel_id,
        origin: occurrence.origin,
        messageId: occurrence.message_id,
        sharedByUserId: occurrence.shared_by_user_id,
        sourceAuthorId: occurrence.source_author_id,
        observedAt: occurrence.observed_at
      }))
    }
  }) as unknown as WriteMemoryItem[]
}
