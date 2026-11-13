import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { logger } from '../../utils/logger.js'
import { MAX_FACT_VALUE_LEN, isSafeFactScalar } from '../promptSafety.js'
import { SOURCE_WEIGHT, confidenceForEvidence } from './memoryClaimScoring.js'
import {
  activateItemClaimInTransaction,
  appendItemEvidenceInTransaction,
  assertItemClaimInTransaction,
  assertItemGuildClaimInTransaction,
  countItemActiveClaimsForUser,
  evictItemOverflowForAllSubjectsInTransaction,
  findItemReclassifyRows,
  findItemUserClaimStatus,
  getItemActiveClaimById,
  getItemActiveClaims,
  getItemActiveClaimsForUsers,
  getItemActiveGuildClaimById,
  getItemActiveGuildClaims,
  getItemEdges,
  getItemPriorClaimStatus,
  pinItemClaim,
  pruneItemClaimsInTransaction,
  readItemNicknameClaims,
  rejectItemClaimIdsForSpeakerInTransaction,
  rejectItemClaimInTransaction,
  rejectItemClaimsByRef,
  replaceItemActiveClaimInTransaction,
  replaceItemActiveGuildClaimInTransaction,
  retireItemClaimInTransaction,
  searchItemClaimIds,
  searchItemClaims,
  touchItemClaims
} from './memoryItems.js'
import {
  type GuildPredicateId,
  type MemoryPredicateId,
  PREDICATES,
  type PredicateId,
  baseSalienceOf,
  cardinalityOf,
  normalizePredicate
} from './predicates.js'
import type { RecallScope } from './privacy.js'
import { sensitiveValueReason } from './privacyGuard.js'

export { SOURCE_WEIGHT, confidenceForEvidence } from './memoryClaimScoring.js'

const DAY_MS = 24 * 60 * 60 * 1000

export type ClaimSource = 'explicit' | 'human' | 'passive' | 'legacy'
export type ClaimStatus = 'candidate' | 'active' | 'superseded' | 'rejected'
export type ClaimPeriod = 'current' | 'past'

type MemoryClaimBase = Readonly<{
  id: number
  guildId: string
  predicate: MemoryPredicateId
  value: string
  objectKind: 'user' | null
  objectUserId: string | null
  sourceKind: ClaimSource
  status: ClaimStatus
  period: ClaimPeriod
  confidence: number
  salience: number
  pinned: boolean
  needsReview: boolean
  supersededBy: number | null
  firstSeenAt: number
  lastSeenAt: number
  lastRecalledAt: number | null
  expiresAt: number | null
  eventDate: string | null
}>

export type UserMemoryClaim = MemoryClaimBase &
  Readonly<{ subjectKind: 'user'; subjectUserId: string; predicate: PredicateId }>

export type GuildMemoryClaim = MemoryClaimBase &
  Readonly<{ subjectKind: 'guild'; subjectUserId: null; predicate: GuildPredicateId }>

export type MemoryClaim = UserMemoryClaim | GuildMemoryClaim

export type EvidenceProvenance = Readonly<{
  jobId?: number
  sourceMessageId?: string
  speakerUserId?: string
}>

export type ClaimAssert = Readonly<{
  guildId: string
  subjectUserId: string
  predicate: string
  value: string
  sourceKind: ClaimSource
  channelId?: string
  observedAt?: number
  objectUserId?: string
  status?: Extract<ClaimStatus, 'candidate' | 'active'>
  needsReview?: boolean
  period?: ClaimPeriod
  provenance?: EvidenceProvenance
}>

export type ClaimRetract = Readonly<{
  guildId: string
  subjectUserId: string
  predicate: string
  value: string
}>

export type EvidenceInput = Readonly<{
  channelId?: string
  sourceKind: ClaimSource
  observedAt?: number
  effectiveAt?: number
  provenance?: EvidenceProvenance
}>

export type ClaimWriteOptions = Readonly<{
  transaction?: boolean
}>

type ClaimRow = {
  id: number
  guild_id: string
  subject_kind: 'user' | 'guild'
  subject_user_id: string | null
  predicate: MemoryPredicateId
  value: string
  object_kind: 'user' | null
  object_user_id: string | null
  source_kind: ClaimSource
  status: ClaimStatus
  period: string
  confidence: number
  salience: number
  pinned: number
  needs_review: number
  superseded_by: number | null
  first_seen_at: number
  last_seen_at: number
  last_recalled_at: number | null
  ended_at: number | null
  end_reason: string | null
  expires_at: number | null
  event_date: string | null
}

function mapClaim(row: ClaimRow): MemoryClaim {
  const base = {
    id: row.id,
    guildId: row.guild_id,
    predicate: row.predicate,
    value: row.value,
    objectKind: row.object_kind,
    objectUserId: row.object_user_id,
    sourceKind: row.source_kind,
    status: row.status,
    period: row.period as ClaimPeriod,
    confidence: row.confidence,
    salience: row.salience,
    pinned: row.pinned === 1,
    needsReview: row.needs_review === 1,
    supersededBy: row.superseded_by,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRecalledAt: row.last_recalled_at,
    expiresAt: row.expires_at,
    eventDate: row.event_date
  }
  return row.subject_kind === 'guild'
    ? { ...base, subjectKind: 'guild', subjectUserId: null, predicate: row.predicate as GuildPredicateId }
    : {
        ...base,
        subjectKind: 'user',
        subjectUserId: row.subject_user_id as string,
        predicate: row.predicate as PredicateId
      }
}

function mapUserClaim(row: ClaimRow): UserMemoryClaim {
  return mapClaim(row) as UserMemoryClaim
}

function mapGuildClaim(row: ClaimRow): GuildMemoryClaim {
  return mapClaim(row) as GuildMemoryClaim
}

function assertWritableGuild(guildId: string): void {
  if (guildId === 'global') throw new Error('Claims cannot use the global tenant')
}

function assertSafeValue(value: string): void {
  if (!isSafeFactScalar(value, MAX_FACT_VALUE_LEN)) throw new Error('Claim value is unsafe')
  // Value-only: by the time any writer reaches here normalizePredicate has collapsed a telling key like
  // `home_address` to `misc`, so the value is the only signal left. Reuses the existing message verbatim
  // because the extractor skips exactly that one and would otherwise abort the whole batch.
  const sensitive = sensitiveValueReason(value)
  if (sensitive) {
    logger.info({ reason: sensitive }, 'Refused to store a sensitive claim value')
    throw new Error('Claim value is unsafe')
  }
}

function sourceWeight(sourceKind: ClaimSource): number {
  return SOURCE_WEIGHT[sourceKind]
}

function getClaim(id: number): MemoryClaim | undefined {
  const row = getDb().prepare('SELECT * FROM memory_claim WHERE id = ?').get(id) as ClaimRow | undefined
  return row ? mapClaim(row) : undefined
}

function getUserClaim(id: number): UserMemoryClaim | undefined {
  const row = getDb().prepare("SELECT * FROM memory_claim WHERE id = ? AND subject_kind = 'user'").get(id) as
    | ClaimRow
    | undefined
  return row ? mapUserClaim(row) : undefined
}

function getGuildClaim(id: number): GuildMemoryClaim | undefined {
  const row = getDb()
    .prepare("SELECT * FROM memory_claim WHERE id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL")
    .get(id) as ClaimRow | undefined
  return row ? mapGuildClaim(row) : undefined
}

function appendEvidenceInTransaction(claimId: number, input: EvidenceInput): MemoryClaim {
  if (config.memory.store === 'item') return appendItemEvidenceInTransaction(claimId, input)
  const db = getDb()
  const observedAt = input.observedAt ?? Date.now()
  // A retried extraction job replays its writes: the (claim_id, job_id) index turns the replay into a no-op.
  db.prepare(
    'INSERT OR IGNORE INTO memory_evidence (claim_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    claimId,
    input.channelId ?? null,
    input.sourceKind,
    observedAt,
    input.effectiveAt ?? observedAt,
    input.provenance?.jobId ?? null,
    input.provenance?.sourceMessageId ?? null,
    input.provenance?.speakerUserId ?? null
  )
  const evidenceCount = (
    db.prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(claimId) as {
      count: number
    }
  ).count
  const confidence = confidenceForEvidence(evidenceCount, observedAt)
  db.prepare('UPDATE memory_claim SET confidence = ?, last_seen_at = MAX(last_seen_at, ?) WHERE id = ?').run(
    confidence,
    observedAt,
    claimId
  )
  return getClaim(claimId) as MemoryClaim
}

export function appendEvidence(claimId: number, input: EvidenceInput, options: ClaimWriteOptions = {}): MemoryClaim {
  const write = () => appendEvidenceInTransaction(claimId, input)
  return options.transaction ? write() : getDb().transaction(write)()
}

function rejectClaims(claims: MemoryClaim[], reason: string): void {
  const db = getDb()
  const reject = db.prepare(
    "UPDATE memory_claim SET status = 'rejected', ended_at = ?, end_reason = ? WHERE id = ? AND subject_kind = ? AND status IN ('candidate', 'active')"
  )
  const endedAt = Date.now()
  for (const claim of claims) {
    reject.run(endedAt, reason, claim.id, claim.subjectKind)
  }
}

// Past facts go first: history must never cost the member a fact that is true now.
function evictOverflow(guildId: string, subjectUserId: string): number {
  const overflow = (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active' AND pinned = 0
       ORDER BY (period = 'past') DESC, salience ASC, last_seen_at ASC, id ASC
       LIMIT MAX(0, (SELECT COUNT(*) FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active' AND pinned = 0) - ?)`
      )
      .all(guildId, subjectUserId, guildId, subjectUserId, config.memory.maxActiveClaimsPerUser) as ClaimRow[]
  ).map(mapUserClaim)

  rejectClaims(overflow, 'evicted')
  return overflow.length
}

function evictOverflowForAllSubjectsInTransaction(): number {
  if (config.memory.store === 'item') return evictItemOverflowForAllSubjectsInTransaction()
  const subjects = getDb()
    .prepare(
      "SELECT DISTINCT guild_id, subject_user_id FROM memory_claim WHERE subject_kind = 'user' AND status = 'active'"
    )
    .all() as Array<{ guild_id: string; subject_user_id: string }>
  return subjects.reduce((evicted, subject) => {
    return evicted + evictOverflow(subject.guild_id, subject.subject_user_id)
  }, 0)
}

export function evictOverflowForAllSubjects(): number {
  return getDb().transaction(evictOverflowForAllSubjectsInTransaction)()
}

export function pruneActiveClaimOverflow(): number {
  const evicted = evictOverflowForAllSubjects()
  if (evicted > 0) logger.info({ evicted }, 'Pruned overflow memory claims')
  return evicted
}

function purgeDeadClaims(now: number): number {
  const db = getDb()
  const cutoff = now - config.memory.deadClaimRetentionDays * DAY_MS
  const count = (
    db
      .prepare("SELECT COUNT(*) AS count FROM memory_claim WHERE status IN ('rejected', 'superseded') AND ended_at < ?")
      .get(cutoff) as { count: number }
  ).count
  if (count === 0) return 0

  db.prepare(
    `DELETE FROM memory_evidence
     WHERE claim_id IN (
       SELECT id FROM memory_claim WHERE status IN ('rejected', 'superseded') AND ended_at < ?
     )`
  ).run(cutoff)
  db.prepare("DELETE FROM memory_claim WHERE status IN ('rejected', 'superseded') AND ended_at < ?").run(cutoff)
  return count
}

function supersedePriorActive(claim: UserMemoryClaim): void {
  if (cardinalityOf(claim.predicate) !== 'single' || claim.period !== 'current') return

  const db = getDb()
  const superseded = (
    db
      .prepare(
        `SELECT * FROM memory_claim
         WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND predicate = ? AND status = 'active'
           AND period = 'current' AND id != ?`
      )
      .all(claim.guildId, claim.subjectUserId, claim.predicate, claim.id) as ClaimRow[]
  ).map(mapUserClaim)
  const update = db.prepare(
    "UPDATE memory_claim SET status = 'superseded', superseded_by = ?, ended_at = ?, end_reason = 'superseded' WHERE id = ? AND subject_kind = 'user' AND status = 'active'"
  )

  const endedAt = Date.now()
  for (const prior of superseded) {
    update.run(claim.id, endedAt, prior.id)
  }
  // A verified correction takes over the pin of the fact it replaces; a staged candidate has not earned it yet.
  if (claim.status === 'active' && superseded.some(({ pinned }) => pinned)) {
    db.prepare('UPDATE memory_claim SET pinned = 1 WHERE id = ?').run(claim.id)
  }
}

// `inheritedPin` is for a correction that already retired the pinned fact it replaces: the pin has to be on the
// row before the active-claim cap is enforced, or the cap evicts an unrelated claim in its place.
function assertClaimInTransaction(op: ClaimAssert, inheritedPin = false): UserMemoryClaim {
  assertWritableGuild(op.guildId)
  assertSafeValue(op.value)
  if (config.memory.store === 'item') return assertItemClaimInTransaction(op, inheritedPin)

  const db = getDb()
  const predicate = normalizePredicate(op.predicate)
  const observedAt = op.observedAt ?? Date.now()
  const period = op.period ?? 'current'
  const existing = db
    .prepare(
      "SELECT * FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? AND period = ?"
    )
    .get(op.guildId, op.subjectUserId, predicate, op.value, period) as ClaimRow | undefined

  if (op.sourceKind !== 'explicit' && existing?.status !== 'active') {
    // Forgetting is about the fact, not its period: it must not come back as history either. A row that was
    // explicitly restored in this period is active, and passive sightings keep refreshing it.
    const forgotten = db
      .prepare(
        `SELECT * FROM memory_claim
         WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ?
           AND status IN ('rejected', 'superseded') AND end_reason = 'forgotten'
         ORDER BY id LIMIT 1`
      )
      .get(op.guildId, op.subjectUserId, predicate, op.value) as ClaimRow | undefined
    if (forgotten) return mapUserClaim(forgotten)
  }

  if (existing) {
    // A retried job replays its own writes: the row already carries this job's evidence, so the replay ends here
    // with no salience bump, no revival and no new evidence.
    if (op.provenance?.jobId !== undefined) {
      const replayed = db
        .prepare('SELECT 1 FROM memory_evidence WHERE claim_id = ? AND job_id = ?')
        .get(existing.id, op.provenance.jobId)
      if (replayed) return mapUserClaim(existing)
    }
    const current = mapUserClaim(existing)
    const dead = current.status === 'rejected' || current.status === 'superseded'
    // An unverified statement may stage or revive a value, but never demote or flag one that is already active.
    const keepActive = current.status === 'active'
    const status = keepActive ? 'active' : (op.status ?? 'active')
    const needsReview =
      op.needsReview === undefined || (keepActive && op.needsReview) ? current.needsReview : op.needsReview
    const activating = current.status === 'candidate' && status === 'active'
    const salience = Math.min(
      1,
      Math.max(current.salience, baseSalienceOf(predicate) * sourceWeight(op.sourceKind)) + 0.02
    )
    // Being told a fact directly pins it, even when passive extraction got there first: the eviction
    // exemption exists for facts someone deliberately asked her to keep, and confirming one out loud is
    // that same act. Never unpins — a later passive sighting of a pinned fact must not demote it.
    const pinned = current.pinned || op.sourceKind === 'explicit' || inheritedPin ? 1 : 0
    db.prepare(
      'UPDATE memory_claim SET status = ?, superseded_by = ?, ended_at = ?, end_reason = ?, last_seen_at = ?, salience = ?, pinned = ?, needs_review = ? WHERE id = ?'
    ).run(
      status,
      dead ? null : current.supersededBy,
      dead ? null : existing.ended_at,
      dead ? null : existing.end_reason,
      Math.max(current.lastSeenAt, observedAt),
      salience,
      pinned,
      needsReview ? 1 : 0,
      current.id
    )
    appendEvidenceInTransaction(current.id, {
      channelId: op.channelId,
      sourceKind: op.sourceKind,
      observedAt,
      provenance: op.provenance
    })
    const claim = getUserClaim(current.id) as UserMemoryClaim
    if ((dead || activating) && claim.status === 'active') {
      supersedePriorActive(claim)
      evictOverflow(op.guildId, op.subjectUserId)
    }
    return getUserClaim(current.id) as UserMemoryClaim
  }

  const objectUserId = PREDICATES[predicate].objectKind === 'user' ? (op.objectUserId ?? null) : null
  const result = db
    .prepare(
      `INSERT INTO memory_claim (
        guild_id, subject_kind, subject_user_id, predicate, value, object_kind, object_user_id, source_kind, status,
        salience, pinned, needs_review, first_seen_at, last_seen_at, period
      ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      op.guildId,
      op.subjectUserId,
      predicate,
      op.value,
      objectUserId ? 'user' : null,
      objectUserId,
      op.sourceKind,
      op.status ?? 'active',
      baseSalienceOf(predicate) * sourceWeight(op.sourceKind),
      // A fact someone asked her to remember outright is the one thing the eviction ceiling should not
      // take. Passive extraction stays evictable — it is inference, not instruction.
      op.sourceKind === 'explicit' || inheritedPin ? 1 : 0,
      op.needsReview ? 1 : 0,
      observedAt,
      observedAt,
      period
    )
  appendEvidenceInTransaction(Number(result.lastInsertRowid), {
    channelId: op.channelId,
    sourceKind: op.sourceKind,
    observedAt,
    provenance: op.provenance
  })
  const claim = getUserClaim(Number(result.lastInsertRowid)) as UserMemoryClaim

  if (claim.status === 'active') supersedePriorActive(claim)

  if (claim.status === 'active') evictOverflow(op.guildId, op.subjectUserId)
  return getUserClaim(claim.id) as UserMemoryClaim
}

export function assertClaim(op: ClaimAssert, options: ClaimWriteOptions = {}): UserMemoryClaim {
  const write = () => assertClaimInTransaction(op)
  return options.transaction ? write() : getDb().transaction(write)()
}

export function activateClaim(guildId: string, claimId: number, options: ClaimWriteOptions = {}): UserMemoryClaim {
  const write = () => {
    assertWritableGuild(guildId)
    if (config.memory.store === 'item') return activateItemClaimInTransaction(guildId, claimId)
    const row = getDb()
      .prepare(
        "SELECT * FROM memory_claim WHERE id = ? AND guild_id = ? AND subject_kind = 'user' AND status = 'candidate'"
      )
      .get(claimId, guildId) as ClaimRow | undefined
    if (!row) throw new Error('Candidate claim not found')

    getDb().prepare("UPDATE memory_claim SET status = 'active', needs_review = 0 WHERE id = ?").run(claimId)
    const claim = getUserClaim(claimId) as UserMemoryClaim
    supersedePriorActive(claim)
    evictOverflow(claim.guildId, claim.subjectUserId)
    return getUserClaim(claimId) as UserMemoryClaim
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function retractClaim(op: ClaimRetract, options: ClaimWriteOptions = {}): boolean {
  const write = () => {
    assertWritableGuild(op.guildId)
    const predicate = normalizePredicate(op.predicate)
    if (config.memory.store === 'item') {
      const claim = getItemActiveClaims(op.guildId, op.subjectUserId).find(
        (item) => item.predicate === predicate && item.value === op.value
      )
      if (!claim) return false
      rejectItemClaimsByRef([claim], 'removed')
      return true
    }
    const row = getDb()
      .prepare(
        "SELECT * FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? AND status = 'active'"
      )
      .get(op.guildId, op.subjectUserId, predicate, op.value) as ClaimRow | undefined
    if (!row) return false
    rejectClaims([mapUserClaim(row)], 'removed')
    return true
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function retireClaim(
  guildId: string,
  claimId: number,
  reason: 'retracted' | 'reclassified',
  supersededBy?: number,
  options: ClaimWriteOptions = {}
): boolean {
  const write = () => {
    assertWritableGuild(guildId)
    if (config.memory.store === 'item') {
      return retireItemClaimInTransaction(guildId, claimId, reason, supersededBy)
    }
    const result = getDb()
      .prepare(
        "UPDATE memory_claim SET status = 'rejected', ended_at = ?, end_reason = ?, superseded_by = ? WHERE id = ? AND guild_id = ? AND status = 'active'"
      )
      .run(Date.now(), reason, reason === 'reclassified' ? (supersededBy ?? null) : null, claimId, guildId)
    return result.changes > 0
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function pinClaim(claimId: number): void {
  if (config.memory.store === 'item') {
    pinItemClaim(claimId, true)
    return
  }
  getDb().prepare("UPDATE memory_claim SET pinned = 1 WHERE id = ? AND subject_kind = 'user'").run(claimId)
}

export function unpinClaim(claimId: number): void {
  if (config.memory.store === 'item') {
    pinItemClaim(claimId, false)
    return
  }
  getDb().prepare("UPDATE memory_claim SET pinned = 0 WHERE id = ? AND subject_kind = 'user'").run(claimId)
}

export function getActiveClaims(guildId: string, userId: string): UserMemoryClaim[] {
  if (config.memory.store === 'item') return getItemActiveClaims(guildId, userId)
  return (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active'
       ORDER BY pinned DESC, salience DESC, last_seen_at DESC, id DESC`
      )
      .all(guildId, userId) as ClaimRow[]
  ).map(mapUserClaim)
}

export function getActiveClaimsForUsers(guildId: string, userIds: string[]): UserMemoryClaim[] {
  if (userIds.length === 0) return []
  if (config.memory.store === 'item') return getItemActiveClaimsForUsers(guildId, userIds)
  const placeholders = userIds.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND status = 'active' AND subject_user_id IN (${placeholders})`
    )
    .all(guildId, ...userIds) as ClaimRow[]
  return rows.map(mapUserClaim)
}

export function searchClaimIds(guildId: string, userIds: string[], message: string): Set<number> {
  if (config.memory.store === 'item') return searchItemClaimIds(guildId, userIds, message)
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  if (userIds.length === 0 || terms.length === 0) return new Set()

  const placeholders = userIds.map(() => '?').join(', ')
  const query = terms.map((term) => `"${term}"`).join(' OR ')
  const rows = getDb()
    .prepare(
      `SELECT memory_claim.id FROM memory_claim
       JOIN memory_claim_fts ON memory_claim.id = memory_claim_fts.rowid
       WHERE memory_claim.guild_id = ? AND memory_claim.subject_kind = 'user' AND memory_claim.status = 'active'
         AND memory_claim.needs_review = 0 AND memory_claim.subject_user_id IN (${placeholders})
         AND memory_claim_fts MATCH ?
       ORDER BY bm25(memory_claim_fts), memory_claim.salience DESC
       LIMIT ?`
    )
    .all(guildId, ...userIds, query, config.memory.maxClaimsPerTurn * 3) as Array<{ id: number }>
  return new Set(rows.map(({ id }) => id))
}

export function getActiveClaimById(
  guildId: string,
  subjectUserId: string,
  claimId: number
): UserMemoryClaim | undefined {
  if (config.memory.store === 'item') return getItemActiveClaimById(guildId, subjectUserId, claimId)
  const row = getDb()
    .prepare(
      `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND id = ? AND status = 'active'`
    )
    .get(guildId, subjectUserId, claimId) as ClaimRow | undefined
  return row ? mapUserClaim(row) : undefined
}

export function replaceActiveClaim(
  input: {
    guildId: string
    subjectUserId: string
    existingId: number
    predicate: PredicateId
    value: string
    channelId: string
    observedAt?: number
    objectUserId?: string
    needsReview?: boolean
    provenance?: EvidenceProvenance
  },
  options: ClaimWriteOptions = {}
): UserMemoryClaim | null {
  const write = () => {
    assertWritableGuild(input.guildId)
    if (config.memory.store === 'item') return replaceItemActiveClaimInTransaction(input, assertClaimInTransaction)
    const prior = getActiveClaimById(input.guildId, input.subjectUserId, input.existingId)
    if (!prior || prior.predicate !== input.predicate || prior.period !== 'current') return null

    const forgotten = getDb()
      .prepare(
        `SELECT 1 FROM memory_claim
         WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ?
           AND status IN ('rejected', 'superseded') AND end_reason = 'forgotten'`
      )
      .get(input.guildId, input.subjectUserId, input.predicate, input.value)
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
    if (input.needsReview) {
      return assertClaim({ ...replacementInput, status: 'candidate' }, { transaction: true })
    }
    if (prior.value === input.value) return assertClaim(replacementInput, { transaction: true })

    const db = getDb()
    const endedAt = Date.now()
    const retired = db
      .prepare(
        `UPDATE memory_claim SET status = 'superseded', superseded_by = NULL, ended_at = ?, end_reason = 'superseded'
         WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND id = ? AND status = 'active'`
      )
      .run(endedAt, input.guildId, input.subjectUserId, input.existingId)
    if (retired.changes !== 1) return null

    const replacement = assertClaimInTransaction(replacementInput, prior.pinned)
    if (replacement.status !== 'active') throw new Error('Replacement claim is not active')
    db.prepare(
      `UPDATE memory_claim SET superseded_by = ?
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND id = ? AND status = 'superseded'`
    ).run(replacement.id, input.guildId, input.subjectUserId, input.existingId)
    return getUserClaim(replacement.id) ?? null
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function rejectActiveClaimById(
  input: { guildId: string; subjectUserId: string; existingId: number },
  options: ClaimWriteOptions = {}
): boolean {
  const write = () => {
    assertWritableGuild(input.guildId)
    if (config.memory.store === 'item') {
      return rejectItemClaimInTransaction(input.existingId, 'removed', {
        guildId: input.guildId,
        subjectKind: 'user',
        subjectUserId: input.subjectUserId
      })
    }
    const result = getDb()
      .prepare(
        `UPDATE memory_claim SET status = 'rejected', superseded_by = NULL, ended_at = ?, end_reason = 'removed'
         WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND id = ? AND status = 'active'`
      )
      .run(Date.now(), input.guildId, input.subjectUserId, input.existingId)
    return result.changes === 1
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function searchClaims(guildId: string, userId: string, ftsQuery: string, limit: number): UserMemoryClaim[] {
  if (config.memory.store === 'item') return searchItemClaims(guildId, userId, ftsQuery, limit)
  if (!ftsQuery.trim() || limit <= 0) return []
  return (
    getDb()
      .prepare(
        `SELECT memory_claim.* FROM memory_claim
       JOIN memory_claim_fts ON memory_claim.id = memory_claim_fts.rowid
       WHERE memory_claim.guild_id = ? AND memory_claim.subject_kind = 'user'
         AND memory_claim.subject_user_id = ? AND memory_claim.status = 'active'
         AND memory_claim_fts MATCH ?
       ORDER BY bm25(memory_claim_fts), memory_claim.salience DESC
       LIMIT ?`
      )
      .all(guildId, userId, ftsQuery, limit) as ClaimRow[]
  ).map(mapUserClaim)
}

export type ClaimSubjectKey = Readonly<{ kind: 'guild' } | { kind: 'user'; userId: string }>

export function priorClaimStatus(
  guildId: string,
  subject: ClaimSubjectKey,
  predicate: string,
  value: string,
  period: ClaimPeriod
): ClaimStatus | undefined {
  if (config.memory.store === 'item') return getItemPriorClaimStatus(guildId, subject, predicate, value, period)
  const row = getDb()
    .prepare(
      'SELECT status FROM memory_claim WHERE guild_id = ? AND subject_kind = ? AND subject_user_id IS ? AND predicate = ? AND value = ? AND period = ?'
    )
    .get(guildId, subject.kind, subject.kind === 'user' ? subject.userId : null, predicate, value, period) as
    | { status: ClaimStatus }
    | undefined
  return row?.status
}

export function rejectClaimIdsForSpeaker(guildId: string, userId: string, claimIds: number[]): boolean {
  if (claimIds.length === 0) return false
  const write = () => {
    assertWritableGuild(guildId)
    if (config.memory.store === 'item') return rejectItemClaimIdsForSpeakerInTransaction(guildId, userId, claimIds)
    const placeholders = claimIds.map(() => '?').join(', ')
    const claims = (
      getDb()
        .prepare(
          `SELECT * FROM memory_claim
           WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active' AND id IN (${placeholders})`
        )
        .all(guildId, userId, ...claimIds) as ClaimRow[]
    ).map(mapUserClaim)
    if (claims.length !== claimIds.length) return false
    rejectClaims(claims, 'forgotten')
    return true
  }
  return getDb().transaction(write)()
}

export function getEdges(guildId: string, userId: string): UserMemoryClaim[] {
  if (config.memory.store === 'item') return getItemEdges(guildId, userId)
  return (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active' AND object_kind = 'user'
       ORDER BY pinned DESC, salience DESC, last_seen_at DESC, id DESC`
      )
      .all(guildId, userId) as ClaimRow[]
  ).map(mapUserClaim)
}

export function activeNicknameClaims(
  guildId: string,
  scope: RecallScope
): Array<{ id: number; user_id: string; value: string }> {
  if (config.memory.store === 'item') return readItemNicknameClaims(guildId, scope)
  return getDb()
    .prepare(
      `SELECT id, subject_user_id AS user_id, value FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND status = 'active' AND needs_review = 0 AND period = 'current'
         AND predicate = 'nickname'
       ORDER BY id`
    )
    .all(guildId) as Array<{ id: number; user_id: string; value: string }>
}

/** Correlated half of the name-index presence check: this user_names row holds a claim in the guild. */
export const USER_CLAIM_PRESENCE = {
  legacy:
    "EXISTS(SELECT 1 FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = user_names.user_id)",
  dual: "EXISTS(SELECT 1 FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = user_names.user_id)",
  item: "EXISTS(SELECT 1 FROM memory_item WHERE guild_id = ? AND kind = 'fact' AND subject_kind = 'user' AND subject_user_id = user_names.user_id)"
} as const

export type ReclassifyRow = Readonly<{
  id: number
  guildId: string
  subjectUserId: string
  predicate: PredicateId
  value: string
}>

type ReclassifyCandidateRow = {
  id: number
  guild_id: string
  subject_user_id: string
  predicate: PredicateId
  value: string
}

export function findReclassifyRows(limit: number): ReclassifyRow[] {
  if (config.memory.store === 'item') {
    return findItemReclassifyRows(limit).map(({ id, guildId, subjectUserId, predicate, value }) => ({
      id,
      guildId,
      subjectUserId,
      predicate: predicate as PredicateId,
      value
    }))
  }
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.guild_id, c.subject_user_id, c.predicate, c.value
       FROM memory_claim c
       WHERE c.subject_kind = 'user' AND c.status = 'active' AND c.period = 'current'
         AND c.id NOT IN (
           SELECT old_id FROM (
             SELECT CASE WHEN json_extract(detail, '$.v') = 2
                      THEN (SELECT legacy_id FROM memory_item WHERE id = json_extract(detail, '$.oldId'))
                      ELSE json_extract(detail, '$.oldId') END AS old_id
             FROM memory_events WHERE kind = 'claim_reclassified'
           ) WHERE old_id IS NOT NULL
         )
         AND (
           c.predicate = 'misc'
           OR EXISTS (
             SELECT 1 FROM memory_claim o
             WHERE o.subject_kind = 'user' AND o.status = 'active' AND o.period = 'current'
               AND o.guild_id = c.guild_id AND o.subject_user_id = c.subject_user_id
               AND o.predicate != c.predicate AND o.predicate != 'misc' AND lower(o.value) = lower(c.value)
               AND (o.salience > c.salience OR (o.salience = c.salience AND o.id < c.id))
           )
         )
       ORDER BY random()
       LIMIT ?`
    )
    .all(limit) as ReclassifyCandidateRow[]
  return rows.map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    subjectUserId: row.subject_user_id,
    predicate: row.predicate,
    value: row.value
  }))
}

export function countActiveClaimsForUser(guildId: string, subjectUserId: string): number {
  if (config.memory.store === 'item') return countItemActiveClaimsForUser(guildId, subjectUserId)
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND status = 'active'"
      )
      .get(guildId, subjectUserId) as { count: number }
  ).count
}

export function findUserClaimStatus(
  guildId: string,
  subjectUserId: string,
  predicate: PredicateId,
  value: string
): { status: string; end_reason: string | null } | undefined {
  if (config.memory.store === 'item') return findItemUserClaimStatus(guildId, subjectUserId, predicate, value)
  return getDb()
    .prepare(
      "SELECT status, end_reason FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? AND period = 'current'"
    )
    .get(guildId, subjectUserId, predicate, value) as { status: string; end_reason: string | null } | undefined
}

export function findReclassifiedClaim(
  id: number
): { guild_id: string; subject_user_id: string; superseded_by: number | null } | undefined {
  return getDb()
    .prepare(
      "SELECT guild_id, subject_user_id, superseded_by FROM memory_claim WHERE id = ? AND subject_kind = 'user' AND status = 'rejected' AND end_reason = 'reclassified'"
    )
    .get(id) as { guild_id: string; subject_user_id: string; superseded_by: number | null } | undefined
}

export function assertGuildClaim(
  input: {
    guildId: string
    predicate: GuildPredicateId
    value: string
    expiresAt: number | null
    eventDate?: string | null
    sourceKind: ClaimSource
    channelId?: string
    observedAt?: number
    needsReview?: boolean
    status?: Extract<ClaimStatus, 'candidate' | 'active'>
    provenance?: EvidenceProvenance
  },
  options: ClaimWriteOptions = {}
): GuildMemoryClaim {
  const write = () => {
    assertWritableGuild(input.guildId)
    assertSafeValue(input.value)
    const requiresExpiry = input.predicate === 'upcoming_event' || input.predicate === 'plan'
    if (requiresExpiry && (!Number.isSafeInteger(input.expiresAt) || input.expiresAt === null)) {
      throw new Error('Guild events and plans require a valid expiry')
    }
    if (!requiresExpiry && input.expiresAt !== null) throw new Error('Only guild events and plans may expire')

    if (config.memory.store === 'item') return assertItemGuildClaimInTransaction(input)

    const db = getDb()
    const observedAt = input.observedAt ?? Date.now()
    const existing = db
      .prepare(
        "SELECT * FROM memory_claim WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND predicate = ? AND value = ?"
      )
      .get(input.guildId, input.predicate, input.value) as ClaimRow | undefined

    if (existing) {
      // A retried job replays its own writes: the row already carries this job's evidence, so the replay ends here
      // with no salience bump, no revival and no new evidence.
      if (input.provenance?.jobId !== undefined) {
        const replayed = db
          .prepare('SELECT 1 FROM memory_evidence WHERE claim_id = ? AND job_id = ?')
          .get(existing.id, input.provenance.jobId)
        if (replayed) return mapGuildClaim(existing)
      }
      const current = mapGuildClaim(existing)
      const dead = current.status === 'rejected' || current.status === 'superseded'
      const keepActive = current.status === 'active'
      const status = keepActive ? 'active' : (input.status ?? 'active')
      const needsReview =
        input.needsReview === undefined || (keepActive && input.needsReview) ? current.needsReview : input.needsReview
      db.prepare(
        'UPDATE memory_claim SET status = ?, superseded_by = ?, ended_at = ?, end_reason = ?, last_seen_at = ?, salience = ?, expires_at = ?, event_date = ?, needs_review = ? WHERE id = ?'
      ).run(
        status,
        dead ? null : current.supersededBy,
        dead ? null : existing.ended_at,
        dead ? null : existing.end_reason,
        Math.max(current.lastSeenAt, observedAt),
        Math.min(1, current.salience + 0.02),
        input.expiresAt,
        input.eventDate ?? null,
        needsReview ? 1 : 0,
        current.id
      )
      return appendEvidenceInTransaction(current.id, {
        channelId: input.channelId,
        sourceKind: input.sourceKind,
        observedAt,
        provenance: input.provenance
      }) as GuildMemoryClaim
    }

    const result = db
      .prepare(
        `INSERT INTO memory_claim (
          guild_id, subject_kind, subject_user_id, predicate, value, object_kind, object_user_id, source_kind, status,
          confidence, salience, pinned, needs_review, first_seen_at, last_seen_at, expires_at, event_date
        ) VALUES (?, 'guild', NULL, ?, ?, NULL, NULL, ?, ?, 0.5, ?, 0, ?, ?, ?, ?, ?)`
      )
      .run(
        input.guildId,
        input.predicate,
        input.value,
        input.sourceKind,
        input.status ?? 'active',
        0.75 * sourceWeight(input.sourceKind),
        input.needsReview ? 1 : 0,
        observedAt,
        observedAt,
        input.expiresAt,
        input.eventDate ?? null
      )
    appendEvidenceInTransaction(Number(result.lastInsertRowid), {
      channelId: input.channelId,
      sourceKind: input.sourceKind,
      observedAt,
      provenance: input.provenance
    })
    return getGuildClaim(Number(result.lastInsertRowid)) as GuildMemoryClaim
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function getActiveGuildClaims(guildId: string, now: number = Date.now()): GuildMemoryClaim[] {
  if (config.memory.store === 'item') return getItemActiveGuildClaims(guildId, now)
  return (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
         WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND status = 'active'
           AND needs_review = 0 AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY salience DESC, last_seen_at DESC, id DESC`
      )
      .all(guildId, now) as ClaimRow[]
  ).map(mapGuildClaim)
}

export function getActiveGuildClaimById(guildId: string, claimId: number): GuildMemoryClaim | undefined {
  if (config.memory.store === 'item') return getItemActiveGuildClaimById(guildId, claimId)
  const row = getDb()
    .prepare(
      `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND id = ? AND status = 'active'`
    )
    .get(guildId, claimId) as ClaimRow | undefined
  return row ? mapGuildClaim(row) : undefined
}

export function replaceActiveGuildClaim(
  input: {
    guildId: string
    existingId: number
    predicate: GuildPredicateId
    value: string
    expiresAt: number | null
    eventDate?: string | null
    channelId: string
    observedAt?: number
    needsReview?: boolean
    provenance?: EvidenceProvenance
  },
  options: ClaimWriteOptions = {}
): GuildMemoryClaim | null {
  const write = () => {
    assertWritableGuild(input.guildId)
    if (config.memory.store === 'item') {
      return replaceItemActiveGuildClaimInTransaction(input, (replacement) =>
        assertGuildClaim({ ...replacement, predicate: input.predicate }, { transaction: true })
      )
    }
    const prior = getActiveGuildClaimById(input.guildId, input.existingId)
    if (!prior || prior.predicate !== input.predicate) return null

    const replacementInput = {
      guildId: input.guildId,
      predicate: input.predicate,
      value: input.value,
      expiresAt: input.expiresAt,
      eventDate: input.eventDate ?? null,
      sourceKind: 'passive' as const,
      channelId: input.channelId,
      observedAt: input.observedAt,
      needsReview: input.needsReview,
      status: input.needsReview ? ('candidate' as const) : ('active' as const),
      provenance: input.provenance
    }
    if (input.needsReview && prior.value === input.value) return prior
    if (input.needsReview) return assertGuildClaim(replacementInput, { transaction: true })
    if (prior.value === input.value) return assertGuildClaim(replacementInput, { transaction: true })

    const db = getDb()
    const endedAt = Date.now()
    const retired = db
      .prepare(
        `UPDATE memory_claim SET status = 'superseded', superseded_by = NULL, ended_at = ?, end_reason = 'superseded'
         WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND id = ? AND status = 'active'`
      )
      .run(endedAt, input.guildId, input.existingId)
    if (retired.changes !== 1) return null

    const replacement = assertGuildClaim(replacementInput, { transaction: true })
    if (replacement.status !== 'active') throw new Error('Replacement guild claim is not active')
    db.prepare(
      `UPDATE memory_claim SET superseded_by = ?
       WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND id = ? AND status = 'superseded'`
    ).run(replacement.id, input.guildId, input.existingId)
    return getGuildClaim(replacement.id) ?? null
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function rejectActiveGuildClaimById(
  input: { guildId: string; existingId: number },
  options: ClaimWriteOptions = {}
): boolean {
  const write = () => {
    assertWritableGuild(input.guildId)
    if (config.memory.store === 'item') {
      return rejectItemClaimInTransaction(input.existingId, 'removed', {
        guildId: input.guildId,
        subjectKind: 'guild'
      })
    }
    const result = getDb()
      .prepare(
        `UPDATE memory_claim SET status = 'rejected', superseded_by = NULL, ended_at = ?, end_reason = 'removed'
         WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND id = ? AND status = 'active'`
      )
      .run(Date.now(), input.guildId, input.existingId)
    return result.changes === 1
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function touchRecalled(claimIds: number[]): void {
  if (claimIds.length === 0) return
  if (config.memory.store === 'item') {
    touchItemClaims(claimIds)
    return
  }
  const placeholders = claimIds.map(() => '?').join(', ')
  getDb()
    .prepare(`UPDATE memory_claim SET last_recalled_at = ? WHERE subject_kind = 'user' AND id IN (${placeholders})`)
    .run(Date.now(), ...claimIds)
}

export function pruneStaleClaims(
  standardRetentionDays: number = config.memory.claimRetentionDays,
  botUserId?: string
): number {
  const now = Date.now()
  if (config.memory.store === 'item') {
    const pruned = getDb().transaction(() => pruneItemClaimsInTransaction(now, standardRetentionDays, botUserId))()
    if (pruned > 0) logger.info({ pruned, standardRetentionDays }, 'Pruned memory claims')
    return pruned
  }
  const retentionDays = {
    stable: config.memory.stableClaimRetentionDays,
    standard: standardRetentionDays,
    transient: config.memory.transientClaimRetentionDays
  }
  const pruned = getDb().transaction(() => {
    const db = getDb()
    const staleCandidates = (
      db
        .prepare(
          "SELECT * FROM memory_claim WHERE subject_kind = 'user' AND status IN ('candidate', 'active') AND pinned = 0"
        )
        .all() as ClaimRow[]
    ).filter(({ predicate, last_seen_at }) => {
      const tier = PREDICATES[predicate as PredicateId].retentionTier
      return last_seen_at < now - retentionDays[tier] * DAY_MS
    })
    const stale = staleCandidates.map(mapClaim)
    const expiredGuild = (
      db
        .prepare(
          `SELECT * FROM memory_claim
           WHERE subject_kind = 'guild' AND subject_user_id IS NULL AND status IN ('candidate', 'active')
             AND expires_at IS NOT NULL AND expires_at <= ?`
        )
        .all(now) as ClaimRow[]
    ).map(mapGuildClaim)
    const staleGuildCandidates = (
      db
        .prepare(
          `SELECT * FROM memory_claim
           WHERE subject_kind = 'guild' AND subject_user_id IS NULL AND status = 'candidate'
             AND last_seen_at < ? AND (expires_at IS NULL OR expires_at > ?)`
        )
        .all(now - standardRetentionDays * DAY_MS, now) as ClaimRow[]
    ).map(mapGuildClaim)
    rejectClaims([...stale, ...expiredGuild, ...staleGuildCandidates], 'expired')
    const botClaims = botUserId
      ? (
          db
            .prepare(
              "SELECT * FROM memory_claim WHERE subject_kind = 'user' AND status = 'active' AND subject_user_id = ?"
            )
            .all(botUserId) as ClaimRow[]
        ).map(mapClaim)
      : []
    rejectClaims(botClaims, 'self')
    const evicted = evictOverflowForAllSubjectsInTransaction()
    return (
      stale.length +
      expiredGuild.length +
      staleGuildCandidates.length +
      botClaims.length +
      evicted +
      purgeDeadClaims(now)
    )
  })()
  if (pruned > 0) logger.info({ pruned, standardRetentionDays }, 'Pruned memory claims')
  return pruned
}
