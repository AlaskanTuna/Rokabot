import type { ExtractionOp } from './extractionSchema.js'
import type { ClaimPeriod, MemoryClaim, UserMemoryClaim } from './memoryClaims.js'
import { predicateCategory } from './predicates.js'

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

// A fact may sit under a sibling predicate of the one the retract names (a legacy `favorite_game` row when the member
// now says `hobby`), so every visible current claim of the category is asked about. The claim the member named goes
// first, whatever its predicate, so the cap can never push it out of the questions; the retract's own predicate comes
// before a sibling, and ties keep the order they were given in.
export function retractCandidates(
  existing: readonly MemoryClaim[],
  op: Extract<WriteOp, { op: 'retract' }>
): UserMemoryClaim[] {
  const named = squash(op.value)
  const category = predicateCategory(op.predicate)
  const valueRank = (claim: UserMemoryClaim) => (claim.value === op.value ? 0 : squash(claim.value) === named ? 1 : 2)
  const predicateRank = (claim: UserMemoryClaim) => (claim.predicate === op.predicate ? 0 : 1)
  return existing
    .filter(
      (claim): claim is UserMemoryClaim =>
        claim.subjectKind === 'user' &&
        claim.subjectUserId === op.subject.userId &&
        claim.period === 'current' &&
        predicateCategory(claim.predicate) === category
    )
    .sort((left, right) => valueRank(left) - valueRank(right) || predicateRank(left) - predicateRank(right))
    .slice(0, MAX_RETRACT_CANDIDATES)
}
