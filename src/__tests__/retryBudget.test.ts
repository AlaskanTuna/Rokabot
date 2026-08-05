import { describe, expect, it, vi } from 'vitest'
import { computeBackoff } from '../agent/geminiReliability.js'
import { runTurnWithReliability } from '../agent/roka.js'
import { deriveAchievableRetries } from '../config.js'

describe('retry budget', () => {
  it('matches the reliability loop across retry limits, jitter tails, and edge backoff bases', async () => {
    expect(deriveAchievableRetries(6, 0, 12_000, 1)).toBe(6)
    expect(deriveAchievableRetries(6, 12_000, 12_000, 1)).toBe(1)
    expect(deriveAchievableRetries(6, 1_000, 12_000, 1)).toBe(4)
    expect(deriveAchievableRetries(6, 1_000, 12_000, 0.5)).toBe(5)

    const attemptsByJitterTail = await Promise.all(
      [
        { jitterFactor: 1, random: () => 1 },
        { jitterFactor: 0.5, random: () => 0 }
      ].map(async ({ jitterFactor, random }) => {
        const attempts = await Promise.all(
          Array.from({ length: 7 }, async (_, maxRetries) => {
            const runTurn = vi.fn().mockResolvedValue({ errorCode: '429' })
            const result = await runTurnWithReliability({
              runTurn,
              tryConsumeRetry: () => true,
              computeBackoff: (attempt) => computeBackoff(attempt, 1_000, { maxMs: 12_000, random }),
              sleep: () => Promise.resolve(),
              maxRetries,
              retryBackoffCapMs: 12_000,
              genericFallback: 'generic fallback',
              safetyDeflection: 'safety deflection',
              recitationDeflection: 'recitation deflection',
              terminalDeflection: 'terminal deflection'
            })

            expect(result.attempts).toBe(deriveAchievableRetries(maxRetries, 1_000, 12_000, jitterFactor) + 1)
            return result.attempts
          })
        )

        return attempts
      })
    )

    expect(attemptsByJitterTail[0].slice(-2)).toEqual([5, 5])
    expect(attemptsByJitterTail[1].slice(-2)).toEqual([6, 6])
  })

  it('retries an attempt aborted by the per-attempt timeout while turn-deadline budget remains', async () => {
    const runTurn = vi.fn(async (attempt: number, signal: AbortSignal) => {
      if (attempt === 0) {
        return await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new Error('exception AbortError: This operation was aborted sending request'))
          )
        })
      }
      return { text: 'recovered', hasText: true, hasFunctionCall: false }
    })

    const result = await runTurnWithReliability({
      runTurn,
      tryConsumeRetry: () => true,
      computeBackoff: () => 0,
      sleep: () => Promise.resolve(),
      maxRetries: 2,
      requestTimeoutMs: 20,
      turnDeadlineMs: 5_000,
      retryBackoffCapMs: 12_000,
      genericFallback: 'generic fallback',
      safetyDeflection: 'safety deflection',
      recitationDeflection: 'recitation deflection',
      terminalDeflection: 'terminal deflection'
    })

    expect(result.success).toBe(true)
    expect(result.text).toBe('recovered')
    expect(runTurn).toHaveBeenCalledTimes(2)
  })

  it('still stops immediately when the abort came from shutdown rather than the attempt timeout', async () => {
    let shuttingDown = false
    const runTurn = vi.fn(async (_attempt: number, signal: AbortSignal) => {
      shuttingDown = true
      return await new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    const result = await runTurnWithReliability({
      runTurn,
      isShuttingDown: () => shuttingDown,
      tryConsumeRetry: () => true,
      computeBackoff: () => 0,
      sleep: () => Promise.resolve(),
      maxRetries: 2,
      requestTimeoutMs: 20,
      turnDeadlineMs: 5_000,
      retryBackoffCapMs: 12_000,
      genericFallback: 'generic fallback',
      safetyDeflection: 'safety deflection',
      recitationDeflection: 'recitation deflection',
      terminalDeflection: 'terminal deflection'
    })

    expect(result.success).toBe(false)
    expect(runTurn).toHaveBeenCalledTimes(1)
  })
})
