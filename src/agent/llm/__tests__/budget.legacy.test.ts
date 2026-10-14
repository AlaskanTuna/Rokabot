import type { LlmRequest, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { config } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { monthKey, readSpend } from '../../../storage/spendStore.js'
import { __resetRateLimitersForTest, getSharedRateLimiter } from '../../../utils/rateLimiter.js'
import {
  __resetTokenBudgetForTest,
  canAffordAttachments,
  chargeTokens,
  remainingTokensThisMinute
} from '../../tokenBudget.js'
import { __resetBudgetsForTest, isMonthlyExhausted, reserveCall, startCall } from '../budget.js'
import { createLlm } from '../createModel.js'
import { profileFor } from '../profiles.js'
import { recordUsage } from '../usage.js'

/**
 * A deployment without an `llm:` block runs the legacy config. These pin that per-call budgets left every limit it
 * had, and every decision its Discord guards make on reply traffic, exactly where they were.
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
  vi.unstubAllGlobals()
})

function request(): LlmRequest {
  return {
    model: 'unused',
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    config: {},
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

async function collect(responses: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of responses) result.push(response)
  return result
}

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

  it('lets two legacy ModelScope calls hold their grants at once', async () => {
    const call = { provider: 'modelscope', model: config.fallback.model, workload: 'reply', estTokens: 1_000 } as const

    await expect(Promise.all([startCall(call), startCall(call)])).resolves.toHaveLength(2)
  })

  it('sends two legacy ModelScope requests at once through the adapter', async () => {
    const profile =
      profileFor('modelscope', config.fallback.model) ?? profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')
    if (!profile) throw new Error('no ModelScope profile')
    const pending: Array<() => void> = []
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))))
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const llm = createLlm({
      key: 'legacy-fallback',
      provider: 'modelscope',
      model: config.fallback.model,
      profile,
      apiKey: 'test-key',
      baseUrl: 'https://modelscope.test/v1',
      timeoutMs: 5_000,
      maxOutputTokens: 300
    })

    const first = collect(llm.generateContentAsync(request()))
    const second = collect(llm.generateContentAsync(request()))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    for (const resolve of pending) resolve()
    await Promise.all([first, second])
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
    const calls = [
      { workload: 'reply', estTokens: 200_000 },
      { workload: 'watcher', estTokens: 200_000 },
      { workload: 'extraction', estTokens: 1_000 }
    ] as const
    for (const { workload, estTokens } of calls) {
      expect(reserveCall({ provider, model, workload, estTokens })).not.toHaveProperty('denied')
    }

    expect(remainingTokensThisMinute()).toBe(config.gemini.maxTokensPerMinute)
  })

  it('records spend on the legacy main and never refuses it for the month', async () => {
    const { provider, model } = config.llm.main
    recordUsage({ provider, model, workload: 'reply', inputTokens: 100_000_000, outputTokens: 0 })

    expect(readSpend(monthKey(), 'gemini')).toBeGreaterThan(0)
    expect(isMonthlyExhausted('gemini')).toBe(false)
    expect(reserveCall({ provider, model, workload: 'extraction', estTokens: 1_000 })).not.toHaveProperty('denied')
    await expect(startCall({ provider, model, workload: 'reply', estTokens: 1_000 })).resolves.toHaveProperty('release')
  })

  it('grants a legacy call whose signal already aborted, leaving the abort to the adapter as before', async () => {
    const routes = [config.llm.main, { provider: 'modelscope', model: config.fallback.model }] as const
    for (const { provider, model } of routes) {
      const call = { provider, model, workload: 'reply', estTokens: 1_000, signal: AbortSignal.abort() } as const
      await expect(startCall(call)).resolves.toHaveProperty('release')
    }
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
