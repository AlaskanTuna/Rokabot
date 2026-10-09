import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { logger } from '../../utils/logger.js'
import { assertClaim, confidenceForEvidence, getActiveClaimById, retireClaim } from './memoryClaims.js'
import { type PredicateId, isMoveTarget } from './predicates.js'
import { jevConfirm, proposePredicates } from './reclassifyModels.js'

export type ReclassifyCandidate = {
  id: number
  guildId: string
  subjectUserId: string
  predicate: PredicateId
  value: string
}

/** Facts reviewed per run, as a multiple of the cap: facts the model keeps must not starve the ones behind them. */
const POOL_PER_MOVE = 5
const MAX_POOL = 100

type CandidateRow = { id: number; guild_id: string; subject_user_id: string; predicate: PredicateId; value: string }

/**
 * Active current facts filed under misc, plus the weaker side of any pair that one member filed twice under
 * different predicates (the misc one, else the lower salience, else the newer), in random order so a fact the
 * model keeps cannot crowd out the ones behind it. A fact whose move was undone is never offered again: an
 * active row with a `claim_reclassified` event of its own was put back by hand.
 */
export function findReclassifyCandidates(limit: number): ReclassifyCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.guild_id, c.subject_user_id, c.predicate, c.value
       FROM memory_claim c
       WHERE c.subject_kind = 'user' AND c.status = 'active' AND c.period = 'current'
         AND c.id NOT IN (
           SELECT json_extract(detail, '$.oldId') FROM memory_events
           WHERE kind = 'claim_reclassified' AND json_extract(detail, '$.oldId') IS NOT NULL
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
    .all(limit) as CandidateRow[]
  return rows.map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    subjectUserId: row.subject_user_id,
    predicate: row.predicate,
    value: row.value
  }))
}

function activeCount(guildId: string, subjectUserId: string): number {
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND status = 'active'"
      )
      .get(guildId, subjectUserId) as { count: number }
  ).count
}

/**
 * Files an active fact under another predicate, keeping its pin, evidence and first-seen time, and links the old
 * row to the new one. All or nothing: it throws, and changes nothing, when the move would cost the member any
 * other active fact. Returns the ID of the fact now holding the value.
 */
export function moveClaim(claim: ReclassifyCandidate, to: PredicateId, probability: number): number {
  const db = getDb()
  return db.transaction(() => {
    const original = getActiveClaimById(claim.guildId, claim.subjectUserId, claim.id)
    if (!original) throw new Error('Claim is not active')
    if (original.predicate === to) throw new Error('Claim is already filed there')

    const before = activeCount(original.guildId, original.subjectUserId)
    const target = db
      .prepare(
        "SELECT status, end_reason FROM memory_claim WHERE subject_kind = 'user' AND guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? AND period = 'current'"
      )
      .get(original.guildId, original.subjectUserId, to, original.value) as
      | { status: string; end_reason: string | null }
      | undefined
    // The member ended that fact on purpose; a copy left under another predicate must not bring it back.
    if (
      target &&
      target.status !== 'active' &&
      (target.end_reason === 'retracted' || target.end_reason === 'forgotten')
    ) {
      throw new Error('Target fact was retracted or forgotten')
    }
    // A target that was ended or only staged comes back to life with the move, so undoing it must end it again.
    const created = target?.status !== 'active'

    // The old row goes first so the member's active count never passes the cap mid-move and evicts another fact.
    retireClaim(original.guildId, original.id, 'reclassified', undefined, { transaction: true })
    const moved = assertClaim(
      {
        guildId: original.guildId,
        subjectUserId: original.subjectUserId,
        predicate: to,
        value: original.value,
        sourceKind: original.sourceKind,
        period: 'current',
        observedAt: original.lastSeenAt,
        needsReview: false
      },
      { transaction: true }
    )
    if (moved.status !== 'active') throw new Error('Target fact is not active')

    // assertClaim logged a sighting of its own with no channel; the evidence copied below replaces it.
    db.prepare('DELETE FROM memory_evidence WHERE id = (SELECT MAX(id) FROM memory_evidence WHERE claim_id = ?)').run(
      moved.id
    )
    db.prepare(
      `INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at, effective_at)
       SELECT ?, channel_id, source_kind, observed_at, effective_at FROM memory_evidence WHERE claim_id = ?`
    ).run(moved.id, original.id)
    const evidence = (
      db.prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(moved.id) as {
        count: number
      }
    ).count
    db.prepare(
      `UPDATE memory_claim
       SET pinned = MAX(pinned, ?), first_seen_at = MIN(first_seen_at, ?), salience = MAX(salience, ?),
           confidence = MAX(confidence, ?)
       WHERE id = ?`
    ).run(
      original.pinned ? 1 : 0,
      original.firstSeenAt,
      original.salience,
      Math.max(original.confidence, confidenceForEvidence(evidence, original.lastSeenAt)),
      moved.id
    )
    db.prepare('UPDATE memory_claim SET superseded_by = ? WHERE id = ?').run(moved.id, original.id)

    if (activeCount(original.guildId, original.subjectUserId) < (created ? before : before - 1)) {
      throw new Error('Move would retire another fact')
    }

    recordMemoryEvent({
      kind: 'claim_reclassified',
      guildId: original.guildId,
      subjectUserId: original.subjectUserId,
      detail: JSON.stringify({
        oldId: original.id,
        newId: moved.id,
        from: original.predicate,
        to,
        probability,
        created
      })
    })
    return moved.id
  })()
}

/** Puts a reclassified fact back and, when the move created or revived its replacement, ends the replacement. */
export function undoReclassify(oldClaimId: number): boolean {
  const db = getDb()
  return db.transaction(() => {
    const old = db
      .prepare(
        "SELECT guild_id, subject_user_id, superseded_by FROM memory_claim WHERE id = ? AND subject_kind = 'user' AND status = 'rejected' AND end_reason = 'reclassified'"
      )
      .get(oldClaimId) as { guild_id: string; subject_user_id: string; superseded_by: number | null } | undefined
    if (!old || old.superseded_by === null) return false

    const event = db
      .prepare(
        "SELECT detail FROM memory_events WHERE kind = 'claim_reclassified' AND json_extract(detail, '$.oldId') = ? ORDER BY id DESC LIMIT 1"
      )
      .get(oldClaimId) as { detail: string } | undefined
    const created = event !== undefined && (JSON.parse(event.detail) as { created?: boolean }).created === true

    db.prepare(
      "UPDATE memory_claim SET status = 'active', ended_at = NULL, end_reason = NULL, superseded_by = NULL WHERE id = ?"
    ).run(oldClaimId)
    if (created) {
      db.prepare(
        `UPDATE memory_claim SET status = 'rejected', superseded_by = NULL, ended_at = ?, end_reason = 'removed'
         WHERE id = ? AND guild_id = ? AND subject_kind = 'user' AND subject_user_id = ? AND status = 'active'`
      ).run(Date.now(), old.superseded_by, old.guild_id, old.subject_user_id)
    }
    return true
  })()
}

/**
 * Moves misfiled facts to the predicate Gemini proposes once Jev confirms it, up to
 * `memory.reclassifyMaxPerRun` a run. Returns the number of facts moved.
 */
export async function reclassifyClaims(): Promise<number> {
  const cap = config.memory.reclassifyMaxPerRun
  if (config.memory.privacy === 'off' || cap <= 0) return 0

  const candidates = findReclassifyCandidates(Math.min(MAX_POOL, cap * POOL_PER_MOVE))
  if (candidates.length === 0) return 0

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const proposed: Array<{ claim: ReclassifyCandidate; to: PredicateId }> = []
  for (const { id, predicate } of await proposePredicates(candidates)) {
    const claim = byId.get(id)
    if (!claim || predicate === 'keep' || predicate === claim.predicate || !isMoveTarget(predicate)) continue
    proposed.push({ claim, to: predicate })
  }

  // One Jev call must stay inside jev.memoryTimeoutMs, so it only sees as many moves as could be applied.
  const toConfirm = proposed.slice(0, cap)
  const probabilities =
    toConfirm.length > 0
      ? await jevConfirm(toConfirm.map(({ claim, to }) => ({ id: claim.id, value: claim.value, predicate: to })))
      : {}
  const confirmed = toConfirm.filter(({ claim }) => (probabilities[claim.id] ?? 0) >= config.memory.verifyThreshold)

  let moved = 0
  for (const { claim, to } of confirmed) {
    try {
      moveClaim(claim, to, probabilities[claim.id] as number)
      moved += 1
    } catch (error) {
      logger.warn(
        { claimId: claim.id, from: claim.predicate, to, errorMessage: (error as Error).message },
        'Skipped a reclassification'
      )
    }
  }
  logger.info(
    { candidates: candidates.length, proposed: proposed.length, confirmed: confirmed.length, moved },
    'Reclassified misfiled memory facts'
  )
  return moved
}
