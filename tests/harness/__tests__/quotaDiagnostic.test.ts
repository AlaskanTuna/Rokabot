import { describe, expect, it } from 'vitest'

import {
  BACKEND_OUT_OF_CAPACITY,
  KEY_IS_LIVE,
  OUTPACING_THE_CAP,
  SPENT_FOR_THE_DAY,
  describeQuotaFailure
} from '../quotaDiagnostic.js'

// Verbatim from a 2026-08-20 gate run. Both situations arrive as `429 RESOURCE_EXHAUSTED` with identical
// `kind`, so the quota ID is the only thing in the payload that separates "come back tomorrow" from "slow
// down" — which is the whole reason this module exists.
const SPENT_KEY_429 = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '500' }]
  }
})
const THROTTLED_429 = JSON.stringify({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    details: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '15' }]
  }
})

describe('describeQuotaFailure', () => {
  it('names a spent day as spent, so the remedy is another key rather than another look at the fixture', () => {
    expect(describeQuotaFailure(SPENT_KEY_429)).toBe(SPENT_FOR_THE_DAY)
  })

  it('names a per-minute refusal as pacing, so the remedy is the run rather than the fixture', () => {
    expect(describeQuotaFailure(THROTTLED_429)).toBe(OUTPACING_THE_CAP)
  })

  // Verbatim from the 2026-08-21 03:20 runs. Reaches the diagnostic because geminiReliability's transient
  // pattern matches 500/503/504 alongside 429, and the operator's remedy is neither of the quota ones.
  it("names a capacity outage as Google's, so nobody looks for a fault that is not theirs", () => {
    const outage = JSON.stringify({
      error: {
        code: 503,
        message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
        status: 'UNAVAILABLE'
      }
    })

    expect(describeQuotaFailure(outage)).toBe(BACKEND_OUT_OF_CAPACITY)
  })

  // Order guard. A quota refusal must never be read as an outage: both are transient_http, and the remedies
  // point opposite ways — one says run it again later, the other says the run is spending too fast.
  it('still reads a quota refusal as a quota refusal, not as an outage', () => {
    expect(describeQuotaFailure(THROTTLED_429)).toBe(OUTPACING_THE_CAP)
    expect(describeQuotaFailure(SPENT_KEY_429)).toBe(SPENT_FOR_THE_DAY)
  })

  // The control. Both branches above match on a substring, and a classifier that reached one of them from
  // any 429 would be back to the ambiguity it was written to remove.
  it('refuses to bucket a 429 that names no quota', () => {
    const anonymous = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })

    expect(describeQuotaFailure(anonymous)).not.toBe(SPENT_FOR_THE_DAY)
    expect(describeQuotaFailure(anonymous)).not.toBe(OUTPACING_THE_CAP)
    expect(describeQuotaFailure(anonymous)).toContain('other than a quota error')
  })

  it.each([
    ['an Error instance', new Error('quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier')],
    ['a plain object', { detail: { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }],
    ['a bare string', 'GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded']
  ])('reads the quota out of %s, because the SDK does not promise one shape', (_label, thrown) => {
    expect(describeQuotaFailure(thrown)).toBe(SPENT_FOR_THE_DAY)
  })

  it('reports an unrelated failure verbatim rather than guessing at it', () => {
    expect(describeQuotaFailure(new Error('socket hang up'))).toContain('socket hang up')
  })

  // Long payloads are truncated; the truncation must not swallow the reason.
  it('keeps an unrelated failure readable when the payload is enormous', () => {
    const noisy = new Error(`ECONNRESET ${'x'.repeat(5_000)}`)

    const described = describeQuotaFailure(noisy)

    expect(described).toContain('ECONNRESET')
    expect(described.length).toBeLessThan(400)
  })

  // Written out rather than asserted by shape. This string is what a human reads at 3am when a gate has
  // aborted, and the thing it must never do is conclude the fixture was at fault when a per-minute refusal
  // — which recovers in seconds, so a later probe cannot rule it out — is still on the table.
  it('does not let a successful probe exonerate the run', () => {
    expect(KEY_IS_LIVE).toContain('not spent for the day')
    expect(KEY_IS_LIVE).toContain('before blaming the fixture')
  })
})
