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
    [
      'function-call ordering error',
      {
        errorCode: 'INVALID_ARGUMENT',
        errorMessage:
          'Please ensure that function call turn comes immediately after a user turn or after a function response turn.'
      },
      { kind: 'session_corrupt', retryable: true, deflect: true }
    ],
    ['400', { errorCode: 400 }, { kind: 'terminal', retryable: false, deflect: true }],
    ['INVALID_ARGUMENT', { errorCode: 'INVALID_ARGUMENT' }, { kind: 'terminal', retryable: false, deflect: true }],
    [
      '429 envelope with quota figure and symbolic marker',
      {
        errorCode: 'ApiError',
        errorMessage:
          'got status: 429 Too Many Requests. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded, limit: 4000000"}}'
      },
      { kind: 'transient_http', retryable: true, deflect: false }
    ],
    [
      '429 envelope with quota figure, no symbolic marker',
      {
        errorCode: 'ApiError',
        errorMessage: 'got status: 429 Too Many Requests. {"error":{"code":429,"message":"limit: 4000000"}}'
      },
      { kind: 'transient_http', retryable: true, deflect: false }
    ],
    [
      'genuine 400 INVALID_ARGUMENT envelope',
      {
        errorCode: 'ApiError',
        errorMessage: 'got status: 400 Bad Request. {"error":{"code":400,"status":"INVALID_ARGUMENT"}}'
      },
      { kind: 'terminal', retryable: false, deflect: true }
    ],
    [
      '503 UNAVAILABLE envelope',
      {
        errorCode: 'ApiError',
        errorMessage:
          'got status: 503 Service Unavailable. {"error":{"code":503,"status":"UNAVAILABLE","message":"The model is overloaded."}}'
      },
      { kind: 'transient_http', retryable: true, deflect: false }
    ],
    [
      "'aborted' network match wins over embedded 15000 digits (not a status-pattern test)",
      {
        errorCode: 'ApiError',
        errorMessage: 'Request aborted after 15000 ms',
        hasText: false,
        hasFunctionCall: false
      },
      { kind: 'network', retryable: true, deflect: false }
    ],
    [
      '500-inside-5000000 sibling of the 400-inside-4000000 case (no real status code present)',
      {
        errorCode: 'ApiError',
        errorMessage: 'Backend returned an unexpected value: 5000000'
      },
      { kind: 'terminal', retryable: false, deflect: true }
    ],
    [
      'function-call ordering error with production errorCode shape',
      {
        errorCode: 'ApiError',
        errorMessage:
          'Please ensure that function call turn comes immediately after a user turn or after a function response turn.'
      },
      { kind: 'session_corrupt', retryable: true, deflect: true }
    ],
    ['403 bare numeric', { errorCode: 403 }, { kind: 'terminal', retryable: false, deflect: true }],
    ['500 bare numeric string', { errorCode: '500' }, { kind: 'transient_http', retryable: true, deflect: false }]
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
