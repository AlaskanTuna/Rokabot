import { defineConfig } from 'vitest/config'

const TRIAL_PACING_FLOOR_MS = 12000
const TRIAL_PACING_MS = Math.max(
  TRIAL_PACING_FLOOR_MS,
  Number(process.env.ROKABOT_TRIAL_PACING_MS) || TRIAL_PACING_FLOOR_MS
)
/** 12 fixture cases x 3 trials in tests/harness/__tests__/toolTrigger.live.test.ts. */
const TURNS_PER_RUN = 36

/** Wall-clock a single live turn costs, on top of the pacing sleep that precedes it. Measured across
 * seven complete case-set runs, 2026-08-20: 9.7, 9.7, 10.3, 11.1, 11.5, 11.5 and 12.5 seconds a turn.
 * 13s sits just above the worst of those.
 *
 * The old formula left this term out entirely and doubled the sleep alone, on the reasoning that the run
 * is "almost all of it sleeping". It is not: 36 sleeps is 432s and the runs took 769-871s, so the model
 * time is the other half. What read as 2x headroom measured 1.03x — the worst run finished 28.9 seconds
 * inside a 900,000 ms timeout — which is the exact trap the comment below says this derivation exists to
 * avoid, sprung by the term it omitted. */
const TURN_BUDGET_MS = 13_000

/** Kept in step with MAX_TRIAL_RETRIES in tests/harness/toolTrigger.ts by hand, the same way
 * TRIAL_PACING_FLOOR_MS above is: importing the harness here would load src/config.ts and dotenv while
 * vitest is still reading its own config. Retries are budgeted turns, so the timeout has to buy them —
 * and budgeted per trial means the run's worst case is every trial spending its whole allowance, not a
 * shared pool. Buying only the pool would leave the timeout aborting runs the retry budget still permits,
 * which is the failure this derivation exists to prevent. */
const MAX_TRIAL_RETRIES = 2
const WORST_CASE_RETRIES = TURNS_PER_RUN * MAX_TRIAL_RETRIES

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/harness/__tests__/*.live.test.ts'],
    fileParallelism: false,
    // ~2x the expected run so this never becomes the binding constraint, unlike PR #38's 5000ms default
    // which masked its p95 result with an opaque timeout. Derived from the pacing rather than fixed: the
    // run is 12 cases x 3 trials, so raising ROKABOT_TRIAL_PACING_MS to clear a 15 RPM ceiling would
    // otherwise re-create exactly that trap — a timeout that aborts the run before it can produce a
    // verdict, and reports nothing about what was being measured. Now costs a turn what a turn actually
    // costs, so the 2x is 2x. The 900_000 floor is gone rather than kept alongside: it was below every
    // value this can now produce, so leaving it in would only suggest it still protected something.
    testTimeout: (TRIAL_PACING_MS + TURN_BUDGET_MS) * (TURNS_PER_RUN + WORST_CASE_RETRIES) * 2
  }
})
