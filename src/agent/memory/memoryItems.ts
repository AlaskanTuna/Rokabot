import type Database from 'better-sqlite3'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import type { MediaRecallCandidate } from '../../storage/mediaDigestStore.js'
import type { EmbeddingVector, MemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import {
  type ItemEvidenceWrite,
  type NewMemoryItem,
  type RecallableFactFilter,
  type RecallableFactItem,
  type StoredMemoryItem,
  type WriteMemoryItem,
  copyMemoryItemEvidence,
  deleteLatestMemoryItemEvidence,
  deleteMemoryItem,
  findMemoryItemById,
  insertMemoryItem,
  insertMemoryItemEvidence,
  listForWrite,
  listRecallable,
  updateMemoryItem,
  writeMemoryItemEmbedding
} from '../../storage/memoryItemStore.js'
import { vectorParams } from '../../storage/memoryVector.js'
import { getAllUserNames } from '../../storage/userNames.js'
import { SOURCE_WEIGHT, confidenceForEvidence } from './memoryClaimScoring.js'
import {
  type ClaimAssert,
  type ClaimPeriod,
  type ClaimSource,
  type ClaimStatus,
  type EvidenceInput,
  type GuildMemoryClaim,
  type MemoryClaim,
  type UserMemoryClaim
} from './memoryClaims.js'
import { PREDICATES, baseSalienceOf, cardinalityOf, normalizePredicate } from './predicates.js'
import { type RecallScope, canRecall } from './privacy.js'
import type { RetrieveForTurnInput, SubjectRetrievalSnapshot, TurnRetrievalSnapshot } from './retriever.js'

function mapFact(item: RecallableFactItem): MemoryClaim {
  const base = {
    id: item.id,
    guildId: item.guildId,
    predicate: item.predicate,
    value: item.content,
    objectKind: item.objectKind,
    objectUserId: item.objectUserId,
    sourceKind: item.sourceKind as UserMemoryClaim['sourceKind'],
    status: item.status as UserMemoryClaim['status'],
    period: item.period,
    confidence: item.confidence,
    salience: item.salience,
    pinned: item.pinned,
    needsReview: item.needsReview,
    supersededBy: null,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastRecalledAt: item.lastRecalledAt,
    expiresAt: item.validUntil,
    eventDate: item.eventDate
  }
  return item.subjectKind === 'guild'
    ? ({ ...base, subjectKind: 'guild', subjectUserId: null } as GuildMemoryClaim)
    : ({ ...base, subjectKind: 'user', subjectUserId: item.subjectUserId as string } as UserMemoryClaim)
}

export function readItemSubjectSnapshot(
  database: Database.Database,
  guildId: string,
  subjectUserId: string,
  message: string,
  scope: RecallScope
): SubjectRetrievalSnapshot {
  if (scope.guildId !== guildId) return { activeClaims: [], ftsIds: new Set() }
  const rows = listRecallable(scope, { kind: 'fact', subjectKind: 'user', subjectUserId, message }, database)
  return {
    activeClaims: rows.map((row) => mapFact(row) as UserMemoryClaim),
    ftsIds: new Set(rows.filter(({ keywordMatch }) => keywordMatch).map(({ id }) => id))
  }
}

export function readItemTurnSnapshot(
  database: Database.Database,
  input: RetrieveForTurnInput,
  userIds: string[]
): TurnRetrievalSnapshot {
  if (input.scope.guildId !== input.guildId) {
    return { activeClaims: [], ftsIds: new Set(), names: getAllUserNames() }
  }
  const rows = listRecallable(
    input.scope,
    { kind: 'fact', subjectKind: 'user', subjectUserIds: userIds, message: input.message },
    database
  )
  return {
    activeClaims: rows.map((row) => mapFact(row) as UserMemoryClaim),
    ftsIds: new Set(rows.filter(({ keywordMatch }) => keywordMatch).map(({ id }) => id)),
    names: getAllUserNames()
  }
}

export function readItemGuildFacts(
  database: Database.Database,
  guildId: string,
  now: number,
  scope: RecallScope
): GuildMemoryClaim[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'fact', subjectKind: 'guild', now }, database).map(
    (item) => mapFact(item) as GuildMemoryClaim
  )
}

export function readItemFacts(
  scope: RecallScope,
  filter: Omit<RecallableFactFilter, 'kind'>,
  database?: Database.Database
): MemoryClaim[] {
  return listRecallable(scope, { ...filter, kind: 'fact' }, database).map(mapFact)
}

export function readItemRecallableEpisodes(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MemoryEpisode[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'episode' }, database).map((item) => ({
    id: item.id,
    guildId: item.guildId,
    channelId: item.channelId,
    startedAt: item.firstSeenAt,
    endedAt: item.lastSeenAt,
    summary: item.content,
    embedding: item.embedding,
    createdAt: item.createdAt
  }))
}

export function readItemMediaCandidates(
  database: Database.Database,
  guildId: string,
  scope: RecallScope
): MediaRecallCandidate[] {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, { kind: 'media' }, database).map((item) => ({
    id: item.id,
    label: item.label,
    summary: item.content,
    embedding: item.embedding,
    lastSharedAt: item.lastSeenAt,
    channelIds: item.channelIds
  }))
}

export function readItemNicknameClaims(
  guildId: string,
  scope: RecallScope
): Array<{ id: number; user_id: string; value: string }> {
  if (scope.guildId !== guildId) return []
  return listRecallable(scope, {
    kind: 'fact',
    subjectKind: 'user',
    predicate: 'nickname',
    period: 'current'
  }).map((item) => ({ id: item.id, user_id: item.subjectUserId as string, value: item.content }))
}

export type ForgetFactMatch = Readonly<{ kind: 'fact'; id: number; predicate: string; value: string }>
export type ForgetMediaMatch = Readonly<{ kind: 'media'; id: number; label: string; summary: string }>
export type ItemForgetCandidates = Readonly<{
  facts: readonly WriteMemoryItem[]
  media: readonly WriteMemoryItem[]
  visibleFacts: readonly ForgetFactMatch[]
  visibleMedia: readonly ForgetMediaMatch[]
}>

function canShowForgetItem(item: WriteMemoryItem, scope: RecallScope | undefined): boolean {
  const level = config.memory.privacy
  if (level === 'off') return false
  if (level === 'relaxed') return true
  if (!scope) return false
  const sources = item.sourceChannels.length > 0 ? item.sourceChannels : item.kind === 'fact' ? [null] : ['']
  return canRecall(sources, scope, level)
}

export function findItemForgetCandidates(input: {
  guildId: string
  userId: string
  ftsQuery: string
  terms: readonly string[]
  scope?: RecallScope
  limit: number
}): ItemForgetCandidates {
  if (input.guildId === 'global' || input.guildId.startsWith('dm:')) {
    return { facts: [], media: [], visibleFacts: [], visibleMedia: [] }
  }
  const facts =
    input.ftsQuery.trim().length === 0
      ? []
      : listForWrite({
          guildId: input.guildId,
          kind: 'fact',
          subjectKind: 'user',
          subjectUserId: input.userId,
          statuses: ['active'],
          ftsQuery: input.ftsQuery,
          limit: input.limit
        })
  const media =
    input.terms.length === 0
      ? []
      : listForWrite({
          guildId: input.guildId,
          kind: 'media',
          mediaUserId: input.userId,
          terms: input.terms,
          limit: input.limit
        })
  return {
    facts,
    media,
    visibleFacts: facts
      .filter((item) => canShowForgetItem(item, input.scope))
      .flatMap((item) =>
        item.predicate ? [{ kind: 'fact' as const, id: item.id, predicate: item.predicate, value: item.content }] : []
      ),
    visibleMedia: media
      .filter((item) => canShowForgetItem(item, input.scope))
      .flatMap((item) =>
        item.label ? [{ kind: 'media' as const, id: item.id, label: item.label, summary: item.content }] : []
      )
  }
}

export type ItemVaultFacts = Readonly<{
  users: readonly Readonly<{ guildId: string; userId: string; claims: readonly UserMemoryClaim[] }>[]
  guilds: readonly Readonly<{ guildId: string; claims: readonly GuildMemoryClaim[] }>[]
  episodes: readonly MemoryEpisode[]
}>

export function listItemVaultFacts(now: number): ItemVaultFacts {
  const userItems = listForWrite({ kind: 'fact', subjectKind: 'user', statuses: ['active'] })
  const guildItems = listForWrite({ kind: 'fact', subjectKind: 'guild', statuses: ['active'], needsReview: false, now })
  const episodeItems = listForWrite({ kind: 'episode', statuses: ['active'] })
  const groupedUsers = new Map<string, UserMemoryClaim[]>()
  for (const item of userItems) {
    if (!item.subjectUserId) continue
    const key = `${item.guildId}\u0000${item.subjectUserId}`
    groupedUsers.set(key, [...(groupedUsers.get(key) ?? []), mapWriteFact(item) as UserMemoryClaim])
  }
  for (const claims of groupedUsers.values()) {
    claims.sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.salience - left.salience ||
        right.lastSeenAt - left.lastSeenAt ||
        right.id - left.id
    )
  }
  const groupedGuilds = new Map<string, GuildMemoryClaim[]>()
  for (const item of guildItems) {
    groupedGuilds.set(item.guildId, [
      ...(groupedGuilds.get(item.guildId) ?? []),
      mapWriteFact(item) as GuildMemoryClaim
    ])
  }
  for (const claims of groupedGuilds.values()) {
    claims.sort(
      (left, right) => right.salience - left.salience || right.lastSeenAt - left.lastSeenAt || right.id - left.id
    )
  }
  return {
    users: [...groupedUsers].map(([key, claims]) => {
      const [guildId, userId] = key.split('\u0000')
      return { guildId: guildId ?? '', userId: userId ?? '', claims }
    }),
    guilds: [...groupedGuilds].map(([guildId, claims]) => ({ guildId, claims })),
    episodes: episodeItems.map((item) => ({
      id: item.id,
      guildId: item.guildId,
      channelId: item.occurrences.find(({ origin }) => origin === 'episode')?.channelId ?? '',
      startedAt: item.firstSeenAt,
      endedAt: item.lastSeenAt,
      summary: item.content,
      embedding: null,
      createdAt: item.createdAt ?? item.firstSeenAt
    }))
  }
}

function mapWriteFact(item: WriteMemoryItem): MemoryClaim {
  const successor =
    item.supersededBy === null
      ? undefined
      : (getDb().prepare('SELECT id, legacy_id FROM memory_item WHERE id = ?').get(item.supersededBy) as
          | { id: number; legacy_id: number | null }
          | undefined)
  const base = {
    id: item.id,
    guildId: item.guildId,
    predicate: item.predicate ?? '',
    value: item.content,
    objectKind: item.objectKind,
    objectUserId: item.objectUserId,
    sourceKind: (item.sourceKind ?? 'legacy') as UserMemoryClaim['sourceKind'],
    status: item.status as UserMemoryClaim['status'],
    period: item.period,
    confidence: item.confidence ?? 0,
    salience: item.salience ?? 0,
    pinned: item.pinned,
    needsReview: item.needsReview,
    supersededBy: successor ? (successor.legacy_id ?? successor.id) : null,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastRecalledAt: item.lastRecalledAt,
    expiresAt: item.validUntil,
    eventDate: item.eventDate
  }
  return item.subjectKind === 'guild'
    ? ({ ...base, subjectKind: 'guild', subjectUserId: null } as GuildMemoryClaim)
    : ({ ...base, subjectKind: 'user', subjectUserId: item.subjectUserId ?? '' } as UserMemoryClaim)
}

export function itemIdForClaimRef(database: Database.Database, id: number): number | undefined {
  return findMemoryItemById(database, 'fact', id, 'memory_claim')?.id
}

export function readItemClaim(database: Database.Database, id: number): MemoryClaim | undefined {
  const item = findMemoryItemById(database, 'fact', id, 'memory_claim')
  return item ? readItemClaimByInternalId(database, item.id) : undefined
}

export function readItemClaimByInternalId(database: Database.Database, itemId: number): MemoryClaim | undefined {
  const item = database.prepare("SELECT * FROM memory_item WHERE id = ? AND kind = 'fact'").get(itemId) as
    | StoredMemoryItem
    | undefined
  if (!item || !item.predicate || !item.source_kind) return undefined
  const successor =
    item.superseded_by === null
      ? undefined
      : (database.prepare('SELECT id, legacy_id FROM memory_item WHERE id = ?').get(item.superseded_by) as
          | { id: number; legacy_id: number | null }
          | undefined)
  const base = {
    id: item.legacy_id ?? item.id,
    guildId: item.guild_id,
    predicate: item.predicate,
    value: item.content,
    objectKind: item.object_kind,
    objectUserId: item.object_user_id,
    sourceKind: item.source_kind as ClaimSource,
    status: item.status as ClaimStatus,
    period: item.period as ClaimPeriod,
    confidence: item.confidence ?? 0,
    salience: item.salience ?? 0,
    pinned: item.pinned === 1,
    needsReview: item.needs_review === 1,
    supersededBy: successor ? (successor.legacy_id ?? successor.id) : null,
    firstSeenAt: item.first_seen_at,
    lastSeenAt: item.last_seen_at,
    lastRecalledAt: item.last_recalled_at,
    expiresAt: item.valid_until,
    eventDate: item.event_date
  }
  return item.subject_kind === 'guild'
    ? ({ ...base, subjectKind: 'guild', subjectUserId: null } as GuildMemoryClaim)
    : ({ ...base, subjectKind: 'user', subjectUserId: item.subject_user_id as string } as UserMemoryClaim)
}

function itemFactRows(filter: {
  guildId?: string
  subjectKind?: 'user' | 'guild'
  subjectUserId?: string
  predicate?: string
  period?: ClaimPeriod
  statuses?: readonly ClaimStatus[]
  needsReview?: boolean
}): WriteMemoryItem[] {
  return listForWrite({ kind: 'fact', ...filter })
}

function findItemFact(input: {
  guildId: string
  subjectKind: 'user' | 'guild'
  subjectUserId: string | null
  predicate: string
  value: string
  period?: ClaimPeriod
}): WriteMemoryItem | undefined {
  return itemFactRows({
    guildId: input.guildId,
    subjectKind: input.subjectKind,
    ...(input.subjectUserId ? { subjectUserId: input.subjectUserId } : {}),
    predicate: input.predicate,
    ...(input.period ? { period: input.period } : {})
  }).find((item) => item.subjectUserId === input.subjectUserId && item.content === input.value)
}

function userFactByItemId(guildId: string, subjectUserId: string, itemId: number): WriteMemoryItem | undefined {
  return itemFactRows({ guildId, subjectKind: 'user', subjectUserId }).find((item) => item.itemId === itemId)
}

function evidenceWrite(input: EvidenceInput): ItemEvidenceWrite {
  const observedAt = input.observedAt ?? Date.now()
  return {
    channelId: input.channelId ?? null,
    sourceKind: input.sourceKind,
    observedAt,
    effectiveAt: input.effectiveAt ?? observedAt,
    jobId: input.provenance?.jobId ?? null,
    sourceMessageId: input.provenance?.sourceMessageId ?? null,
    speakerUserId: input.provenance?.speakerUserId ?? null
  }
}

function itemEvidenceCount(database: Database.Database, itemId: number): number {
  return (
    database.prepare('SELECT COUNT(*) AS count FROM memory_item_evidence WHERE item_id = ?').get(itemId) as {
      count: number
    }
  ).count
}

function hasItemEvidenceJob(database: Database.Database, itemId: number, jobId: number): boolean {
  return Boolean(
    database.prepare('SELECT 1 FROM memory_item_evidence WHERE item_id = ? AND job_id = ?').get(itemId, jobId)
  )
}

export function appendItemEvidenceInTransaction(claimId: number, input: EvidenceInput): MemoryClaim {
  const itemId = itemIdForClaimRef(getDb(), claimId)
  if (itemId === undefined) throw new Error('Memory item fact not found')
  return appendItemEvidenceToId(itemId, input)
}

function appendItemEvidenceToId(itemId: number, input: EvidenceInput): MemoryClaim {
  const database = getDb()
  const write = evidenceWrite(input)
  insertMemoryItemEvidence(database, itemId, write)
  const count = itemEvidenceCount(database, itemId)
  const row = database.prepare('SELECT last_seen_at FROM memory_item WHERE id = ?').get(itemId) as {
    last_seen_at: number
  }
  updateMemoryItem(database, itemId, {
    confidence: confidenceForEvidence(count, write.observedAt),
    last_seen_at: Math.max(row.last_seen_at, write.observedAt)
  })
  return readItemClaimByInternalId(database, itemId) as MemoryClaim
}

function rejectItemRows(items: readonly WriteMemoryItem[], reason: string): void {
  const endedAt = Date.now()
  for (const item of items) {
    updateMemoryItem(getDb(), item.itemId, {
      status: 'rejected',
      ended_at: endedAt,
      end_reason: reason
    })
  }
}

function supersedeItemPriorActive(claim: WriteMemoryItem): void {
  if (!claim.predicate || cardinalityOf(claim.predicate as never) !== 'single' || claim.period !== 'current') return
  const prior = itemFactRows({
    guildId: claim.guildId,
    subjectKind: claim.subjectKind,
    ...(claim.subjectUserId ? { subjectUserId: claim.subjectUserId } : {}),
    predicate: claim.predicate,
    period: 'current',
    statuses: ['active']
  }).filter((item) => item.itemId !== claim.itemId)
  const endedAt = Date.now()
  for (const item of prior) {
    updateMemoryItem(getDb(), item.itemId, {
      status: 'superseded',
      superseded_by: claim.itemId,
      ended_at: endedAt,
      end_reason: 'superseded'
    })
  }
  if (claim.status === 'active' && prior.some(({ pinned }) => pinned)) {
    updateMemoryItem(getDb(), claim.itemId, { pinned: 1 })
  }
}

export function evictItemOverflow(guildId: string, subjectUserId: string): number {
  const active = itemFactRows({ guildId, subjectKind: 'user', subjectUserId, statuses: ['active'] })
    .filter(({ pinned }) => !pinned)
    .sort(
      (left, right) =>
        Number(right.period === 'past') - Number(left.period === 'past') ||
        (left.salience ?? 0) - (right.salience ?? 0) ||
        left.lastSeenAt - right.lastSeenAt ||
        left.id - right.id
    )
  const overflow = active.slice(0, Math.max(0, active.length - config.memory.maxActiveClaimsPerUser))
  rejectItemRows(overflow, 'evicted')
  return overflow.length
}

export function evictItemOverflowForAllSubjectsInTransaction(): number {
  const subjects = new Map<string, { guildId: string; userId: string }>()
  for (const item of itemFactRows({ subjectKind: 'user', statuses: ['active'] })) {
    if (!item.subjectUserId) continue
    const key = `${item.guildId}\u0000${item.subjectUserId}`
    subjects.set(key, { guildId: item.guildId, userId: item.subjectUserId })
  }
  return [...subjects.values()].reduce((count, { guildId, userId }) => count + evictItemOverflow(guildId, userId), 0)
}

export function purgeItemDeadClaims(now: number): number {
  const cutoff = now - config.memory.deadClaimRetentionDays * 24 * 60 * 60 * 1000
  const dead = itemFactRows({ statuses: ['rejected', 'superseded'] }).filter(
    (item) => item.endedAt !== null && item.endedAt < cutoff
  )
  for (const item of dead) deleteMemoryItem(getDb(), item.itemId)
  return dead.length
}

function resolveSuccessorId(database: Database.Database, id: number | undefined): number | null {
  if (id === undefined) return null
  return itemIdForClaimRef(database, id) ?? null
}

export function assertItemClaimInTransaction(op: ClaimAssert, inheritedPin = false): UserMemoryClaim {
  const database = getDb()
  const predicate = normalizePredicate(op.predicate)
  const observedAt = op.observedAt ?? Date.now()
  const period = op.period ?? 'current'
  const existing = findItemFact({
    guildId: op.guildId,
    subjectKind: 'user',
    subjectUserId: op.subjectUserId,
    predicate,
    value: op.value,
    period
  })

  if (op.sourceKind !== 'explicit' && existing?.status !== 'active') {
    const forgotten = itemFactRows({
      guildId: op.guildId,
      subjectKind: 'user',
      subjectUserId: op.subjectUserId,
      predicate,
      statuses: ['rejected', 'superseded']
    }).find((item) => item.content === op.value && item.endReason === 'forgotten')
    if (forgotten) return mapWriteFact(forgotten) as UserMemoryClaim
  }

  if (existing) {
    if (op.provenance?.jobId !== undefined && hasItemEvidenceJob(database, existing.itemId, op.provenance.jobId)) {
      return readItemClaim(database, existing.id) as UserMemoryClaim
    }
    const current = mapWriteFact(existing) as UserMemoryClaim
    const dead = current.status === 'rejected' || current.status === 'superseded'
    const keepActive = current.status === 'active'
    const status = keepActive ? 'active' : (op.status ?? 'active')
    const needsReview =
      op.needsReview === undefined || (keepActive && op.needsReview) ? current.needsReview : op.needsReview
    updateMemoryItem(database, existing.itemId, {
      status,
      superseded_by: dead ? null : existing.supersededBy,
      ended_at: dead ? null : existing.endedAt,
      end_reason: dead ? null : existing.endReason,
      last_seen_at: Math.max(current.lastSeenAt, observedAt),
      salience: Math.min(
        1,
        Math.max(current.salience, baseSalienceOf(predicate) * SOURCE_WEIGHT[op.sourceKind]) + 0.02
      ),
      pinned: current.pinned || op.sourceKind === 'explicit' || inheritedPin ? 1 : 0,
      needs_review: needsReview ? 1 : 0
    })
    appendItemEvidenceToId(existing.itemId, {
      channelId: op.channelId,
      sourceKind: op.sourceKind,
      observedAt,
      provenance: op.provenance
    })
    const updated = userFactByItemId(op.guildId, op.subjectUserId, existing.itemId)
    if (!updated) throw new Error('Memory item fact not found after assertion')
    if ((dead || (current.status === 'candidate' && status === 'active')) && updated.status === 'active') {
      supersedeItemPriorActive(updated)
      evictItemOverflow(op.guildId, op.subjectUserId)
    }
    return readItemClaim(database, updated.id) as UserMemoryClaim
  }

  const objectUserId = PREDICATES[predicate].objectKind === 'user' ? (op.objectUserId ?? null) : null
  const itemId = insertMemoryItem(database, {
    guild_id: op.guildId,
    kind: 'fact',
    subject_kind: 'user',
    subject_user_id: op.subjectUserId,
    predicate,
    content: op.value,
    label: null,
    media_kind: null,
    content_key: null,
    source_job_id: null,
    period,
    object_kind: objectUserId ? 'user' : null,
    object_user_id: objectUserId,
    source_kind: op.sourceKind,
    status: op.status ?? 'active',
    needs_review: op.needsReview ? 1 : 0,
    end_reason: null,
    ended_at: null,
    superseded_by: null,
    confidence: 0.5,
    salience: baseSalienceOf(predicate) * SOURCE_WEIGHT[op.sourceKind],
    pinned: op.sourceKind === 'explicit' || inheritedPin ? 1 : 0,
    valid_until: null,
    event_date: null,
    first_seen_at: observedAt,
    last_seen_at: observedAt,
    last_recalled_at: null,
    created_at: null,
    legacy_table: null,
    legacy_id: null,
    legacy_embedding_text: null
  } satisfies NewMemoryItem)
  appendItemEvidenceToId(itemId, {
    channelId: op.channelId,
    sourceKind: op.sourceKind,
    observedAt,
    provenance: op.provenance
  })
  const claim = userFactByItemId(op.guildId, op.subjectUserId, itemId)
  if (!claim) throw new Error('Memory item fact not found after assertion')
  if (claim.status === 'active') supersedeItemPriorActive(claim)
  if (claim.status === 'active') evictItemOverflow(op.guildId, op.subjectUserId)
  return readItemClaimByInternalId(database, itemId) as UserMemoryClaim
}

export function assertItemGuildClaimInTransaction(input: {
  guildId: string
  predicate: string
  value: string
  expiresAt: number | null
  eventDate?: string | null
  sourceKind: ClaimSource
  channelId?: string
  observedAt?: number
  needsReview?: boolean
  status?: Extract<ClaimStatus, 'candidate' | 'active'>
  provenance?: ClaimAssert['provenance']
}): GuildMemoryClaim {
  const database = getDb()
  const observedAt = input.observedAt ?? Date.now()
  const existing = findItemFact({
    guildId: input.guildId,
    subjectKind: 'guild',
    subjectUserId: null,
    predicate: input.predicate,
    value: input.value
  })
  if (existing) {
    if (
      input.provenance?.jobId !== undefined &&
      hasItemEvidenceJob(database, existing.itemId, input.provenance.jobId)
    ) {
      return readItemClaim(database, existing.id) as GuildMemoryClaim
    }
    const current = mapWriteFact(existing) as GuildMemoryClaim
    const dead = current.status === 'rejected' || current.status === 'superseded'
    const keepActive = current.status === 'active'
    const needsReview =
      input.needsReview === undefined || (keepActive && input.needsReview) ? current.needsReview : input.needsReview
    updateMemoryItem(database, existing.itemId, {
      status: keepActive ? 'active' : (input.status ?? 'active'),
      superseded_by: dead ? null : existing.supersededBy,
      ended_at: dead ? null : existing.endedAt,
      end_reason: dead ? null : existing.endReason,
      last_seen_at: Math.max(current.lastSeenAt, observedAt),
      salience: Math.min(1, current.salience + 0.02),
      valid_until: input.expiresAt,
      event_date: input.eventDate ?? null,
      needs_review: needsReview ? 1 : 0
    })
    appendItemEvidenceToId(existing.itemId, {
      channelId: input.channelId,
      sourceKind: input.sourceKind,
      observedAt,
      provenance: input.provenance
    })
    return readItemClaim(database, existing.id) as GuildMemoryClaim
  }

  const itemId = insertMemoryItem(database, {
    guild_id: input.guildId,
    kind: 'fact',
    subject_kind: 'guild',
    subject_user_id: null,
    predicate: input.predicate,
    content: input.value,
    label: null,
    media_kind: null,
    content_key: null,
    source_job_id: null,
    period: 'current',
    object_kind: null,
    object_user_id: null,
    source_kind: input.sourceKind,
    status: input.status ?? 'active',
    needs_review: input.needsReview ? 1 : 0,
    end_reason: null,
    ended_at: null,
    superseded_by: null,
    confidence: 0.5,
    salience: 0.75 * SOURCE_WEIGHT[input.sourceKind],
    pinned: 0,
    valid_until: input.expiresAt,
    event_date: input.eventDate ?? null,
    first_seen_at: observedAt,
    last_seen_at: observedAt,
    last_recalled_at: null,
    created_at: null,
    legacy_table: null,
    legacy_id: null,
    legacy_embedding_text: null
  } satisfies NewMemoryItem)
  appendItemEvidenceToId(itemId, {
    channelId: input.channelId,
    sourceKind: input.sourceKind,
    observedAt,
    provenance: input.provenance
  })
  return readItemClaim(database, itemId) as GuildMemoryClaim
}

export function activateItemClaimInTransaction(guildId: string, claimId: number): UserMemoryClaim {
  const database = getDb()
  const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
  if (!item || item.guild_id !== guildId || item.subject_kind !== 'user' || item.status !== 'candidate') {
    throw new Error('Candidate claim not found')
  }
  updateMemoryItem(database, item.id, { status: 'active', needs_review: 0 })
  const subjectUserId = item.subject_user_id as string
  const active = userFactByItemId(guildId, subjectUserId, item.id)
  if (!active) throw new Error('Candidate claim not found')
  supersedeItemPriorActive(active)
  evictItemOverflow(guildId, subjectUserId)
  return readItemClaimByInternalId(database, item.id) as UserMemoryClaim
}

export function rejectItemClaimInTransaction(
  claimId: number,
  reason: string,
  expected?: { guildId?: string; subjectKind?: 'user' | 'guild'; subjectUserId?: string }
): boolean {
  const database = getDb()
  const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
  if (
    !item ||
    item.status !== 'active' ||
    (expected?.guildId !== undefined && item.guild_id !== expected.guildId) ||
    (expected?.subjectKind !== undefined && item.subject_kind !== expected.subjectKind) ||
    (expected?.subjectUserId !== undefined && item.subject_user_id !== expected.subjectUserId)
  ) {
    return false
  }
  updateMemoryItem(database, item.id, {
    status: 'rejected',
    ended_at: Date.now(),
    end_reason: reason,
    superseded_by: null
  })
  return true
}

export function retireItemClaimInTransaction(
  guildId: string,
  claimId: number,
  reason: 'retracted' | 'reclassified',
  supersededBy?: number
): boolean {
  const item = findMemoryItemById(getDb(), 'fact', claimId, 'memory_claim')
  if (!item || item.guild_id !== guildId || item.status !== 'active') return false
  updateMemoryItem(getDb(), item.id, {
    status: 'rejected',
    ended_at: Date.now(),
    end_reason: reason,
    superseded_by: reason === 'reclassified' ? resolveSuccessorId(getDb(), supersededBy) : null
  })
  return true
}

type ItemGuildClaimAssert = Parameters<typeof assertItemGuildClaimInTransaction>[0]

/**
 * The item half of `replaceActiveClaim`. `assert` is the caller's guarded assertion, so the value checks run at
 * the same points as on the legacy path.
 */
export function replaceItemActiveClaimInTransaction(
  input: {
    guildId: string
    subjectUserId: string
    existingId: number
    predicate: string
    value: string
    channelId: string
    observedAt?: number
    objectUserId?: string
    needsReview?: boolean
    provenance?: ClaimAssert['provenance']
  },
  assert: (op: ClaimAssert, inheritedPin?: boolean) => UserMemoryClaim
): UserMemoryClaim | null {
  const database = getDb()
  const prior = getItemActiveClaimById(input.guildId, input.subjectUserId, input.existingId)
  if (!prior || prior.predicate !== input.predicate || prior.period !== 'current') return null
  const forgotten = itemFactRows({
    guildId: input.guildId,
    subjectKind: 'user',
    subjectUserId: input.subjectUserId,
    predicate: input.predicate,
    statuses: ['rejected', 'superseded']
  }).some((item) => item.content === input.value && item.endReason === 'forgotten')
  if (forgotten) return null

  const replacementInput: ClaimAssert = {
    guildId: input.guildId,
    subjectUserId: input.subjectUserId,
    predicate: input.predicate,
    value: input.value,
    objectUserId: input.objectUserId,
    sourceKind: 'passive',
    channelId: input.channelId,
    observedAt: input.observedAt,
    needsReview: input.needsReview,
    period: 'current',
    provenance: input.provenance
  }
  if (input.needsReview && prior.value === input.value) return prior
  if (input.needsReview) return assert({ ...replacementInput, status: 'candidate' })
  if (prior.value === input.value) return assert(replacementInput)

  const priorItemId = itemIdForClaimRef(database, prior.id) as number
  updateMemoryItem(database, priorItemId, {
    status: 'superseded',
    superseded_by: null,
    ended_at: Date.now(),
    end_reason: 'superseded'
  })
  const replacement = assert(replacementInput, prior.pinned)
  if (replacement.status !== 'active') throw new Error('Replacement claim is not active')
  updateMemoryItem(database, priorItemId, { superseded_by: itemIdForClaimRef(database, replacement.id) as number })
  return (readItemClaim(database, replacement.id) as UserMemoryClaim | undefined) ?? null
}

/** The item half of `replaceActiveGuildClaim`; `assert` is the caller's guarded `assertGuildClaim`. */
export function replaceItemActiveGuildClaimInTransaction(
  input: {
    guildId: string
    existingId: number
    predicate: string
    value: string
    expiresAt: number | null
    eventDate?: string | null
    channelId: string
    observedAt?: number
    needsReview?: boolean
    provenance?: ClaimAssert['provenance']
  },
  assert: (input: ItemGuildClaimAssert) => GuildMemoryClaim
): GuildMemoryClaim | null {
  const database = getDb()
  const prior = getItemActiveGuildClaimById(input.guildId, input.existingId)
  if (!prior || prior.predicate !== input.predicate) return null

  const replacementInput: ItemGuildClaimAssert = {
    guildId: input.guildId,
    predicate: input.predicate,
    value: input.value,
    expiresAt: input.expiresAt,
    eventDate: input.eventDate ?? null,
    sourceKind: 'passive',
    channelId: input.channelId,
    observedAt: input.observedAt,
    needsReview: input.needsReview,
    status: input.needsReview ? 'candidate' : 'active',
    provenance: input.provenance
  }
  if (input.needsReview && prior.value === input.value) return prior
  if (input.needsReview || prior.value === input.value) return assert(replacementInput)

  const priorItemId = itemIdForClaimRef(database, prior.id) as number
  updateMemoryItem(database, priorItemId, {
    status: 'superseded',
    superseded_by: null,
    ended_at: Date.now(),
    end_reason: 'superseded'
  })
  const replacement = assert(replacementInput)
  if (replacement.status !== 'active') throw new Error('Replacement guild claim is not active')
  updateMemoryItem(database, priorItemId, { superseded_by: itemIdForClaimRef(database, replacement.id) as number })
  return (readItemClaim(database, replacement.id) as GuildMemoryClaim | undefined) ?? null
}

// The legacy readers' ORDER BY, so callers that take the first match pick the same fact.
const bySalience = (left: WriteMemoryItem, right: WriteMemoryItem) =>
  (right.salience ?? 0) - (left.salience ?? 0) || right.lastSeenAt - left.lastSeenAt || right.id - left.id
const byPinThenSalience = (left: WriteMemoryItem, right: WriteMemoryItem) =>
  Number(right.pinned) - Number(left.pinned) || bySalience(left, right)

export function getItemActiveClaims(guildId: string, userId: string): UserMemoryClaim[] {
  return listForWrite({ kind: 'fact', guildId, subjectKind: 'user', subjectUserId: userId, statuses: ['active'] })
    .sort(byPinThenSalience)
    .map((item) => mapWriteFact(item) as UserMemoryClaim)
}

export function getItemActiveClaimsForUsers(guildId: string, userIds: string[]): UserMemoryClaim[] {
  if (userIds.length === 0) return []
  return listForWrite({ kind: 'fact', guildId, subjectKind: 'user', statuses: ['active'] })
    .filter((item) => item.subjectUserId !== null && userIds.includes(item.subjectUserId))
    .map((item) => mapWriteFact(item) as UserMemoryClaim)
}

export function getItemActiveClaimById(
  guildId: string,
  subjectUserId: string,
  claimId: number
): UserMemoryClaim | undefined {
  const claim = readItemClaim(getDb(), claimId)
  return claim?.subjectKind === 'user' &&
    claim.guildId === guildId &&
    claim.subjectUserId === subjectUserId &&
    claim.status === 'active'
    ? claim
    : undefined
}

export function searchItemClaimIds(guildId: string, userIds: string[], message: string): Set<number> {
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  if (userIds.length === 0 || terms.length === 0) return new Set()
  const query = terms.map((term) => `"${term}"`).join(' OR ')
  return new Set(
    listForWrite({
      kind: 'fact',
      guildId,
      subjectKind: 'user',
      statuses: ['active'],
      needsReview: false,
      ftsQuery: query
    })
      .filter((item) => item.subjectUserId !== null && userIds.includes(item.subjectUserId))
      .slice(0, config.memory.maxClaimsPerTurn * 3)
      .map(({ id }) => id)
  )
}

export function searchItemClaims(guildId: string, userId: string, ftsQuery: string, limit: number): UserMemoryClaim[] {
  if (!ftsQuery.trim() || limit <= 0) return []
  return listForWrite({
    kind: 'fact',
    guildId,
    subjectKind: 'user',
    subjectUserId: userId,
    statuses: ['active'],
    ftsQuery,
    limit
  }).map((item) => mapWriteFact(item) as UserMemoryClaim)
}

export function getItemPriorClaimStatus(
  guildId: string,
  subject: { kind: 'guild' } | { kind: 'user'; userId: string },
  predicate: string,
  value: string,
  period: ClaimPeriod
): ClaimStatus | undefined {
  return findItemFact({
    guildId,
    subjectKind: subject.kind,
    subjectUserId: subject.kind === 'user' ? subject.userId : null,
    predicate,
    value,
    period
  })?.status as ClaimStatus | undefined
}

export function rejectItemClaimIdsForSpeakerInTransaction(
  guildId: string,
  userId: string,
  claimIds: number[]
): boolean {
  if (claimIds.length === 0) return false
  const claims = claimIds.map((id) => findMemoryItemById(getDb(), 'fact', id, 'memory_claim'))
  if (
    claims.some(
      (item) =>
        !item ||
        item.guild_id !== guildId ||
        item.subject_kind !== 'user' ||
        item.subject_user_id !== userId ||
        item.status !== 'active'
    )
  ) {
    return false
  }
  const endAt = Date.now()
  for (const item of claims) {
    if (!item) continue
    updateMemoryItem(getDb(), item.id, { status: 'rejected', ended_at: endAt, end_reason: 'forgotten' })
  }
  return true
}

export function pinItemClaim(claimId: number, pinned: boolean): void {
  const database = getDb()
  const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
  if (item?.subject_kind === 'user') updateMemoryItem(database, item.id, { pinned: pinned ? 1 : 0 })
}

export function touchItemClaims(claimIds: number[]): void {
  if (claimIds.length === 0) return
  const database = getDb()
  const now = Date.now()
  for (const claimId of claimIds) {
    const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
    if (item?.subject_kind === 'user') updateMemoryItem(database, item.id, { last_recalled_at: now })
  }
}

export function getItemEdges(guildId: string, userId: string): UserMemoryClaim[] {
  return listForWrite({ kind: 'fact', guildId, subjectKind: 'user', subjectUserId: userId, statuses: ['active'] })
    .filter((item) => item.objectKind === 'user')
    .sort(byPinThenSalience)
    .map((item) => mapWriteFact(item) as UserMemoryClaim)
}

export function getItemActiveGuildClaims(guildId: string, now: number): GuildMemoryClaim[] {
  return listForWrite({
    kind: 'fact',
    guildId,
    subjectKind: 'guild',
    statuses: ['active'],
    needsReview: false,
    now
  })
    .sort(bySalience)
    .map((item) => mapWriteFact(item) as GuildMemoryClaim)
}

export function getItemActiveGuildClaimById(guildId: string, claimId: number): GuildMemoryClaim | undefined {
  const claim = readItemClaim(getDb(), claimId)
  return claim?.subjectKind === 'guild' && claim.guildId === guildId && claim.status === 'active' ? claim : undefined
}

export function countItemActiveClaimsForUser(guildId: string, subjectUserId: string): number {
  return itemFactRows({ guildId, subjectKind: 'user', subjectUserId, statuses: ['active'] }).length
}

export function findItemUserClaimStatus(
  guildId: string,
  subjectUserId: string,
  predicate: string,
  value: string
): { status: string; end_reason: string | null } | undefined {
  const item = findItemFact({ guildId, subjectKind: 'user', subjectUserId, predicate, value, period: 'current' })
  return item ? { status: item.status, end_reason: item.endReason } : undefined
}

/** The item form of `findReclassifyRows`, in the same SQL so `lower()` and the tie-break match it exactly. */
export function findItemReclassifyRows(limit?: number): Array<{
  id: number
  guildId: string
  subjectUserId: string
  predicate: string
  value: string
}> {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(c.legacy_id, c.id) AS id, c.guild_id, c.subject_user_id, c.predicate, c.content AS value
       FROM memory_item c
       WHERE c.kind = 'fact' AND c.subject_kind = 'user' AND c.status = 'active' AND c.period = 'current'
         AND NOT EXISTS (
           SELECT 1 FROM memory_events e
           WHERE e.kind = 'claim_reclassified'
             AND json_extract(e.detail, '$.oldId') = CASE WHEN json_extract(e.detail, '$.v') = 2 THEN c.id ELSE c.legacy_id END
         )
         AND (
           c.predicate = 'misc'
           OR EXISTS (
             SELECT 1 FROM memory_item o
             WHERE o.kind = 'fact' AND o.subject_kind = 'user' AND o.status = 'active' AND o.period = 'current'
               AND o.guild_id = c.guild_id AND o.subject_user_id = c.subject_user_id
               AND o.predicate != c.predicate AND o.predicate != 'misc' AND lower(o.content) = lower(c.content)
               AND (o.salience > c.salience
                 OR (o.salience = c.salience AND o.predicate < c.predicate COLLATE BINARY))
           )
         )
       ORDER BY c.guild_id COLLATE BINARY, c.subject_user_id COLLATE BINARY, c.predicate COLLATE BINARY,
                lower(c.content) COLLATE BINARY, c.content COLLATE BINARY`
    )
    .all() as Array<{ id: number; guild_id: string; subject_user_id: string; predicate: string; value: string }>
  return (limit === undefined ? rows : rows.slice(0, limit)).map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    subjectUserId: row.subject_user_id,
    predicate: row.predicate,
    value: row.value
  }))
}

export function pruneItemClaimsInTransaction(now: number, standardRetentionDays: number, botUserId?: string): number {
  const userRows = itemFactRows({ subjectKind: 'user', statuses: ['candidate', 'active'] })
  const stale = userRows.filter((item) => {
    if (item.pinned || !item.predicate) return false
    const tier = PREDICATES[item.predicate as keyof typeof PREDICATES].retentionTier
    const days =
      tier === 'stable'
        ? config.memory.stableClaimRetentionDays
        : tier === 'standard'
          ? standardRetentionDays
          : config.memory.transientClaimRetentionDays
    return item.lastSeenAt < now - days * 24 * 60 * 60 * 1000
  })
  const guildRows = itemFactRows({ subjectKind: 'guild', statuses: ['candidate', 'active'] })
  const expiredGuild = guildRows.filter((item) => item.validUntil !== null && item.validUntil <= now)
  const staleGuildCandidates = guildRows.filter(
    (item) =>
      item.status === 'candidate' &&
      item.lastSeenAt < now - standardRetentionDays * 24 * 60 * 60 * 1000 &&
      (item.validUntil === null || item.validUntil > now)
  )
  rejectItemRows([...stale, ...expiredGuild, ...staleGuildCandidates], 'expired')
  const remainingBotClaims = botUserId
    ? itemFactRows({ subjectKind: 'user', statuses: ['active'] }).filter((item) => item.subjectUserId === botUserId)
    : []
  rejectItemRows(remainingBotClaims, 'self')
  const evicted = evictItemOverflowForAllSubjectsInTransaction()
  return (
    stale.length +
    expiredGuild.length +
    staleGuildCandidates.length +
    remainingBotClaims.length +
    evicted +
    purgeItemDeadClaims(now)
  )
}

export function rejectItemClaimsByRef(claims: readonly MemoryClaim[], reason: string): void {
  const database = getDb()
  const endedAt = Date.now()
  for (const claim of claims) {
    const item = findMemoryItemById(database, 'fact', claim.id, 'memory_claim')
    if (!item || (item.status !== 'candidate' && item.status !== 'active')) continue
    updateMemoryItem(database, item.id, { status: 'rejected', ended_at: endedAt, end_reason: reason })
  }
}

/** The item half of a move: the moved fact takes the old fact's evidence, pin and first sighting. Returns item IDs. */
export function linkItemReclassification(
  original: UserMemoryClaim,
  moved: UserMemoryClaim
): { oldId: number; newId: number } {
  const database = getDb()
  const oldId = itemIdForClaimRef(database, original.id) as number
  const newId = itemIdForClaimRef(database, moved.id) as number
  deleteLatestMemoryItemEvidence(database, newId)
  copyMemoryItemEvidence(database, oldId, newId)
  updateMemoryItem(database, newId, {
    pinned: moved.pinned || original.pinned ? 1 : 0,
    first_seen_at: Math.min(moved.firstSeenAt, original.firstSeenAt),
    salience: Math.max(moved.salience, original.salience),
    confidence: Math.max(
      moved.confidence,
      original.confidence,
      confidenceForEvidence(itemEvidenceCount(database, newId), original.lastSeenAt)
    )
  })
  updateMemoryItem(database, oldId, { superseded_by: newId })
  return { oldId, newId }
}

export function undoItemReclassifyInTransaction(oldItemId: number, created: boolean): boolean {
  const database = getDb()
  const oldItem = database.prepare("SELECT * FROM memory_item WHERE id = ? AND kind = 'fact'").get(oldItemId) as
    | StoredMemoryItem
    | undefined
  if (
    !oldItem ||
    oldItem.subject_kind !== 'user' ||
    oldItem.status !== 'rejected' ||
    oldItem.end_reason !== 'reclassified' ||
    oldItem.superseded_by === null
  ) {
    return false
  }
  updateMemoryItem(database, oldItem.id, {
    status: 'active',
    ended_at: null,
    end_reason: null,
    superseded_by: null
  })
  if (created) {
    const replacement = database.prepare('SELECT * FROM memory_item WHERE id = ?').get(oldItem.superseded_by) as
      | StoredMemoryItem
      | undefined
    if (
      replacement &&
      replacement.guild_id === oldItem.guild_id &&
      replacement.subject_kind === 'user' &&
      replacement.subject_user_id === oldItem.subject_user_id &&
      replacement.status === 'active'
    ) {
      updateMemoryItem(database, replacement.id, {
        status: 'rejected',
        superseded_by: null,
        ended_at: Date.now(),
        end_reason: 'removed'
      })
    }
  }
  return true
}
