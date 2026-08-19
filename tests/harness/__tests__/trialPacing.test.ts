import { afterEach, describe, expect, it, vi } from 'vitest'

const FLOOR_MS = 12000

async function pacingWith(override: string | undefined): Promise<number> {
  vi.resetModules()
  if (override === undefined) vi.stubEnv('ROKABOT_TRIAL_PACING_MS', '')
  else vi.stubEnv('ROKABOT_TRIAL_PACING_MS', override)
  const { TRIAL_PACING_MS } = await import('../toolTrigger.js')
  return TRIAL_PACING_MS
}

// Each case calls vi.resetModules() and then re-imports toolTrigger.js cold, which pulls the harness and
// ADK back through the transform pipeline. Measured at 3,588 ms for the first of the four — 72% of vitest's
// 5,000 ms default — and it has been seen failing a full run while passing in isolation and on clean
// re-runs. The cost is import time, not a timer, so waiting longer is the honest fix rather than a smell:
// the alternative is an intermittent that looks exactly like a real regression on a loaded CI box.
describe('live-gate trial pacing', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('paces at the Gate-1 floor when no override is set', async () => {
    await expect(pacingWith(undefined)).resolves.toBe(FLOOR_MS)
  })

  // The 2-calls-per-turn budget this floor was calibrated against predates the safety de-escalation
  // ladder, so a run sharing project quota with live traffic can still trip the 15 RPM cap.
  it('honours an override that slows the run down', async () => {
    await expect(pacingWith('30000')).resolves.toBe(30000)
  })

  // docs/decisions.md, Gate-1 amendment 2026-07-29: never below 12000. Enforced, not documented.
  it('refuses an override that would speed the run past the floor', async () => {
    await expect(pacingWith('5000')).resolves.toBe(FLOOR_MS)
  })

  it('falls back to the floor when the override is not a number', async () => {
    await expect(pacingWith('soon')).resolves.toBe(FLOOR_MS)
  })
})
