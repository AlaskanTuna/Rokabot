import { afterEach, describe, expect, it, vi } from 'vitest'

const FLOOR_MS = 12000

async function pacingWith(override: string | undefined): Promise<number> {
  vi.resetModules()
  if (override === undefined) vi.stubEnv('ROKABOT_TRIAL_PACING_MS', '')
  else vi.stubEnv('ROKABOT_TRIAL_PACING_MS', override)
  const { TRIAL_PACING_MS } = await import('../toolTrigger.js')
  return TRIAL_PACING_MS
}

describe('live-gate trial pacing', () => {
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
