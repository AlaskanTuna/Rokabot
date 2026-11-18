/** Per-turn caps on what the model may spend on lookups, shared across the retries of one turn. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '../../../config.js'
import { currentSearchAttempt } from './attemptBudget.js'

export type LookupKind = 'search' | 'pageRead'

interface TurnBudget {
  searches: number
  pageReads: number
  providerCalls: number
}

const budgetForTurn = new AsyncLocalStorage<TurnBudget>()

/** Opens one turn's lookup budget, beside the source registry in turnPipeline.ts. Retries share it. */
export function withTurnBudget<T>(run: () => T): T {
  return budgetForTurn.run({ searches: 0, pageReads: 0, providerCalls: 0 }, run)
}

/**
 * Spends one lookup of this kind plus the provider call behind it. False when either is already spent.
 * With no turn scope open there is nothing to spend from, so it stays true: the prefetch starts outside
 * the turn and unit tests run without one.
 */
export function trySpend(kind: LookupKind): boolean {
  const budget = budgetForTurn.getStore()
  if (!budget) return true
  const { maxSearches, maxPageReads, maxProviderCalls } = config.search
  if (budget.providerCalls >= maxProviderCalls) return false
  if (kind === 'search' ? budget.searches >= maxSearches : budget.pageReads >= maxPageReads) return false
  if (kind === 'search') budget.searches += 1
  else budget.pageReads += 1
  budget.providerCalls += 1
  return true
}

/**
 * What a new lookup may still spend: the attempt's remaining time minus the reserve the reply keeps for
 * the chat model's next call. Null with no attempt in scope, where no clock runs against the lookup.
 */
export function timeLeftForLookupMs(nowMs: number = performance.now()): number | null {
  const attempt = currentSearchAttempt()
  if (!attempt) return null
  return attempt.deadlineAtMs - nowMs - config.search.replyReserveMs
}
