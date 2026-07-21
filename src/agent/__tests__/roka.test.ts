import { afterEach, describe, expect, it, vi } from 'vitest'
import { destroyAllSessions, runTurnWithReliability } from '../roka.js'
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
    isShuttingDown: () => false,
    maxRetries: 2,
    maxLatencyMs: 12_000,
    genericFallback,
    safetyDeflection,
    recitationDeflection,
    terminalDeflection,
    ...overrides
  }
}

afterEach(() => {
  resetForTest()
  vi.restoreAllMocks()
})

describe('runTurnWithReliability', () => {
  it('returns real text after retrying a transient error', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ errorCode: '429', errorMessage: 'quota exhausted' })
      .mockResolvedValueOnce({ text: 'I am back~', hasText: true })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: 'I am back~', kind: 'ok', action: 'preserve', attempts: 2 })
    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('retries an empty final response before returning real text', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ hasText: false, hasFunctionCall: false, finishReason: 'STOP' })
      .mockResolvedValueOnce({ text: 'Not spaced out after all.', hasText: true })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result.text).toBe('Not spaced out after all.')
    expect(runTurn).toHaveBeenCalledTimes(2)
  })

  it('returns a generic fallback after transient retries are exhausted', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '503', errorMessage: 'unavailable' })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: genericFallback, kind: 'transient_http', action: 'preserve', attempts: 3 })
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(2)
  })

  it('deflects safety blocks without retrying', async () => {
    const runTurn = vi.fn().mockResolvedValue({ finishReason: 'SAFETY', hasText: false, hasFunctionCall: false })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: safetyDeflection, kind: 'safety', action: 'preserve', attempts: 1 })
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('destroys only terminal failures', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorCode: 'INVALID_ARGUMENT', errorMessage: 'bad request' })

    const result = await runTurnWithReliability(options({ runTurn }))

    expect(result).toMatchObject({ text: terminalDeflection, kind: 'terminal', action: 'destroy', attempts: 1 })
    expect(runTurn).toHaveBeenCalledTimes(1)
  })

  it('does not consume a retry token when attempt zero succeeds', async () => {
    const tryConsumeRetry = vi.fn(() => true)

    const result = await runTurnWithReliability(
      options({ runTurn: vi.fn().mockResolvedValue({ text: 'First try.', hasText: true }), tryConsumeRetry })
    )

    expect(result.text).toBe('First try.')
    expect(tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('falls back immediately when a retry cannot reserve an RPM token', async () => {
    const tryConsumeRetry = vi.fn(() => false)
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '429', errorMessage: 'quota exhausted' })

    const result = await runTurnWithReliability(options({ runTurn, tryConsumeRetry }))

    expect(result).toMatchObject({ text: genericFallback, kind: 'transient_http', action: 'preserve', attempts: 1 })
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('uses one resample for recitation before declining', async () => {
    const runTurn = vi.fn().mockResolvedValue({ finishReason: 'RECITATION', hasText: false, hasFunctionCall: false })
    const testOptions = options({ runTurn })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ text: recitationDeflection, kind: 'recitation', action: 'preserve', attempts: 2 })
    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(testOptions.tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('returns a graceful fallback if the session disappears between attempts', async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ errorCode: '429', errorMessage: 'quota exhausted' })
      .mockResolvedValueOnce({ hasText: false, hasFunctionCall: false, sessionMissing: true })

    const result = await runTurnWithReliability(options({ runTurn }))

    expect(result).toMatchObject({ text: genericFallback, action: 'preserve', attempts: 2 })
  })

  it('does not spend a token beyond the backoff ceiling', async () => {
    const tryConsumeRetry = vi.fn(() => true)
    const sleep = vi.fn(() => Promise.resolve())
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '429', errorMessage: 'quota exhausted' })

    const result = await runTurnWithReliability(
      options({ runTurn, tryConsumeRetry, sleep, computeBackoff: () => 1, maxLatencyMs: 1 })
    )

    expect(result).toMatchObject({ text: genericFallback, attempts: 2 })
    expect(tryConsumeRetry).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('stops without spending another token when shutdown begins between attempts', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '429', errorMessage: 'quota exhausted' })
    const tryConsumeRetry = vi.fn(() => true)
    const sleep = vi.fn(async () => beginShutdown())

    const result = await runTurnWithReliability(options({ runTurn, tryConsumeRetry, sleep, isShuttingDown }))

    expect(result).toMatchObject({ text: genericFallback, kind: 'transient_http', action: 'preserve', attempts: 1 })
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(tryConsumeRetry).toHaveBeenCalledTimes(1)
  })

  it('aborts an in-flight turn during shutdown', async () => {
    const runTurn = vi.fn(
      (_attempt: number, signal: AbortSignal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ hasText: false, hasFunctionCall: false }))
        })
    )
    const response = runTurnWithReliability(options({ runTurn, isShuttingDown }))

    await vi.waitFor(() => expect(runTurn).toHaveBeenCalledOnce())
    await destroyAllSessions()

    await expect(response).resolves.toMatchObject({ text: genericFallback, action: 'preserve', attempts: 1 })
    expect(runTurn.mock.calls[0][1].aborted).toBe(true)
  })
})
