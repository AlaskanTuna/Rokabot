import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { config } from '../../config.js'
import {
  __resetTokenBudgetForTest,
  canAffordAttachments,
  chargeTokens,
  remainingTokensThisMinute
} from '../tokenBudget.js'

const BUDGET = config.gemini.maxTokensPerMinute
const CEILING = config.gemini.maxAttachmentTokens

describe('per-minute token budget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetTokenBudgetForTest()
  })

  it('starts with the whole minute available', () => {
    expect(remainingTokensThisMinute()).toBe(BUDGET)
  })

  it('subtracts what a turn spent', () => {
    chargeTokens(30_000)
    expect(remainingTokensThisMinute()).toBe(BUDGET - 30_000)
  })

  // Continuous rather than a reset on the minute boundary, mirroring the RPM bucket: a turn arriving one
  // second after a boundary would otherwise find a full budget that had just been spent.
  it('gives half the budget back after half a minute', () => {
    chargeTokens(BUDGET)
    vi.advanceTimersByTime(30_000)
    expect(remainingTokensThisMinute()).toBe(BUDGET / 2)
  })

  // A quiet hour must not become a minute in which three times the quota may be spent.
  it('does not bank credit while idle', () => {
    vi.advanceTimersByTime(10 * 60_000)
    chargeTokens(BUDGET)
    expect(remainingTokensThisMinute()).toBe(0)
  })

  it('admits an attachment turn while a full turn still fits', () => {
    chargeTokens(BUDGET - CEILING)
    expect(canAffordAttachments()).toBe(true)
  })

  // The turn is judged against the most one could cost rather than what this one will, because the real
  // figure is only knowable after the file has been downloaded and measured.
  it('declines an attachment turn once a full turn no longer fits', () => {
    chargeTokens(BUDGET - CEILING + 1)
    expect(canAffordAttachments()).toBe(false)
  })

  it('never reports a negative remainder', () => {
    chargeTokens(BUDGET * 3)
    expect(remainingTokensThisMinute()).toBe(0)
  })
})
