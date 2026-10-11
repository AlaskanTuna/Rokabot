import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: mocks.warn } }))

import { closeDb, getDb } from '../database.js'
import { addSpend, monthKey, readSpend } from '../spendStore.js'

beforeEach(() => {
  closeDb()
  mocks.warn.mockReset()
})

afterEach(() => {
  closeDb()
})

describe('spendStore', () => {
  it('keys spend by UTC calendar month', () => {
    expect(monthKey(Date.UTC(2026, 9, 31, 23, 59, 59, 999))).toBe('2026-10')
    expect(monthKey(Date.UTC(2026, 10, 1))).toBe('2026-11')
  })

  it('creates the llm_spend table with one key per month and provider', () => {
    const columns = getDb().prepare("PRAGMA table_info('llm_spend')").all() as Array<{ name: string; pk: number }>

    expect(columns.map((column) => column.name)).toEqual(['month', 'provider', 'usd'])
    expect(columns.filter((column) => column.pk > 0).map((column) => column.name)).toEqual(['month', 'provider'])
  })

  it('reads zero for a month nothing was spent in', () => {
    expect(readSpend('2026-10', 'anthropic')).toBe(0)
  })

  it('adds each call to its own month and provider', () => {
    addSpend('2026-10', 'anthropic', 0.25)
    addSpend('2026-10', 'anthropic', 0.5)
    addSpend('2026-10', 'openai', 1)
    addSpend('2026-11', 'anthropic', 2)

    expect(readSpend('2026-10', 'anthropic')).toBeCloseTo(0.75)
    expect(readSpend('2026-10', 'openai')).toBe(1)
    expect(readSpend('2026-11', 'anthropic')).toBe(2)
    expect(getDb().prepare('SELECT COUNT(*) AS total FROM llm_spend').get()).toEqual({ total: 3 })
  })

  // It runs inside a provider call, and losing one estimate must not fail the reply that cost it.
  it('logs instead of throwing when the write fails', () => {
    getDb().exec('DROP TABLE llm_spend')

    expect(() => addSpend('2026-10', 'anthropic', 1)).not.toThrow()
    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})
