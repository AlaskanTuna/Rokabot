import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { config } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { __resetRateLimitersForTest, getSharedRateLimiter } from '../../../utils/rateLimiter.js'
import { __resetTokenBudgetForTest, remainingTokensThisMinute } from '../../tokenBudget.js'

/**
 * The Pi runs the legacy config, with no `llm:` block. These pin that per-call budgets left every limit it had, and
 * every decision its Discord guards make on reply traffic, exactly where they were.
 */
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
  closeDb()
  __resetRateLimitersForTest()
  __resetTokenBudgetForTest()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('legacy config under per-call budgets', () => {
  it("keeps today's limits on the synthesised Gemini route", () => {
    expect(config.llm.main.key).toBe('legacy-gemini')
    expect(config.llm.main.limits).toEqual({
      rpm: config.rateLimit.rpm,
      rpd: config.rateLimit.rpd,
      tpm: config.gemini.maxTokensPerMinute
    })
    expect(config.llm.main.limits).toEqual({ rpm: 15, rpd: 500, tpm: 125_000 })
  })

  it('declines the fourth concurrent turn at rpm 15, as the Discord guard always has', () => {
    const limiter = getSharedRateLimiter()

    for (let turn = 0; turn < 3; turn += 1) expect(limiter.reserveCalls(config.gemini.maxLlmCalls)).toBeDefined()

    expect(limiter.canAdmitCalls(config.gemini.maxLlmCalls)).toBe(false)
  })

  it('still admits a turn on the last daily unit', () => {
    const limiter = getSharedRateLimiter()
    while (limiter.remainingRpd > 1) {
      if (!limiter.tryConsume()) vi.advanceTimersByTime(60_001)
    }
    vi.advanceTimersByTime(60_001)

    expect(limiter.canAdmitCalls(config.gemini.maxLlmCalls)).toBe(true)
  })

  it('reads the attachment guard from the Gemini route bucket at the old budget', () => {
    expect(remainingTokensThisMinute()).toBe(125_000)
  })
})
