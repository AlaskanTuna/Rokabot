import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Limits = { rpm?: number; rpd?: number; tpm?: number }
type Route = { key: string; provider: string; model: string; limits?: Limits }

const configState = vi.hoisted(() => ({
  logging: { level: 'silent' },
  gemini: { model: 'gemini-test', maxLlmCalls: 4, maxAttachmentTokens: 50_000 },
  llm: {
    main: {} as Route,
    fallback: null as Route | null,
    monthlyBudgetUsd: {} as Record<string, number>,
    modelscopeDailyMagicubes: 250
  }
}))

vi.mock('../../../config.js', () => ({ config: configState }))
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../profiles.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../profiles.js')>()),
  profileFor: (_provider: string, model: string) =>
    model === 'test-paid' ? { price: { input: 1, output: 1 } } : undefined
}))

import { closeDb } from '../../../storage/database.js'
import { getSharedRateLimiter } from '../../../utils/rateLimiter.js'
import { canAffordAttachments, chargeTokens, remainingTokensThisMinute, tokenBucketFor } from '../../tokenBudget.js'
import {
  type BudgetReservation,
  type CallInput,
  __resetBudgetsForTest,
  grantOrThrow,
  requestTokenEstimate,
  reserveCall,
  startCall
} from '../budget.js'
import { ProviderError } from '../providerError.js'

const reply = { provider: 'gemini', model: 'gemini-test', workload: 'reply', estTokens: 1_000 } as const
const extraction = { ...reply, workload: 'extraction' } as const
const fallbackReply = { provider: 'anthropic', model: 'test-paid', workload: 'reply', estTokens: 1_000 } as const

function granted(result: ReturnType<typeof reserveCall>): BudgetReservation {
  if ('denied' in result) throw new Error(`refused: ${result.denied}`)
  return result
}

/** How many calls are granted before the first refusal, capped so an unlimited budget cannot hang the test. */
function admitAll(input: CallInput): number {
  for (let admitted = 0; admitted < 10_000; admitted += 1) {
    if ('denied' in reserveCall(input)) return admitted
  }
  return Number.POSITIVE_INFINITY
}

function useRoutes(fallbackLimits?: Limits): void {
  configState.llm.main = {
    key: 'flash',
    provider: 'gemini',
    model: 'gemini-test',
    limits: { rpm: 15, rpd: 500, tpm: 125_000 }
  }
  configState.llm.fallback = { key: 'haiku', provider: 'anthropic', model: 'test-paid', limits: fallbackLimits }
  __resetBudgetsForTest()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
  closeDb()
  configState.llm.monthlyBudgetUsd = { anthropic: 5 }
  configState.llm.modelscopeDailyMagicubes = 250
  useRoutes()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('requests per model', () => {
  it.each(['reply', 'watcher'] as const)(
    'counts a %s call on the main model against its turn reservation, not a second time',
    (workload) => {
      const limiter = getSharedRateLimiter()
      const turn = limiter.reserveCalls(4)

      for (let call = 0; call < 4; call += 1) granted(reserveCall({ ...reply, workload }))
      expect(limiter.remainingRpm).toBe(11)

      turn?.release(4)
      expect(limiter.remainingRpm).toBe(11)
    }
  )

  it("grants a turn's reply calls on the main model after the turn took the minute's last slots", () => {
    configState.llm.main.limits = { rpm: 4, rpd: 500, tpm: 125_000 }
    __resetBudgetsForTest()
    getSharedRateLimiter().reserveCalls(4)

    expect(getSharedRateLimiter().remainingRpm).toBe(0)
    for (let call = 0; call < 4; call += 1) granted(reserveCall(reply))
  })

  it("grants a turn's reply calls on the main model after the turn took the day's last unit", () => {
    configState.llm.main.limits = { rpm: 1_000, rpd: 1, tpm: 125_000 }
    __resetBudgetsForTest()
    getSharedRateLimiter().reserveCalls(4)

    expect(getSharedRateLimiter().remainingRpd).toBe(0)
    for (let call = 0; call < 4; call += 1) granted(reserveCall(reply))
  })

  it('takes a slot of its own for a reply on the fallback model', () => {
    useRoutes({ rpm: 2 })

    granted(reserveCall(fallbackReply))
    granted(reserveCall(fallbackReply))

    expect(reserveCall(fallbackReply)).toEqual({ denied: 'rpm' })
  })

  it('leaves a whole reply turn of requests behind every background call', () => {
    expect(admitAll(extraction)).toBe(11)
    expect(reserveCall(extraction)).toEqual({ denied: 'rpm' })
    expect(getSharedRateLimiter().canAdmitCalls(4)).toBe(true)
  })

  it('gives background work its slots back as the minute rolls on', () => {
    admitAll(extraction)
    vi.advanceTimersByTime(60_001)

    expect('denied' in reserveCall(extraction)).toBe(false)
  })

  it('leaves a whole reply turn of the day behind every background call', () => {
    configState.llm.main.limits = { rpm: 1_000, rpd: 10, tpm: 125_000 }
    __resetBudgetsForTest()

    expect(admitAll(extraction)).toBe(6)
    expect(reserveCall(extraction)).toEqual({ denied: 'rpd' })
    expect(getSharedRateLimiter().remainingRpd).toBe(4)
  })

  it('never limits a model with no limits of its own', () => {
    useRoutes(undefined)

    for (let call = 0; call < 500; call += 1) granted(reserveCall({ ...fallbackReply, workload: 'extraction' }))
  })
})

describe('tokens per minute', () => {
  it('never refuses a text reply on tokens', () => {
    useRoutes({ tpm: 1_000 })

    granted(reserveCall({ ...fallbackReply, estTokens: 200_000 }))
    granted(reserveCall({ ...fallbackReply, estTokens: 200_000 }))

    expect(tokenBucketFor({ provider: 'anthropic', model: 'test-paid', limits: { tpm: 1_000 } })?.remaining()).toBe(0)
  })

  it.each(['reply', 'watcher'] as const)(
    'charges nothing per call for a %s on the main model, which its turn pays for',
    (workload) => {
      granted(reserveCall({ ...reply, workload, estTokens: 200_000 }))

      expect(remainingTokensThisMinute()).toBe(125_000)
    }
  )

  it('keeps a whole attachment turn of the minute free of background calls', () => {
    chargeTokens(70_000)
    granted(reserveCall({ ...extraction, estTokens: 5_000 }))

    expect(reserveCall({ ...extraction, estTokens: 1 })).toEqual({ denied: 'tpm' })
    expect(canAffordAttachments()).toBe(true)
  })

  it('settles the minute at what the provider reported', () => {
    const call = granted(reserveCall({ ...extraction, estTokens: 10_000 }))

    call.release({ ...extraction, inputTokens: 1_500, outputTokens: 40, cacheReadTokens: 500 })

    expect(remainingTokensThisMinute()).toBe(125_000 - 2_000)
  })

  it('keeps the estimate when the call reported nothing', () => {
    granted(reserveCall({ ...extraction, estTokens: 10_000 })).release()

    expect(remainingTokensThisMinute()).toBe(125_000 - 10_000)
  })

  it('settles only once', () => {
    const call = granted(reserveCall({ ...extraction, estTokens: 10_000 }))
    const usage = { ...extraction, inputTokens: 2_000, outputTokens: 0 }

    call.release(usage)
    call.release(usage)

    expect(remainingTokensThisMinute()).toBe(125_000 - 2_000)
  })

  it('never declines attachments for a main model with no tpm', () => {
    configState.llm.main = { key: 'haiku', provider: 'anthropic', model: 'test-paid' }
    __resetBudgetsForTest()

    granted(reserveCall({ ...fallbackReply, estTokens: 1_000_000 }))

    expect(canAffordAttachments()).toBe(true)
  })
})

describe('startCall', () => {
  it('throws quota_exhausted with a one-minute wait when the minute is spent', async () => {
    useRoutes({ rpm: 1 })
    ;(await startCall(fallbackReply)).release()

    await expect(startCall(fallbackReply)).rejects.toMatchObject({
      provider: 'anthropic',
      kind: 'quota_exhausted',
      retryAfterMs: 60_000
    })
  })

  it('throws quota_exhausted with the wait until UTC midnight when the day is spent', async () => {
    useRoutes({ rpd: 1 })
    ;(await startCall(fallbackReply)).release()

    await expect(startCall(fallbackReply)).rejects.toMatchObject({
      kind: 'quota_exhausted',
      retryAfterMs: Date.UTC(2026, 9, 12) - Date.UTC(2026, 9, 11, 12)
    })
  })

  it('throws a ProviderError the reliability ladder can classify', async () => {
    useRoutes({ rpm: 1 })
    ;(await startCall(fallbackReply)).release()

    await expect(startCall(fallbackReply)).rejects.toBeInstanceOf(ProviderError)
  })

  it('starts a call whose grant releases with usage or without', async () => {
    const grant = await startCall(fallbackReply)
    const usage = {
      provider: 'anthropic',
      model: 'test-paid',
      workload: 'reply',
      inputTokens: 1,
      outputTokens: 1
    } as const

    expect(() => grant.release(usage)).not.toThrow()
    expect(() => grant.release()).not.toThrow()
  })
})

describe('denials and estimates', () => {
  function denialOf(denied: 'rpm' | 'rpd' | 'tpm' | 'monthly'): unknown {
    try {
      grantOrThrow('anthropic', { denied })
    } catch (error) {
      return error
    }
    return undefined
  }

  it.each([
    ['monthly', 'billing_exhausted', undefined],
    ['rpm', 'quota_exhausted', 60_000],
    ['tpm', 'quota_exhausted', 60_000]
  ] as const)('turns a %s denial into a %s ProviderError with retryAfterMs %s', (denied, kind, retryAfterMs) => {
    const caught = denialOf(denied)

    expect(caught).toMatchObject({ name: 'ProviderError', provider: 'anthropic', kind })
    expect((caught as { retryAfterMs?: number }).retryAfterMs).toBe(retryAfterMs)
  })

  it('retries a daily denial at the next UTC midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T22:30:00Z'))

    expect(denialOf('rpd')).toMatchObject({
      name: 'ProviderError',
      provider: 'anthropic',
      kind: 'quota_exhausted',
      retryAfterMs: 90 * 60_000
    })
  })

  it('estimates tokens without counting inline media bytes', () => {
    const withImage = requestTokenEstimate({
      text: 'hello there',
      inlineData: { mimeType: 'image/png', data: 'A'.repeat(40_000) }
    })

    expect(withImage).toBeLessThan(50)
  })
})
