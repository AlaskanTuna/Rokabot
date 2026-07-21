import { describe, expect, it } from 'vitest'
import { classifyGeminiFailure, computeBackoff } from '../geminiReliability.js'

describe('classifyGeminiFailure', () => {
  it.each([
    ['429', { errorCode: 429 }, { kind: 'transient_http', retryable: true, deflect: false }],
    ['503', { errorCode: 503 }, { kind: 'transient_http', retryable: true, deflect: false }],
    [
      'RESOURCE_EXHAUSTED',
      { errorCode: 'RESOURCE_EXHAUSTED' },
      { kind: 'transient_http', retryable: true, deflect: false }
    ],
    ['fetch failed', new Error('fetch failed'), { kind: 'network', retryable: true, deflect: false }],
    ['ETIMEDOUT', new Error('connect ETIMEDOUT'), { kind: 'network', retryable: true, deflect: false }],
    [
      'abort',
      { name: 'AbortError', message: 'The operation was aborted' },
      { kind: 'network', retryable: true, deflect: false }
    ],
    [
      'empty parts',
      { hasText: false, hasFunctionCall: false },
      { kind: 'empty_text', retryable: true, deflect: false }
    ],
    [
      'SAFETY finish reason',
      { finishReason: 'SAFETY', hasText: false, hasFunctionCall: false },
      { kind: 'safety', retryable: false, deflect: true }
    ],
    [
      'PROHIBITED_CONTENT',
      { finishReason: 'PROHIBITED_CONTENT', hasText: false, hasFunctionCall: false },
      { kind: 'safety', retryable: false, deflect: true }
    ],
    [
      'RECITATION',
      { finishReason: 'RECITATION', hasText: false, hasFunctionCall: false },
      { kind: 'recitation', retryable: true, deflect: true }
    ],
    [
      'MAX_TOKENS thoughts-only output',
      { finishReason: 'MAX_TOKENS', hasText: false, hasFunctionCall: false },
      { kind: 'empty_text', retryable: true, deflect: false }
    ],
    ['400', { errorCode: 400 }, { kind: 'terminal', retryable: false, deflect: true }],
    ['INVALID_ARGUMENT', { errorCode: 'INVALID_ARGUMENT' }, { kind: 'terminal', retryable: false, deflect: true }]
  ])('classifies %s', (_name, input, expected) => {
    expect(classifyGeminiFailure(input)).toEqual(expected)
  })

  it('returns ok for text or a function call', () => {
    expect(classifyGeminiFailure({ hasText: true, hasFunctionCall: false })).toEqual({
      kind: 'ok',
      retryable: false,
      deflect: false
    })
    expect(classifyGeminiFailure({ hasText: false, hasFunctionCall: true })).toEqual({
      kind: 'ok',
      retryable: false,
      deflect: false
    })
  })
})

describe('computeBackoff', () => {
  it('increases monotonically before the cap when jitter is disabled', () => {
    const delays = [0, 1, 2].map((attempt) => computeBackoff(attempt, 100, { jitter: false, maxMs: 1_000 }))

    expect(delays).toEqual([100, 200, 400])
  })

  it('caps the exponential delay', () => {
    expect(computeBackoff(5, 100, { jitter: false, maxMs: 1_000 })).toBe(1_000)
  })

  it('uses injected randomness within the jitter bounds', () => {
    const random = () => 0.25
    const delay = computeBackoff(2, 100, { maxMs: 1_000, random })

    expect(delay).toBe(250)
    expect(delay).toBeGreaterThanOrEqual(100 * 2 ** 2 * 0.5)
    expect(delay).toBeLessThanOrEqual(100 * 2 ** 2)
  })
})
