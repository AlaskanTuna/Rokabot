import type { MemoryVerification } from '../jev/judgments.js'
import type { ExtractionOp as EpisodeOperation } from './extractionSchema.js'
import type { ClaimPeriod, EvidenceProvenance, MemoryClaim } from './memoryClaims.js'
import {
  appendEvidence,
  assertClaim,
  assertGuildClaim,
  getActiveClaimById,
  getActiveClaims,
  getActiveGuildClaimById,
  priorClaimStatus,
  rejectActiveClaimById,
  rejectActiveGuildClaimById,
  replaceActiveClaim,
  replaceActiveGuildClaim,
  retireClaim
} from './memoryClaims.js'
import { type PredicateId, normalizePredicate } from './predicates.js'
import { proposedPeriod } from './verificationCandidates.js'

export type EpisodeWriteOp = Exclude<EpisodeOperation, { op: 'noop' }>
type GuildWriteOperation = Extract<EpisodeWriteOp, { subject: { kind: 'guild' } }>
export type PlannedOperation = {
  index: number
  op: EpisodeWriteOp
  sameAsClaims: MemoryClaim[]
  retractClaims: MemoryClaim[]
  provenance: EvidenceProvenance
  questionKeys: string[]
  expiresAt: number | null
  eventDate: string | null
  dateValid: boolean
}

export type OperationResult = {
  applied: boolean
  duplicate: boolean
  staged?: boolean
  changed?: boolean
  past?: boolean
  reword?: boolean
  retracted?: number
  judgedOut?: boolean
}

export type OperationApplierContext = {
  guildId: string
  channelId: string
  observedAt: number
  verified: boolean
  verification: MemoryVerification | null
  threshold: number
  holds: (key: string) => boolean
  appliedKeys: Set<string>
  verifiedRetracts: Array<{ subjectUserId: string; predicate: PredicateId; value: string }>
}

type AddOperation = Extract<EpisodeWriteOp, { op: 'add' }>
type UpdateOperation = Extract<EpisodeWriteOp, { op: 'update' }>
type RemoveOperation = Extract<EpisodeWriteOp, { op: 'remove' }>
type RetractOperation = Extract<EpisodeWriteOp, { op: 'retract' }>
type AddOrUpdateOperation = AddOperation | UpdateOperation

function isGuildWriteOperation(op: EpisodeWriteOp): op is GuildWriteOperation {
  return op.subject.kind === 'guild'
}

function resolveWritePeriod(
  op: AddOrUpdateOperation,
  entry: PlannedOperation,
  target: MemoryClaim | undefined,
  ctx: OperationApplierContext
): { period: ClaimPeriod } | { result: OperationResult } {
  const { guildId, channelId, observedAt, verified, verification, holds } = ctx
  const { index } = entry
  let period = proposedPeriod(op)
  if (verified && verification && 'tense' in op) {
    const stillHolds = holds(`current_${index}`)
    if (op.tense === 'past' && stillHolds) {
      // The speaker still holds it, so there is no history to record: it can only refresh the matching current fact.
      const match = getActiveClaims(guildId, op.subject.userId).find(
        (claim) => claim.period === 'current' && claim.predicate === op.predicate && claim.value === op.value
      )
      if (match) {
        appendEvidence(
          match.id,
          { channelId, sourceKind: 'passive', observedAt, provenance: entry.provenance },
          { transaction: true }
        )
      }
      return { result: { applied: false, duplicate: Boolean(match) } }
    }
    const resolved = op.tense === 'current' && stillHolds ? 'current' : holds(`past_${index}`) ? 'past' : null
    if (resolved === null) {
      return { result: { applied: false, duplicate: false, judgedOut: true } }
    }
    period = resolved
    if (op.op === 'update' && period === 'current' && target?.period === 'current' && !holds(`changes_${index}`)) {
      appendEvidence(
        target.id,
        { channelId, sourceKind: 'passive', observedAt, provenance: entry.provenance },
        { transaction: true }
      )
      return { result: { applied: false, duplicate: true, reword: true } }
    }
  }
  return { period }
}

function insertWriteClaim(
  op: AddOrUpdateOperation,
  entry: PlannedOperation,
  period: ClaimPeriod,
  ctx: OperationApplierContext
): OperationResult {
  const { guildId, channelId, observedAt, verified, verification, threshold, holds, appliedKeys } = ctx
  const { index, sameAsClaims } = entry
  // A past mention is written as its own row: it never replaces the claim an update targeted. A verified current
  // update aimed at a past claim is written the same way, as the current fact, so the history stays untouched.
  // Same-as candidates were chosen for the proposed period, so they only apply while Jev kept it.
  if (verified && verification && period === proposedPeriod(op)) {
    const exactSameAs = sameAsClaims.find((claim) => claim.value === op.value)
    if (exactSameAs) {
      const active =
        op.subject.kind === 'guild'
          ? getActiveGuildClaimById(guildId, exactSameAs.id)
          : getActiveClaimById(guildId, op.subject.userId, exactSameAs.id)
      if (active) {
        appendEvidence(
          active.id,
          { channelId, sourceKind: 'passive', observedAt, provenance: entry.provenance },
          { transaction: true }
        )
        appliedKeys.add(`same_as_${index}_${sameAsClaims.indexOf(exactSameAs)}`)
        return { applied: false, duplicate: true }
      }
      return { applied: false, duplicate: false }
    }
    const sameAs = sameAsClaims.find((claim, claimIndex) => {
      const answer = verification.answers[`same_as_${index}_${claimIndex}`]
      return answer.noul >= threshold
    })
    if (sameAs) {
      const active =
        op.subject.kind === 'guild'
          ? getActiveGuildClaimById(guildId, sameAs.id)
          : getActiveClaimById(guildId, op.subject.userId, sameAs.id)
      if (active) {
        appendEvidence(
          active.id,
          { channelId, sourceKind: 'passive', observedAt, provenance: entry.provenance },
          { transaction: true }
        )
        appliedKeys.add(`same_as_${index}_${sameAsClaims.indexOf(sameAs)}`)
        return { applied: false, duplicate: true }
      }
      return { applied: false, duplicate: false }
    }
    if (sameAsClaims.some((claim) => claim.value === op.value)) {
      return { applied: false, duplicate: false }
    }
  }

  const priorStatus = isGuildWriteOperation(op)
    ? priorClaimStatus(guildId, { kind: 'guild' }, op.predicate, op.value, period)
    : priorClaimStatus(
        guildId,
        { kind: 'user', userId: op.subject.userId },
        normalizePredicate(op.predicate),
        op.value,
        period
      )
  if (isGuildWriteOperation(op)) {
    const claim = assertGuildClaim(
      {
        guildId,
        predicate: op.predicate,
        value: op.value,
        expiresAt: entry.expiresAt,
        eventDate: entry.eventDate,
        sourceKind: 'passive',
        channelId,
        observedAt,
        needsReview: !verified,
        status: verified ? 'active' : 'candidate',
        provenance: entry.provenance
      },
      { transaction: true }
    )
    const applied = claim.status === 'active' || claim.status === 'candidate'
    return {
      applied,
      duplicate: false,
      staged: !verified && claim.status === 'candidate',
      changed: applied && claim.status !== priorStatus
    }
  }

  const claim = assertClaim(
    {
      guildId,
      subjectUserId: op.subject.userId,
      predicate: op.predicate,
      value: op.value,
      objectUserId: op.objectUserId,
      sourceKind: 'passive',
      channelId,
      observedAt,
      needsReview: !verified,
      status: verified ? 'active' : 'candidate',
      period,
      provenance: entry.provenance
    },
    { transaction: true }
  )
  const applied = claim.status === 'active' || claim.status === 'candidate'
  return {
    applied,
    duplicate: false,
    staged: !verified && claim.status === 'candidate',
    changed: applied && claim.status !== priorStatus,
    past: applied && verified && period === 'past'
  }
}

export function applyRetractOperation(
  op: RetractOperation,
  entry: PlannedOperation,
  ctx: OperationApplierContext
): OperationResult {
  const { guildId, holds, appliedKeys, verifiedRetracts } = ctx
  const { index, retractClaims } = entry
  verifiedRetracts.push({ subjectUserId: op.subject.userId, predicate: op.predicate, value: op.value })
  let retired = 0
  for (const [claimIndex, claim] of retractClaims.entries()) {
    const key = `retracts_${index}_${claimIndex}`
    if (holds(key) && retireClaim(guildId, claim.id, 'retracted', undefined, { transaction: true })) {
      appliedKeys.add(key)
      retired += 1
    }
  }
  return {
    applied: retired > 0,
    duplicate: false,
    changed: retired > 0,
    retracted: retired,
    judgedOut: retractClaims.length > 0 && retired === 0
  }
}

export function applyAddOperation(
  op: AddOperation,
  entry: PlannedOperation,
  ctx: OperationApplierContext
): OperationResult {
  const resolution = resolveWritePeriod(op, entry, undefined, ctx)
  if ('result' in resolution) return resolution.result
  return insertWriteClaim(op, entry, resolution.period, ctx)
}

export function applyUpdateOperation(
  op: UpdateOperation,
  entry: PlannedOperation,
  target: MemoryClaim | undefined,
  ctx: OperationApplierContext
): OperationResult {
  const { guildId, channelId, observedAt, verified } = ctx
  const resolution = resolveWritePeriod(op, entry, target, ctx)
  if ('result' in resolution) return resolution.result
  const period = resolution.period
  if (period === 'past' || (verified && target?.period === 'past')) {
    return insertWriteClaim(op, entry, period, ctx)
  }
  const replacement = isGuildWriteOperation(op)
    ? replaceActiveGuildClaim(
        {
          guildId,
          existingId: op.existingId,
          predicate: op.predicate,
          value: op.value,
          expiresAt: entry.expiresAt,
          eventDate: entry.eventDate,
          channelId,
          observedAt,
          needsReview: !verified,
          provenance: entry.provenance
        },
        { transaction: true }
      )
    : replaceActiveClaim(
        {
          guildId,
          subjectUserId: op.subject.userId,
          existingId: op.existingId,
          predicate: op.predicate,
          value: op.value,
          objectUserId: op.objectUserId,
          channelId,
          observedAt,
          needsReview: !verified,
          provenance: entry.provenance
        },
        { transaction: true }
      )
  const duplicate = replacement?.id === op.existingId
  const applied = Boolean(replacement) && !duplicate
  return { applied, duplicate, staged: !verified && Boolean(replacement), changed: applied }
}

export function applyRemoveOperation(op: RemoveOperation, ctx: OperationApplierContext): OperationResult {
  const { guildId } = ctx
  const applied = isGuildWriteOperation(op)
    ? rejectActiveGuildClaimById({ guildId, existingId: op.existingId }, { transaction: true })
    : rejectActiveClaimById(
        { guildId, subjectUserId: op.subject.userId, existingId: op.existingId },
        { transaction: true }
      )
  return { applied, duplicate: false, changed: applied }
}
