import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMemsim } from '../memsim/sim.js'

const SAVED_KEYS = [
  'GEMINI_API_KEY',
  'DOTENV_CONFIG_PATH',
  'ROKABOT_CONFIG_PATH',
  'ROKABOT_DB_PATH',
  'MEMORY_STORE',
  'MEMORY_PRIVACY',
  'TYPESAFE_API_KEY'
] as const

describe('memory simulator replay gate', () => {
  const savedEnv = new Map<string, string | undefined>()

  beforeEach(() => {
    vi.resetModules()
    for (const key of SAVED_KEYS) savedEnv.set(key, process.env[key])
  })

  afterEach(() => {
    for (const key of SAVED_KEYS) {
      const value = savedEnv.get(key)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    vi.resetModules()
  })

  it('passes all Phase 3/4, privacy, crash-safety and trigger-coverage gates offline from committed cache', async () => {
    const report = await runMemsim({
      mode: 'replay',
      store: 'dual',
      privacy: 'balanced',
      cacheDir: 'tests/harness/memsim/cache'
    })

    expect(report.providerCalls.river.live).toBe(0)
    expect(report.providerCalls.embeddings.live).toBe(0)
    expect(report.providerCalls.typesafe.live).toBe(0)
    expect(report.integrity.status).toBe('passed')
    expect(report.integrity.finalDrift).toEqual({ fact: 0, episode: 0, media: 0 })
    expect(report.triggerCoverage.status).toBe('passed')
    expect(report.triggerCoverage.missing).toEqual([])
    expect(report.phase4Parity.status).toBe('passed')
    expect(report.phase4Parity.turnsChecked).toBeGreaterThanOrEqual(150)
    expect(report.phase4Parity.mismatches).toBe(0)
    expect(report.privacyGate.status).toBe('passed')
    expect(report.privacyGate.privateOnlyItemsCount).toBeGreaterThanOrEqual(4)
    expect(report.privacyGate.privateTokensLeaked).toBe(0)
    expect(report.privacyGate.dmTurnsChecked).toBeGreaterThanOrEqual(3)
    expect(report.privacyGate.dmMemoryBlockLeaks).toBe(0)
    expect(report.crashSafety.status).toBe('passed')
    expect(report.quality.overallPlanted).toBeGreaterThanOrEqual(40)
    expect(report.gatesPassed).toBe(true)
  }, 55_000)
})
