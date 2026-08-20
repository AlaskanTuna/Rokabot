import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetTokenBudgetForTest, canAffordAttachments, chargeTokens } from '../agent/tokenBudget.js'
import { config } from '../config.js'
import { RateLimiter } from '../utils/rateLimiter.js'

/**
 * The simulations that should have existed before the buckets did.
 *
 * Both per-minute guards shipped with tests asserting they admit the configured amount, and both were wrong
 * by roughly 2x: `rpm: 15` admitted **29** in the worst rolling minute (#149) and a 200,000 token budget
 * admitted **389,382** (#148). The tests that missed it were not weak, they were asking the wrong question —
 * an instantaneous burst is bounded by capacity alone, and capacity is the configured value either way.
 * Only time passing DURING the spending separates `capacity + rate x T` from `rate`.
 *
 * So these drive each guard greedily across several simulated minutes and measure the worst any 60-second
 * window ever contains. Deterministic, no network, no quota — the clock is the only thing being faked, and
 * `vi.useFakeTimers` is verified to drive `Date.now`, which is what both modules read.
 */

/** The measured project ceiling these budgets exist to stay under (#125). Written out rather than derived
 * from config: it is a property of Google's quota, not of our configuration, and if the two ever disagree it
 * is the config that is wrong. */
const MEASURED_TPM_CEILING = 250_000

const MINUTE_MS = 60_000

interface Spend {
  at: number
  amount: number
}

/** The worst total any window of `windowMs` ever contains, checked from every spend as a start point. */
function worstWindow(spends: Spend[], windowMs: number): number {
  let worst = 0
  for (const start of spends) {
    const total = spends
      .filter((spend) => spend.at >= start.at && spend.at < start.at + windowMs)
      .reduce((sum, spend) => sum + spend.amount, 0)
    if (total > worst) worst = total
  }
  return worst
}

/**
 * Ask as fast as the guard will allow, for `minutes` of simulated time, in `stepMs` increments.
 *
 * Greedy AND spread out, which is the combination that matters: draining at each step until refused finds the
 * capacity, and advancing the clock between steps lets the refill contribute. Either alone is green on a
 * broken bucket.
 */
function driveGreedily(minutes: number, stepMs: number, attempt: () => number | undefined): Spend[] {
  const spends: Spend[] = []
  const steps = Math.ceil((minutes * MINUTE_MS) / stepMs)

  for (let step = 0; step <= steps; step += 1) {
    for (;;) {
      const amount = attempt()
      if (amount === undefined) break
      spends.push({ at: Date.now(), amount })
    }
    vi.advanceTimersByTime(stepMs)
  }
  return spends
}

describe('per-minute guards under a greedy caller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetTokenBudgetForTest()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // `rateLimiter.ts` counts a sliding window, so this is exact rather than doubled. Admissions are released
  // only once STRICTLY older than the window, so no closed 60-second interval can hold more than `rpm`.
  it('never admits more than rpm requests in any rolling minute', () => {
    const limiter = new RateLimiter({ rpm: 15, rpd: 100_000 })

    const spends = driveGreedily(5, 1_000, () => (limiter.tryConsume() ? 1 : undefined))

    expect(spends.length).toBeGreaterThan(15)
    expect(worstWindow(spends, MINUTE_MS)).toBe(15)
  })

  // The regression #149 shipped. A token bucket refilling continuously admits `capacity + rate x T`, so at
  // `rpm: 15` the worst rolling minute held 29. Pinned as a number rather than a ratio: 29 is what was
  // measured, and a fix that brought it to 16 would still be broken.
  it('is measured against the 29 a refilling bucket admitted at the same setting', () => {
    const limiter = new RateLimiter({ rpm: 15, rpd: 100_000 })

    const worst = worstWindow(
      driveGreedily(5, 1_000, () => (limiter.tryConsume() ? 1 : undefined)),
      MINUTE_MS
    )

    expect(worst).toBeLessThan(29)
  })

  // `tokenBudget.ts` keeps the bucket deliberately, so its 2x is expected rather than a defect — the knob is
  // halved instead. This asserts the doubling is bounded AT 2x and no worse.
  it('never spends more than twice the configured token budget in any rolling minute', () => {
    const spends = driveGreedily(5, 1_000, () => {
      if (!canAffordAttachments()) return undefined
      chargeTokens(config.gemini.maxAttachmentTokens)
      return config.gemini.maxAttachmentTokens
    })

    expect(spends.length).toBeGreaterThan(0)
    expect(worstWindow(spends, MINUTE_MS)).toBeLessThanOrEqual(2 * config.gemini.maxTokensPerMinute)
  })

  // The half of the argument that config alone cannot state: the doubling is only safe because the knob was
  // set at half the real ceiling. Raising `maxTokensPerMinute` to the measured 250,000 would look correct in
  // `config.yml` and spend 500,000 in the worst minute. This fails if anyone does that.
  it('keeps the doubled worst case inside the measured project ceiling', () => {
    expect(2 * config.gemini.maxTokensPerMinute).toBeLessThanOrEqual(MEASURED_TPM_CEILING)
  })
})
