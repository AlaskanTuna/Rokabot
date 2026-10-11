/** Estimated LLM spend per UTC month and provider: the persisted side of `llm.monthlyBudgetUsd`. */

import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

/** The UTC calendar month a monthly cap resets on, e.g. `2026-10`. */
export function monthKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 7)
}

export function readSpend(month: string, provider: string): number {
  const row = getDb().prepare('SELECT usd FROM llm_spend WHERE month = ? AND provider = ?').get(month, provider) as
    | { usd: number }
    | undefined
  return row?.usd ?? 0
}

/** Never throws: it runs inside a provider call, and losing one estimate must not fail the reply that cost it. */
export function addSpend(month: string, provider: string, usd: number): void {
  try {
    getDb()
      .prepare(
        'INSERT INTO llm_spend (month, provider, usd) VALUES (?, ?, ?) ' +
          'ON CONFLICT (month, provider) DO UPDATE SET usd = usd + excluded.usd'
      )
      .run(month, provider, usd)
  } catch (error) {
    logger.warn({ err: error, month, provider }, 'Failed to record LLM spend')
  }
}
