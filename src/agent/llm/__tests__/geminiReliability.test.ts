import { describe, expect, it } from 'vitest'
import { classifyGeminiFailure, computeBackoff, extractGeminiStatus } from '../geminiReliability.js'

describe('extractGeminiStatus', () => {
  it.each(['4000000', 'my room is 305'])('returns undefined for %s', (errorMessage) => {
    expect(extractGeminiStatus(errorMessage)).toBeUndefined()
  })
})

describe('classifyGeminiFailure', () => {
  it.each([
    ['429', { errorCode: 429 }, { kind: 'transient_http', retryable: true, deflect: false }],
    ['503', { errorCode: 503 }, { kind: 'transient_http', retryable: true, deflect: false }],
    ['504', { errorCode: 504 }, { kind: 'transient_http', retryable: true, deflect: false }],
    [
      '504 envelope without a network marker',
      {
        name: 'ApiError',
        errorMessage: 'got status: 504 Gateway Failure. {"error":{"code":504,"message":"upstream failed"}}'
      },
      { kind: 'transient_http', retryable: true, deflect: false }
    ],
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
      '504-inside-5040000 is not a status code',
      {
        errorCode: 'ApiError',
        errorMessage: 'Backend returned an unexpected value: 5040000'
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
    ['500 bare numeric string', { errorCode: '500' }, { kind: 'transient_http', retryable: true, deflect: false }],
    [
      '500 envelope with quota figure, no symbolic marker',
      {
        errorCode: 'ApiError',
        errorMessage: 'got status: 500 Internal Server Error. {"error":{"code":500,"message":"limit: 4000000"}}'
      },
      { kind: 'transient_http', retryable: true, deflect: false }
    ]
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

// Verbatim shapes from a 2026-08-21 measurement. Both arrive as 429 RESOURCE_EXHAUSTED with the same status,
// and only the quota ID separates a minute that heals in seconds from a day that does not heal until midnight
// Pacific (#150). The generic 429 rule retried the second three times a turn and reported it as a transient.
const SPENT_DAY =
  'got status: 429. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[' +
  '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"500"}],"retryDelay":"39s"}}'
const SPENT_MINUTE =
  'got status: 429. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[' +
  '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaValue":"15"}],"retryDelay":"21s"}}'

describe('a spent day is not a spent minute', () => {
  it('names a daily refusal as its own kind rather than a transient', () => {
    expect(classifyGeminiFailure({ errorMessage: SPENT_DAY }).kind).toBe('quota_exhausted')
  })

  // The whole cost of the old behaviour: three attempts and their backoff spent against a wall that does not
  // open until midnight, on every turn for the rest of the day.
  it('does not retry a day that cannot recover', () => {
    expect(classifyGeminiFailure({ errorMessage: SPENT_DAY }).retryable).toBe(false)
  })

  it('deflects it, so she answers rather than failing silently', () => {
    expect(classifyGeminiFailure({ errorMessage: SPENT_DAY }).deflect).toBe(true)
  })

  // The control, and the direction that matters more. A per-minute refusal DOES heal, so misreading one as a
  // spent day would deflect a turn that a retry would have rescued — a user-visible regression traded for an
  // invisible one.
  it('leaves a per-minute refusal retryable, which is the mistake that would cost a real turn', () => {
    expect(classifyGeminiFailure({ errorMessage: SPENT_MINUTE })).toEqual({
      kind: 'transient_http',
      retryable: true,
      deflect: false
    })
  })

  // A payload naming both is ambiguous, and the two mistakes are not equal. Keeping today's behaviour costs
  // three refused attempts; the other way costs a turn that would have succeeded.
  it('keeps a payload naming both quotas retryable', () => {
    expect(classifyGeminiFailure({ errorMessage: `${SPENT_DAY} ${SPENT_MINUTE}` }).kind).toBe('transient_http')
  })

  // `retryDelay: "39s"` on a DAILY refusal is Google naming a minute-shaped remedy for a day-shaped problem.
  // Nothing here reads it — `computeBackoff` takes only an attempt number — and this pins that, because
  // "the server tells us when to retry, we should use that" is a reasonable-sounding change that would retry
  // roughly two thousand times into a wall.
  it('ignores the retryDelay the payload advertises', () => {
    expect(computeBackoff(0, 1_000, { jitter: false })).toBe(1_000)
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
