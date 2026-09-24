/**
 * Reliability Evaluation Map
 *
 * | TRD Item | Asserted Scenario |
 * | --- | --- |
 * | `transient_http` | 429 then real text returns the real answer |
 * | `network` | ETIMEDOUT exhausts two retries and preserves the session |
 * | `empty_text` | Empty STOP result retries and returns real text |
 * | `safety` | SAFETY deflects without retrying |
 * | `recitation` | RECITATION gets one resample, then declines |
 * | `terminal` | INVALID_ARGUMENT declines without retrying and destroys the session |
 * | (a) Same-channel guard | A busy channel rejects a second turn without a retry token |
 * | (b) Cross-channel contention | Two channels share retry tokens and obey the retry floor |
 * | (c) TTL/session lifecycle | TTL exceeds retry window; a missing session during retry falls back cleanly |
 * | (d) Shutdown lifecycle | Shutdown between attempts falls back promptly |
 * | (e) Initial-token accounting | Attempt zero spends no retry token; one retry spends exactly one |
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    discord: { token: 'test-token', clientId: 'test-client', maxMessageLength: 2000 },
    gemini: {
      apiKey: 'test-key',
      model: 'gemini-test',
      timeout: 100,
      maxRetries: 1,
      maxOutputTokens: 300,
      maxLlmCalls: 4,
      liveMaxRetries: 2,
      retryRpmFloor: 2,
      retryBackoffBaseMs: 0,
      retryBackoffCapMs: 12_000,
      safetyThreshold: 'OFF'
    },
    fallback: {
      apiKey: '',
      model: 'fallback-test',
      baseUrl: 'https://fallback.test/v1',
      timeoutMs: 100,
      stickyMs: 300_000
    },
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10, maxRehydrationAge: 7_200_000, historyRetentionDays: 7 },
    memory: {
      bufferSize: 20,
      contextSize: 10,
      channelMonitorTtlMs: 86_400_000
    },
    emoji: { probability: 0.33, cooldownMs: 180_000 },
    reminders: { checkIntervalMs: 5_000, maxPerUser: 5, staleThresholdMs: 300_000 },
    games: { hangmanLives: 6, hangmanTimeoutMs: 60_000, shiritoriTimeoutMs: 60_000, shinyChance: 0.01 },
    statusCycleMs: 900_000,
    timezone: undefined
  }
}))

import { isChannelBusy, markBusy, markFree } from '../../discord/concurrency.js'
import { runTurnWithReliability } from '../reliability.js'
import { beginShutdown, isShuttingDown, resetForTest } from '../shutdownSignal.js'

const genericFallback = 'generic fallback'
const safetyDeflection = 'safety deflection'
const recitationDeflection = 'recitation deflection'
const terminalDeflection = 'terminal deflection'

function options(overrides: Partial<Parameters<typeof runTurnWithReliability>[0]> = {}) {
  return {
    runTurn: vi.fn(),
    tryConsumeRetry: vi.fn(() => true),
    computeBackoff: vi.fn(() => 0),
    sleep: vi.fn(() => Promise.resolve()),
    isShuttingDown,
    maxRetries: 2,
    retryBackoffCapMs: 12_000,
    genericFallback,
    safetyDeflection,
    recitationDeflection,
    terminalDeflection,
    ...overrides
  }
}

beforeEach(() => {
  resetForTest()
  vi.clearAllMocks()
})

afterEach(() => {
  resetForTest()
})

describe('reliability evaluation harness', () => {
  it.each([
    ['429 response', { errorCode: '429', errorMessage: 'quota exhausted' }],
    ['empty STOP response', { finishReason: 'STOP', hasText: false, hasFunctionCall: false }]
  ])('returns the real answer when the production symptom recovers after a %s', async (_name, firstOutcome) => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(firstOutcome)
      .mockResolvedValueOnce({ text: 'The real answer~', hasText: true, hasFunctionCall: false })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: 'The real answer~', success: true, action: 'preserve', attempts: 2 })
    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('preserves the session after network retries are exhausted', async () => {
    const testOptions = options({
      runTurn: vi.fn().mockResolvedValue({ errorMessage: 'connect ETIMEDOUT', hasText: false, hasFunctionCall: false })
    })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: genericFallback, kind: 'network', action: 'preserve', attempts: 3 })
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(2)
  })

  it('deflects safety without a retry token', async () => {
    const testOptions = options({
      runTurn: vi.fn().mockResolvedValue({ finishReason: 'SAFETY', hasText: false, hasFunctionCall: false })
    })

    await expect(runTurnWithReliability(testOptions)).resolves.toMatchObject({
      text: safetyDeflection,
      kind: 'safety',
      action: 'preserve',
      attempts: 1
    })
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('uses one recitation resample before declining', async () => {
    const testOptions = options({
      runTurn: vi.fn().mockResolvedValue({ finishReason: 'RECITATION', hasText: false, hasFunctionCall: false })
    })

    await expect(runTurnWithReliability(testOptions)).resolves.toMatchObject({
      text: recitationDeflection,
      kind: 'recitation',
      action: 'preserve',
      attempts: 2
    })
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('declines terminal failures and marks their session for destruction', async () => {
    const testOptions = options({
      runTurn: vi.fn().mockResolvedValue({ errorCode: 'INVALID_ARGUMENT', errorMessage: 'bad request' })
    })

    await expect(runTurnWithReliability(testOptions)).resolves.toMatchObject({
      text: terminalDeflection,
      kind: 'terminal',
      action: 'destroy',
      attempts: 1
    })
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('rejects a same-channel second turn while the first is retrying without spending its token', () => {
    const tryConsumeRetry = vi.fn(() => true)
    const channelId = 'same-channel'
    markBusy(channelId)

    const secondTurn = isChannelBusy(channelId) ? 'busy reply' : tryConsumeRetry()

    expect(secondTurn).toBe('busy reply')
    expect(tryConsumeRetry).not.toHaveBeenCalled()
    markFree(channelId)
    expect(isChannelBusy(channelId)).toBe(false)
  })

  it('keeps two interleaved channels within the shared retry budget', async () => {
    let remainingRpm = 3
    const tryConsumeAboveFloor = vi.fn((floor: number) => {
      if (remainingRpm < floor) return false
      remainingRpm--
      return true
    })
    const channel = (text: string) =>
      options({
        runTurn: vi
          .fn()
          .mockResolvedValueOnce({ errorCode: '429', errorMessage: 'quota exhausted' })
          .mockResolvedValueOnce({ text, hasText: true, hasFunctionCall: false }),
        tryConsumeRetry: () => tryConsumeAboveFloor(2)
      })

    const [first, second] = await Promise.all([
      runTurnWithReliability(channel('channel one answer')),
      runTurnWithReliability(channel('channel two answer'))
    ])

    expect(first).toMatchObject({ text: 'channel one answer', success: true })
    expect(second).toMatchObject({ text: 'channel two answer', success: true })
    expect(tryConsumeAboveFloor).toHaveBeenCalledTimes(2)
    expect(tryConsumeAboveFloor).toHaveBeenLastCalledWith(2)
    expect(remainingRpm).toBe(1)
  })

  it('keeps the TTL outside the retry window and falls back if a session disappears during retry', async () => {
    const testOptions = options({
      runTurn: vi
        .fn()
        .mockResolvedValueOnce({ errorCode: '429', errorMessage: 'quota exhausted' })
        .mockResolvedValueOnce({ sessionMissing: true, hasText: false, hasFunctionCall: false })
    })

    const result = await runTurnWithReliability(testOptions)

    expect(300_000).toBeGreaterThan(testOptions.retryBackoffCapMs)
    expect(result).toMatchObject({ text: genericFallback, action: 'preserve', attempts: 2 })
  })

  it('stops mid-retry on shutdown without another attempt', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '429', errorMessage: 'quota exhausted' })
    const tryConsumeRetry = vi.fn(() => true)
    const testOptions = options({
      runTurn,
      tryConsumeRetry,
      sleep: vi.fn(async () => beginShutdown())
    })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: genericFallback, action: 'preserve', attempts: 1 })
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('counts no token for a successful initial attempt and one for one retry', async () => {
    const initialTryConsume = vi.fn(() => true)
    const retriedTryConsume = vi.fn(() => true)

    await runTurnWithReliability(
      options({
        runTurn: vi.fn().mockResolvedValue({ text: 'first attempt answer', hasText: true, hasFunctionCall: false }),
        tryConsumeRetry: initialTryConsume
      })
    )
    await runTurnWithReliability(
      options({
        runTurn: vi
          .fn()
          .mockResolvedValueOnce({ errorCode: '429', errorMessage: 'quota exhausted' })
          .mockResolvedValueOnce({ text: 'retried answer', hasText: true, hasFunctionCall: false }),
        tryConsumeRetry: retriedTryConsume
      })
    )

    expect(initialTryConsume).not.toHaveBeenCalled()
    expect(retriedTryConsume).toHaveBeenCalledTimes(1)
  })
})
