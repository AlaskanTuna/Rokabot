import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import { RateLimiter } from '../rateLimiter.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to RPM limit', () => {
    const limiter = new RateLimiter({ rpm: 3, rpd: 100 })

    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(true)
  })

  it('rejects requests after RPM exhaustion', () => {
    const limiter = new RateLimiter({ rpm: 2, rpd: 100 })

    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(false)
  })

  it('refills RPM tokens after sufficient time', () => {
    const limiter = new RateLimiter({ rpm: 2, rpd: 100 })

    limiter.tryConsume()
    limiter.tryConsume()
    expect(limiter.tryConsume()).toBe(false)

    // refillIntervalMs = 60000 / 2 = 30000ms per token
    vi.advanceTimersByTime(30_000)

    expect(limiter.tryConsume()).toBe(true)
  })

  it('reports remainingRpm correctly', () => {
    const limiter = new RateLimiter({ rpm: 5, rpd: 100 })

    expect(limiter.remainingRpm).toBe(5)
    limiter.tryConsume()
    expect(limiter.remainingRpm).toBe(4)
  })

  it('rejects requests after RPD exhaustion', () => {
    const limiter = new RateLimiter({ rpm: 100, rpd: 3 })

    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.tryConsume()).toBe(false)
  })

  it('reports remainingRpd correctly', () => {
    const limiter = new RateLimiter({ rpm: 100, rpd: 10 })

    expect(limiter.remainingRpd).toBe(10)
    limiter.tryConsume()
    limiter.tryConsume()
    expect(limiter.remainingRpd).toBe(8)
  })

  it('resets daily count at midnight (date change)', () => {
    const limiter = new RateLimiter({ rpm: 100, rpd: 2 })

    limiter.tryConsume()
    limiter.tryConsume()
    expect(limiter.tryConsume()).toBe(false)

    // Advance by 24 hours to trigger date change
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    expect(limiter.tryConsume()).toBe(true)
    expect(limiter.remainingRpd).toBe(1)
  })
})
