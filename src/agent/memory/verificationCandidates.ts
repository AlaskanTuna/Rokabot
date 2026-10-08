import type { ExtractionOp } from './extractionSchema.js'
import type { ClaimPeriod, MemoryClaim } from './memoryClaims.js'

type WriteOp = Exclude<ExtractionOp, { op: 'noop' }>

const MAX_RETRACT_CANDIDATES = 5

export function proposedPeriod(op: WriteOp): ClaimPeriod {
  return 'tense' in op && op.tense === 'past' ? 'past' : 'current'
}

// Planning and judging both derive their question keys from these lists, so the order must stay shared.
export function sameAsCandidates(existing: readonly MemoryClaim[], op: Extract<WriteOp, { op: 'add' }>): MemoryClaim[] {
  const period = proposedPeriod(op)
  return existing.filter((claim) => {
    if (claim.subjectKind !== op.subject.kind || claim.predicate !== op.predicate) return false
    return op.subject.kind === 'guild' || (claim.subjectUserId === op.subject.userId && claim.period === period)
  })
}

function squash(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

// The claim the member named goes first, so the cap can never push it out of the questions.
export function retractCandidates(
  existing: readonly MemoryClaim[],
  op: Extract<WriteOp, { op: 'retract' }>
): MemoryClaim[] {
  const named = squash(op.value)
  const rank = (claim: MemoryClaim) => (claim.value === op.value ? 0 : squash(claim.value) === named ? 1 : 2)
  return existing
    .filter(
      (claim) =>
        claim.subjectKind === 'user' &&
        claim.subjectUserId === op.subject.userId &&
        claim.predicate === op.predicate &&
        claim.period === 'current'
    )
    .sort((left, right) => rank(left) - rank(right))
    .slice(0, MAX_RETRACT_CANDIDATES)
}
