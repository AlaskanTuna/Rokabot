import { defineConfig } from 'vitest/config'

const TRIAL_PACING_FLOOR_MS = 12000
const TRIAL_PACING_MS = Math.max(
  TRIAL_PACING_FLOOR_MS,
  Number(process.env.ROKABOT_TRIAL_PACING_MS) || TRIAL_PACING_FLOOR_MS
)
/** 12 fixture cases x 3 trials in tests/harness/__tests__/toolTrigger.live.test.ts. */
const TURNS_PER_RUN = 36

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/harness/__tests__/*.live.test.ts'],
    fileParallelism: false,
    // ~2x the expected run so this never becomes the binding constraint, unlike PR #38's 5000ms default
    // which masked its p95 result with an opaque timeout. Derived from the pacing rather than fixed: the
    // run is 12 cases x 3 trials, almost all of it sleeping, so raising ROKABOT_TRIAL_PACING_MS to clear a
    // 15 RPM ceiling would otherwise re-create exactly that trap — a timeout that aborts the run before it
    // can produce a verdict, and reports nothing about what was being measured.
    testTimeout: Math.max(900_000, TRIAL_PACING_MS * TURNS_PER_RUN * 2)
  }
})
