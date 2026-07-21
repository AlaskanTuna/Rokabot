import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import { config } from '../../config.js'
import { RateLimiter, getSharedRateLimiter } from '../rateLimiter.js'

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

  it('preserves RPM tokens when the floor is not met', () => {
    const limiter = new RateLimiter({ rpm: 4, rpd: 100 })

    limiter.tryConsume()
    limiter.tryConsume()

    expect(limiter.tryConsumeAboveFloor(3)).toBe(false)
    expect(limiter.remainingRpm).toBe(2)
  })

  it('consumes one RPM token when the floor is met', () => {
    const limiter = new RateLimiter({ rpm: 3, rpd: 100 })

    expect(limiter.tryConsumeAboveFloor(3)).toBe(true)
    expect(limiter.remainingRpm).toBe(2)
  })

  it('does not consume once interleaved retry loops fall below their RPM floor', () => {
    const limiter = new RateLimiter({ rpm: 6, rpd: 100 })
    const retryLoops = [() => limiter.tryConsumeAboveFloor(3), () => limiter.tryConsumeAboveFloor(3)]

    for (let attempt = 0; attempt < 4; attempt++) {
      for (const tryRetry of retryLoops) {
        const remainingBefore = limiter.remainingRpm
        const consumed = tryRetry()

        expect(consumed).toBe(remainingBefore >= 3)
        expect(limiter.remainingRpm).toBe(consumed ? remainingBefore - 1 : remainingBefore)
      }
    }

    expect(limiter.remainingRpm).toBe(2)
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

  it('returns a shared limiter whose consumption is observable across calls', () => {
    const limiter = getSharedRateLimiter(config.rateLimit)

    expect(getSharedRateLimiter(config.rateLimit)).toBe(limiter)
    expect(limiter.tryConsume()).toBe(true)
    expect(getSharedRateLimiter(config.rateLimit).remainingRpm).toBe(14)
  })
})
