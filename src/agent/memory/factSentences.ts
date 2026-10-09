import type { ClaimPeriod } from './memoryClaims.js'

export const PAST_FACT_MARKER = ' (past)'

/** The key a prompt shows for a fact, so a past one reads as history wherever it lands. */
export function factKey(predicate: string, period: ClaimPeriod): string {
  return period === 'past' ? `${predicate}${PAST_FACT_MARKER}` : predicate
}

// Subject-neutral on purpose: a rename never changes the sentence, so it never forces a re-embedding.
export function renderFactSentence(
  claim: Readonly<{
    subjectKind: 'user' | 'guild'
    predicate: string
    value: string
    eventDate: string | null
    period?: ClaimPeriod
  }>
): string {
  const label = claim.predicate.replaceAll('_', ' ')
  if (claim.subjectKind === 'guild') {
    return `Server ${label}${claim.eventDate ? ` (${claim.eventDate})` : ''}: ${claim.value}.`
  }
  return `This person's ${claim.period === 'past' ? 'past ' : ''}${label}: ${claim.value}.`
}
