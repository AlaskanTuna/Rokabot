import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { logger } from '../../utils/logger.js'
import { MAX_FACT_VALUE_LEN, isSafeFactScalar } from '../promptSafety.js'
import { PREDICATES, type PredicateId, baseSalienceOf, cardinalityOf, normalizePredicate } from './predicates.js'

export type ClaimSource = 'explicit' | 'human' | 'passive' | 'legacy'
export type ClaimStatus = 'candidate' | 'active' | 'superseded' | 'rejected'

export type MemoryClaim = Readonly<{
  id: number
  guildId: string
  subjectUserId: string
  predicate: PredicateId
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
  subject_user_id: string
  predicate: PredicateId
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
}

const SOURCE_WEIGHT: Readonly<Record<ClaimSource, number>> = {
  explicit: 1,
  human: 1,
  passive: 0.75,
  legacy: 0.5
}

function mapClaim(row: ClaimRow): MemoryClaim {
  return {
    id: row.id,
    guildId: row.guild_id,
    subjectUserId: row.subject_user_id,
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
    lastRecalledAt: row.last_recalled_at
  }
}

function assertWritableGuild(guildId: string): void {
  if (guildId === 'global') throw new Error('Claims cannot use the global tenant')
}

function assertSafeValue(value: string): void {
  if (!isSafeFactScalar(value, MAX_FACT_VALUE_LEN)) throw new Error('Claim value is unsafe')
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
  db.prepare('UPDATE memory_claim SET confidence = ? WHERE id = ?').run(confidence, claimId)
  return getClaim(claimId) as MemoryClaim
}

export function appendEvidence(claimId: number, input: EvidenceInput, options: ClaimWriteOptions = {}): MemoryClaim {
  const write = () => appendEvidenceInTransaction(claimId, input)
  return options.transaction ? write() : getDb().transaction(write)()
}

function rejectClaims(claims: MemoryClaim[]): void {
  const db = getDb()
  const reject = db.prepare("UPDATE memory_claim SET status = 'rejected' WHERE id = ?")
  for (const claim of claims) {
    reject.run(claim.id)
  }
}

function evictOverflow(guildId: string, subjectUserId: string): void {
  const overflow = (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_user_id = ? AND status = 'active' AND pinned = 0
       ORDER BY salience ASC, last_seen_at ASC, id ASC
       LIMIT MAX(0, (SELECT COUNT(*) FROM memory_claim WHERE guild_id = ? AND subject_user_id = ? AND status = 'active') - ?)`
      )
      .all(guildId, subjectUserId, guildId, subjectUserId, config.memory.maxActiveClaimsPerUser) as ClaimRow[]
  ).map(mapClaim)

  rejectClaims(overflow)
}

function supersedePriorActive(claim: MemoryClaim): void {
  if (cardinalityOf(claim.predicate) !== 'single') return

  const db = getDb()
  const superseded = (
    db
      .prepare(
        `SELECT * FROM memory_claim
         WHERE guild_id = ? AND subject_user_id = ? AND predicate = ? AND status = 'active' AND id != ?`
      )
      .all(claim.guildId, claim.subjectUserId, claim.predicate, claim.id) as ClaimRow[]
  ).map(mapClaim)
  const update = db.prepare("UPDATE memory_claim SET status = 'superseded', superseded_by = ? WHERE id = ?")

  for (const prior of superseded) {
    update.run(claim.id, prior.id)
  }
}

function assertClaimInTransaction(op: ClaimAssert): MemoryClaim {
  assertWritableGuild(op.guildId)
  assertSafeValue(op.value)

  const db = getDb()
  const predicate = normalizePredicate(op.predicate)
  const observedAt = op.observedAt ?? Date.now()
  const existing = db
    .prepare('SELECT * FROM memory_claim WHERE guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ?')
    .get(op.guildId, op.subjectUserId, predicate, op.value) as ClaimRow | undefined

  if (existing) {
    const current = mapClaim(existing)
    const salience = Math.min(
      1,
      Math.max(current.salience, baseSalienceOf(predicate) * sourceWeight(op.sourceKind)) + 0.02
    )
    db.prepare('UPDATE memory_claim SET last_seen_at = ?, salience = ? WHERE id = ?').run(
      observedAt,
      salience,
      current.id
    )
    return appendEvidenceInTransaction(current.id, {
      channelId: op.channelId,
      sourceKind: op.sourceKind,
      observedAt
    })
  }

  const objectUserId = PREDICATES[predicate].objectKind === 'user' ? (op.objectUserId ?? null) : null
  const result = db
    .prepare(
      `INSERT INTO memory_claim (
        guild_id, subject_user_id, predicate, value, object_kind, object_user_id, source_kind, status,
        salience, needs_review, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      op.needsReview ? 1 : 0,
      observedAt,
      observedAt
    )
  const claim = appendEvidenceInTransaction(Number(result.lastInsertRowid), {
    channelId: op.channelId,
    sourceKind: op.sourceKind,
    observedAt
  })

  if (claim.status === 'active') supersedePriorActive(claim)

  if (claim.status === 'active') evictOverflow(op.guildId, op.subjectUserId)
  return getClaim(claim.id) as MemoryClaim
}

export function assertClaim(op: ClaimAssert, options: ClaimWriteOptions = {}): MemoryClaim {
  const write = () => assertClaimInTransaction(op)
  return options.transaction ? write() : getDb().transaction(write)()
}

export function activateClaim(guildId: string, claimId: number, options: ClaimWriteOptions = {}): MemoryClaim {
  const write = () => {
    assertWritableGuild(guildId)
    const row = getDb()
      .prepare("SELECT * FROM memory_claim WHERE id = ? AND guild_id = ? AND status = 'candidate'")
      .get(claimId, guildId) as ClaimRow | undefined
    if (!row) throw new Error('Candidate claim not found')

    getDb().prepare("UPDATE memory_claim SET status = 'active' WHERE id = ?").run(claimId)
    const claim = getClaim(claimId) as MemoryClaim
    supersedePriorActive(claim)
    evictOverflow(claim.guildId, claim.subjectUserId)
    return getClaim(claimId) as MemoryClaim
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function retractClaim(op: ClaimRetract, options: ClaimWriteOptions = {}): boolean {
  const write = () => {
    assertWritableGuild(op.guildId)
    const predicate = normalizePredicate(op.predicate)
    const row = getDb()
      .prepare(
        "SELECT * FROM memory_claim WHERE guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? AND status = 'active'"
      )
      .get(op.guildId, op.subjectUserId, predicate, op.value) as ClaimRow | undefined
    if (!row) return false
    rejectClaims([mapClaim(row)])
    return true
  }
  return options.transaction ? write() : getDb().transaction(write)()
}

export function pinClaim(claimId: number): void {
  getDb().prepare('UPDATE memory_claim SET pinned = 1 WHERE id = ?').run(claimId)
}

export function unpinClaim(claimId: number): void {
  getDb().prepare('UPDATE memory_claim SET pinned = 0 WHERE id = ?').run(claimId)
}

export function getActiveClaims(guildId: string, userId: string): MemoryClaim[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_user_id = ? AND status = 'active'
       ORDER BY pinned DESC, salience DESC, last_seen_at DESC, id DESC`
      )
      .all(guildId, userId) as ClaimRow[]
  ).map(mapClaim)
}

export function searchClaims(guildId: string, userId: string, ftsQuery: string, limit: number): MemoryClaim[] {
  if (!ftsQuery.trim() || limit <= 0) return []
  return (
    getDb()
      .prepare(
        `SELECT memory_claim.* FROM memory_claim
       JOIN memory_claim_fts ON memory_claim.id = memory_claim_fts.rowid
       WHERE memory_claim.guild_id = ? AND memory_claim.subject_user_id = ? AND memory_claim.status = 'active'
         AND memory_claim_fts MATCH ?
       ORDER BY bm25(memory_claim_fts), memory_claim.salience DESC
       LIMIT ?`
      )
      .all(guildId, userId, ftsQuery, limit) as ClaimRow[]
  ).map(mapClaim)
}

export function getEdges(guildId: string, userId: string): MemoryClaim[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM memory_claim
       WHERE guild_id = ? AND subject_user_id = ? AND status = 'active' AND object_kind = 'user'
       ORDER BY pinned DESC, salience DESC, last_seen_at DESC, id DESC`
      )
      .all(guildId, userId) as ClaimRow[]
  ).map(mapClaim)
}

export function touchRecalled(claimIds: number[]): void {
  if (claimIds.length === 0) return
  const placeholders = claimIds.map(() => '?').join(', ')
  getDb()
    .prepare(`UPDATE memory_claim SET last_recalled_at = ? WHERE id IN (${placeholders})`)
    .run(Date.now(), ...claimIds)
}

export function pruneStaleClaims(maxAgeDays: number = 90): number {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const pruned = getDb().transaction(() => {
    const stale = (
      getDb()
        .prepare(
          "SELECT * FROM memory_claim WHERE status IN ('candidate', 'active') AND pinned = 0 AND last_seen_at < ?"
        )
        .all(cutoff) as ClaimRow[]
    ).map(mapClaim)
    rejectClaims(stale)
    return stale.length
  })()
  if (pruned > 0) logger.info({ pruned, maxAgeDays }, 'Pruned stale memory claims')
  return pruned
}
