import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { config } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { __resetRateLimitersForTest, getSharedRateLimiter } from '../../../utils/rateLimiter.js'
import {
  __resetTokenBudgetForTest,
  canAffordAttachments,
  chargeTokens,
  remainingTokensThisMinute
} from '../../tokenBudget.js'
import { __resetBudgetsForTest, reserveCall, startCall } from '../budget.js'

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
  __resetBudgetsForTest()
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

  it('adds nothing to the minute for the reply calls a turn reserved', () => {
    const limiter = getSharedRateLimiter()
    limiter.reserveCalls(config.gemini.maxLlmCalls)

    for (let call = 0; call < config.gemini.maxLlmCalls; call += 1) {
      reserveCall({ provider: 'gemini', model: config.gemini.model, workload: 'reply', estTokens: 1_000 })
    }

    expect(limiter.remainingRpm).toBe(15 - config.gemini.maxLlmCalls)
  })

  it('still settles single-call turns at rpm - maxLlmCalls + 1 a minute (#167)', () => {
    const limiter = getSharedRateLimiter()
    let admitted = 0
    for (let turn = 0; turn < 15; turn += 1) {
      const reservation = limiter.reserveCalls(config.gemini.maxLlmCalls)
      if (!reservation) break
      admitted += 1
      reserveCall({ provider: 'gemini', model: config.gemini.model, workload: 'reply', estTokens: 1_000 })
      reservation.release(1)
    }

    expect(admitted).toBe(12)
  })

  it('grants every background call on the legacy main without taking a slot or a daily unit', () => {
    const { provider, model } = config.llm.main
    for (let call = 0; call < 100; call += 1) {
      expect(reserveCall({ provider, model, workload: 'extraction', estTokens: 1_000 })).not.toHaveProperty('denied')
    }

    const limiter = getSharedRateLimiter()
    expect(limiter.remainingRpm).toBe(15)
    expect(limiter.remainingRpd).toBe(500)
    expect(limiter.canAdmitCalls(config.gemini.maxLlmCalls)).toBe(true)
  })

  it.each(['reply', 'extraction'] as const)('never refuses a legacy ModelScope %s call', async (workload) => {
    for (let call = 0; call < 300; call += 1) {
      await expect(
        startCall({ provider: 'modelscope', model: config.fallback.model, workload, estTokens: 1_000 })
      ).resolves.toHaveProperty('release')
    }
  })

  it('charges a turn that reached the model one daily unit, whatever it spent of its ladder', () => {
    getSharedRateLimiter().reserveCalls(config.gemini.maxLlmCalls)?.release(3)

    expect(getSharedRateLimiter().remainingRpd).toBe(499)
  })

  it('hands the daily unit back for a turn that made no call', () => {
    getSharedRateLimiter().reserveCalls(config.gemini.maxLlmCalls)?.release(0)

    expect(getSharedRateLimiter().remainingRpd).toBe(500)
  })

  it('charges no tokens per call on the legacy main, whatever the workload', () => {
    const { provider, model } = config.llm.main
    for (const workload of ['reply', 'watcher', 'extraction'] as const) {
      reserveCall({ provider, model, workload, estTokens: 200_000 })
    }

    expect(remainingTokensThisMinute()).toBe(config.gemini.maxTokensPerMinute)
  })

  it('declines an attachment turn at the same token threshold as before', () => {
    chargeTokens(config.gemini.maxTokensPerMinute - config.gemini.maxAttachmentTokens)
    expect(canAffordAttachments()).toBe(true)

    reserveCall({ provider: 'gemini', model: config.gemini.model, workload: 'reply', estTokens: 1_000 })
    expect(canAffordAttachments()).toBe(true)

    chargeTokens(1)
    expect(canAffordAttachments()).toBe(false)
  })
})
