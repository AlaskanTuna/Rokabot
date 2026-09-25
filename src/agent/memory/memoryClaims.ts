import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { logger } from '../../utils/logger.js'
import { MAX_FACT_VALUE_LEN, isSafeFactScalar } from '../promptSafety.js'
import {
  type GuildPredicateId,
  type MemoryPredicateId,
  PREDICATES,
  type PredicateId,
  baseSalienceOf,
  cardinalityOf,
  normalizePredicate
} from './predicates.js'
import { sensitiveValueReason } from './privacyGuard.js'

const DAY_MS = 24 * 60 * 60 * 1000

export type ClaimSource = 'explicit' | 'human' | 'passive' | 'legacy'
export type ClaimStatus = 'candidate' | 'active' | 'superseded' | 'rejected'

type MemoryClaimBase = Readonly<{
  id: number
  guildId: string
  predicate: MemoryPredicateId
  value: string
  objectKind: 'user' | null
  objectUserId: string | null
  sourceKind: ClaimSource
  status: ClaimStatus
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

const SOURCE_WEIGHT: Readonly<Record<ClaimSource, number>> = {
  explicit: 1,
  human: 1,
  passive: 0.75,
  legacy: 0.5
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

/** Evidence count raises confidence, while recent observation gets a small freshness bonus. */
export function confidenceForEvidence(evidenceCount: number, observedAt: number, now: number = Date.now()): number {
  const age = Math.max(0, now - observedAt)
  const freshness = age <= 24 * 60 * 60 * 1000 ? 0.1 : age <= 7 * 24 * 60 * 60 * 1000 ? 0.05 : 0
  return Math.min(0.95, 0.4 + Math.min(0.4, evidenceCount * 0.1) + freshness)
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
  const db = getDb()
  const observedAt = input.observedAt ?? Date.now()
  db.prepare('INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (?, ?, ?, ?)').run(
    claimId,
    input.channelId ?? null,
    input.sourceKind,
    observedAt
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

function evictOverflow(guildId: string, subjectUserId: string): number {
  const overflow = (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active' AND pinned = 0
       ORDER BY salience ASC, last_seen_at ASC, id ASC
       LIMIT MAX(0, (SELECT COUNT(*) FROM memory_claim WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active') - ?)`
      )
      .all(guildId, subjectUserId, guildId, subjectUserId, config.memory.maxActiveClaimsPerUser) as ClaimRow[]
  ).map(mapUserClaim)

  rejectClaims(overflow, 'evicted')
  return overflow.length
}

function evictOverflowForAllSubjectsInTransaction(): number {
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
  if (cardinalityOf(claim.predicate) !== 'single') return

  const db = getDb()
  const superseded = (
    db
      .prepare(
        `SELECT * FROM memory_claim
         WHERE guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND predicate = ? AND status = 'active' AND id != ?`
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
}

function assertClaimInTransaction(op: ClaimAssert): UserMemoryClaim {
  assertWritableGuild(op.guildId)
  assertSafeValue(op.value)

  const db = getDb()
  const predicate = normalizePredicate(op.predicate)
  const observedAt = op.observedAt ?? Date.now()
  const existing = db
    .prepare(
      "SELECT * FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ?"
    )
    .get(op.guildId, op.subjectUserId, predicate, op.value) as ClaimRow | undefined

  if (existing) {
    const current = mapUserClaim(existing)
    const dead = current.status === 'rejected' || current.status === 'superseded'
    if (dead && existing.end_reason === 'forgotten' && op.sourceKind !== 'explicit') return current
    const salience = Math.min(
      1,
      Math.max(current.salience, baseSalienceOf(predicate) * sourceWeight(op.sourceKind)) + 0.02
    )
    // Being told a fact directly pins it, even when passive extraction got there first: the eviction
    // exemption exists for facts someone deliberately asked her to keep, and confirming one out loud is
    // that same act. Never unpins — a later passive sighting of a pinned fact must not demote it.
    const pinned = current.pinned || op.sourceKind === 'explicit' ? 1 : 0
    db.prepare(
      'UPDATE memory_claim SET status = ?, superseded_by = ?, ended_at = ?, end_reason = ?, last_seen_at = ?, salience = ?, pinned = ? WHERE id = ?'
    ).run(
      dead ? 'active' : current.status,
      dead ? null : current.supersededBy,
      dead ? null : existing.ended_at,
      dead ? null : existing.end_reason,
      Math.max(current.lastSeenAt, observedAt),
      salience,
      pinned,
      current.id
    )
    appendEvidenceInTransaction(current.id, {
      channelId: op.channelId,
      sourceKind: op.sourceKind,
      observedAt
    })
    const claim = getUserClaim(current.id) as UserMemoryClaim
    if (dead && claim.status === 'active') {
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
        salience, pinned, needs_review, first_seen_at, last_seen_at
      ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      op.sourceKind === 'explicit' ? 1 : 0,
      op.needsReview ? 1 : 0,
      observedAt,
      observedAt
    )
  appendEvidenceInTransaction(Number(result.lastInsertRowid), {
    channelId: op.channelId,
    sourceKind: op.sourceKind,
    observedAt
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
    const row = getDb()
      .prepare(
        "SELECT * FROM memory_claim WHERE id = ? AND guild_id = ? AND subject_kind = 'user' AND status = 'candidate'"
      )
      .get(claimId, guildId) as ClaimRow | undefined
    if (!row) throw new Error('Candidate claim not found')

    getDb().prepare("UPDATE memory_claim SET status = 'active' WHERE id = ?").run(claimId)
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

export function pinClaim(claimId: number): void {
  getDb().prepare("UPDATE memory_claim SET pinned = 1 WHERE id = ? AND subject_kind = 'user'").run(claimId)
}

export function unpinClaim(claimId: number): void {
  getDb().prepare("UPDATE memory_claim SET pinned = 0 WHERE id = ? AND subject_kind = 'user'").run(claimId)
}

export function getActiveClaims(guildId: string, userId: string): UserMemoryClaim[] {
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

export function getActiveClaimById(
  guildId: string,
  subjectUserId: string,
  claimId: number
): UserMemoryClaim | undefined {
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
    objectUserId?: string
    needsReview?: boolean
  },
  options: ClaimWriteOptions = {}
): UserMemoryClaim | null {
  const write = () => {
    assertWritableGuild(input.guildId)
    const prior = getActiveClaimById(input.guildId, input.subjectUserId, input.existingId)
    if (!prior || prior.predicate !== input.predicate) return null

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
      needsReview: input.needsReview
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

    const replacement = assertClaim(replacementInput, { transaction: true })
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

export function rejectClaimIdsForSpeaker(guildId: string, userId: string, claimIds: number[]): boolean {
  if (claimIds.length === 0) return false
  const write = () => {
    assertWritableGuild(guildId)
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

    const db = getDb()
    const observedAt = input.observedAt ?? Date.now()
    const existing = db
      .prepare(
        "SELECT * FROM memory_claim WHERE guild_id = ? AND subject_kind = 'guild' AND subject_user_id IS NULL AND predicate = ? AND value = ?"
      )
      .get(input.guildId, input.predicate, input.value) as ClaimRow | undefined

    if (existing) {
      const current = mapGuildClaim(existing)
      const dead = current.status === 'rejected' || current.status === 'superseded'
      db.prepare(
        'UPDATE memory_claim SET status = ?, superseded_by = ?, ended_at = ?, end_reason = ?, last_seen_at = ?, salience = ?, expires_at = ?, event_date = ?, needs_review = CASE WHEN ? = 1 THEN 1 ELSE needs_review END WHERE id = ?'
      ).run(
        dead ? 'active' : current.status,
        dead ? null : current.supersededBy,
        dead ? null : existing.ended_at,
        dead ? null : existing.end_reason,
        dead ? Math.max(current.lastSeenAt, observedAt) : current.lastSeenAt,
        Math.min(1, current.salience + 0.02),
        input.expiresAt,
        input.eventDate ?? null,
        input.needsReview ? 1 : 0,
        current.id
      )
      return appendEvidenceInTransaction(current.id, {
        channelId: input.channelId,
        sourceKind: input.sourceKind,
        observedAt
      }) as GuildMemoryClaim
    }

    const result = db
      .prepare(
        `INSERT INTO memory_claim (
          guild_id, subject_kind, subject_user_id, predicate, value, object_kind, object_user_id, source_kind, status,
          confidence, salience, pinned, needs_review, first_seen_at, last_seen_at, expires_at, event_date
        ) VALUES (?, 'guild', NULL, ?, ?, NULL, NULL, ?, 'active', 0.5, ?, 0, ?, ?, ?, ?, ?)`
      )
      .run(
        input.guildId,
        input.predicate,
        input.value,
        input.sourceKind,
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
      observedAt
    })
    return getGuildClaim(Number(result.lastInsertRowid)) as GuildMemoryClaim
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function getActiveGuildClaims(guildId: string, now: number = Date.now()): GuildMemoryClaim[] {
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
    needsReview?: boolean
  },
  options: ClaimWriteOptions = {}
): GuildMemoryClaim | null {
  const write = () => {
    assertWritableGuild(input.guildId)
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
      needsReview: input.needsReview
    }
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
    rejectClaims([...stale, ...expiredGuild], 'expired')
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
    return stale.length + expiredGuild.length + botClaims.length + evicted + purgeDeadClaims(now)
  })()
  if (pruned > 0) logger.info({ pruned, standardRetentionDays }, 'Pruned memory claims')
  return pruned
}
