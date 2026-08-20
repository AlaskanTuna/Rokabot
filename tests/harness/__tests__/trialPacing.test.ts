import { afterEach, describe, expect, it, vi } from 'vitest'

import { config } from '../../../src/config.js'

// Written out, not derived from config the way toolTrigger.ts derives it. A test that recomputed
// `60000 * maxLlmCalls / rpm` would move in lockstep with the code and go silent on exactly the event it
// exists to force someone to look at — a changed `maxLlmCalls` or `rpm` re-pricing every live gate run
// (#160). 16000 is the value at maxLlmCalls 4 and rpm 15.
const DERIVED_FLOOR_MS = 16000

// The human's Gate-1 amendment (2026-07-29), which the derived floor sits above today and must not fall
// below if either knob moves.
const GATE1_FLOOR_MS = 12000

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
    vi.doUnmock('../../../src/config.js')
    vi.resetModules()
  })

  it('paces at the derived floor when no override is set', async () => {
    await expect(pacingWith(undefined)).resolves.toBe(DERIVED_FLOOR_MS)
  })

  // The property the floor exists for, and the one nothing checked before #166: a turn may spend up to
  // `maxLlmCalls` requests, so the gate's own request rate is calls-per-turn over the pace, and it has to
  // fit inside the same quota the retry ladder is fighting for. At the old 12000 this is 20 against 15 —
  // which is what put 17 RPM refusals into the 2026-08-20 run and aborted a case set.
  it('keeps the gate below the RPM cap even when every turn spends its full call budget', async () => {
    const pacing = await pacingWith(undefined)
    const callsPerMinute = (60_000 / pacing) * config.gemini.maxLlmCalls

    expect(callsPerMinute).toBeLessThanOrEqual(config.rateLimit.rpm)
  })

  // docs/decisions.md, Gate-1 amendment 2026-07-29: never below 12000. The derived floor is above it at
  // today's config, so this drives the branch that would otherwise never run — a cheaper `maxLlmCalls`
  // makes the derivation alone return 4000, and the amendment is what refuses it.
  it('never paces faster than the Gate-1 floor, however cheap the derivation gets', async () => {
    vi.resetModules()
    vi.stubEnv('ROKABOT_TRIAL_PACING_MS', '')
    vi.doMock('../../../src/config.js', async () => {
      const actual = await vi.importActual<typeof import('../../../src/config.js')>('../../../src/config.js')
      return { ...actual, config: { ...actual.config, gemini: { ...actual.config.gemini, maxLlmCalls: 1 } } }
    })
    const { TRIAL_PACING_MS } = await import('../toolTrigger.js')

    expect(TRIAL_PACING_MS).toBe(GATE1_FLOOR_MS)
  })

  it('honours an override that slows the run down', async () => {
    await expect(pacingWith('30000')).resolves.toBe(30000)
  })

  it('refuses an override that would speed the run past the floor', async () => {
    await expect(pacingWith('5000')).resolves.toBe(DERIVED_FLOOR_MS)
  })

  it('falls back to the floor when the override is not a number', async () => {
    await expect(pacingWith('soon')).resolves.toBe(DERIVED_FLOOR_MS)
  })
})
