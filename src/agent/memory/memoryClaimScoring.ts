import type { ClaimSource } from './memoryClaims.js'

export const SOURCE_WEIGHT: Readonly<Record<ClaimSource, number>> = {
  explicit: 1,
  human: 1,
  passive: 0.75,
  legacy: 0.5
}

/** Evidence count raises confidence, while recent observation gets a small freshness bonus. */
export function confidenceForEvidence(evidenceCount: number, observedAt: number, now: number = Date.now()): number {
  const age = Math.max(0, now - observedAt)
  const freshness = age <= 24 * 60 * 60 * 1000 ? 0.1 : age <= 7 * 24 * 60 * 60 * 1000 ? 0.05 : 0
  return Math.min(0.95, 0.4 + Math.min(0.4, evidenceCount * 0.1) + freshness)
}
