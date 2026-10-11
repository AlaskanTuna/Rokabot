import { afterEach, describe, expect, it, vi } from 'vitest'
import { grantOrThrow, markBillingExhausted, requestTokenEstimate, reserveCall, startCall } from '../budget.js'

const input = { provider: 'anthropic', model: 'claude-haiku-5-5', workload: 'reply', estTokens: 100 } as const
const usage = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  workload: 'reply',
  inputTokens: 1,
  outputTokens: 1
} as const

function denialOf(denied: 'rpm' | 'rpd' | 'tpm' | 'monthly'): unknown {
  try {
    grantOrThrow('anthropic', { denied })
  } catch (error) {
    return error
  }
  return undefined
}

describe('budget stub', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('always grants, and the grant accepts the call usage on release', () => {
    const reservation = reserveCall(input)

    expect('denied' in reservation).toBe(false)
    const grant = grantOrThrow('anthropic', reservation)
    expect(() => grant.release(usage)).not.toThrow()
  })

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

  it('starts a call whose grant releases with usage or without', async () => {
    const grant = await startCall(input)

    expect(() => grant.release(usage)).not.toThrow()
    expect(() => grant.release()).not.toThrow()
  })

  it('stays a no-op until 1D: marking billing exhausted does not stop a later call', async () => {
    expect(() => markBillingExhausted('anthropic')).not.toThrow()

    await expect(startCall(input)).resolves.toHaveProperty('release')
  })

  it('estimates tokens without counting inline media bytes', () => {
    const withImage = requestTokenEstimate({
      text: 'hello there',
      inlineData: { mimeType: 'image/png', data: 'A'.repeat(40_000) }
    })

    expect(withImage).toBeLessThan(50)
  })
})
