// Subject-neutral on purpose: a rename never changes the sentence, so it never forces a re-embedding.
export function renderFactSentence(
  claim: Readonly<{ subjectKind: 'user' | 'guild'; predicate: string; value: string; eventDate: string | null }>
): string {
  const label = claim.predicate.replaceAll('_', ' ')
  if (claim.subjectKind === 'guild') {
    return `Server ${label}${claim.eventDate ? ` (${claim.eventDate})` : ''}: ${claim.value}.`
  }
  return `This person's ${label}: ${claim.value}.`
}
