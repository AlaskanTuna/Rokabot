import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadGetLocalHour() {
  vi.resetModules()
  return (await import('../timezone.js')).getLocalHour
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The live gate reads this per turn, and it reaches the prompt twice: the context layer's time-of-day
// sentence and detectTone's isLateNight, which both step at 05:00. A 15-minute case set that crosses that
// boundary scores two different prompts as though they were one, which is how "two green runs" came to read
// as reproducibility while delivering a coin flip on any case sensitive to the context layer.
describe('getLocalHour under the harness pin', () => {
  it('returns the pinned hour instead of the clock', async () => {
    vi.stubEnv('ROKABOT_HARNESS_LIVE', '1')
    vi.stubEnv('ROKABOT_FIXED_HOUR', '14')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T23:30:00'))

    expect((await loadGetLocalHour())()).toBe(14)
  })

  // The half that keeps this out of production. A stray ROKABOT_FIXED_HOUR in a deployed environment must
  // not freeze her sense of time — the layer exists precisely so she knows what part of the day it is.
  it('ignores the pin entirely when the harness flag is not set', async () => {
    vi.stubEnv('ROKABOT_HARNESS_LIVE', '')
    vi.stubEnv('ROKABOT_FIXED_HOUR', '14')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T23:30:00'))

    expect((await loadGetLocalHour())()).toBe(23)
  })

  it.each(['24', '-1', 'afternoon', '', '9.5'])('falls back to the clock for %s', async (value) => {
    vi.stubEnv('ROKABOT_HARNESS_LIVE', '1')
    vi.stubEnv('ROKABOT_FIXED_HOUR', value)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T23:30:00'))

    expect((await loadGetLocalHour())()).toBe(23)
  })

  it('accepts both ends of the day, so no legal hour is treated as absent', async () => {
    vi.stubEnv('ROKABOT_HARNESS_LIVE', '1')
    for (const hour of ['0', '23']) {
      vi.stubEnv('ROKABOT_FIXED_HOUR', hour)
      expect((await loadGetLocalHour())()).toBe(Number(hour))
    }
  })
})
