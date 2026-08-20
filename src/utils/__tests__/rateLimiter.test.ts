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

  // Was 'refills RPM tokens after sufficient time', asserting that half a window bought a token back. That
  // was true of the bucket and is the behaviour #149 is about: capacity returning before the window it was
  // spent in has passed. A window releases nothing until an admission ages out of it.
  it('admits nothing more while the oldest admission is still inside the window', () => {
    const limiter = new RateLimiter({ rpm: 2, rpd: 100 })

    limiter.tryConsume()
    limiter.tryConsume()
    vi.advanceTimersByTime(60_000)

    expect(limiter.tryConsume()).toBe(false)
  })

  it('admits again the moment the oldest admission falls out of the window', () => {
    const limiter = new RateLimiter({ rpm: 2, rpd: 100 })

    limiter.tryConsume()
    limiter.tryConsume()
    vi.advanceTimersByTime(60_001)

    expect(limiter.tryConsume()).toBe(true)
  })

  // The issue itself. Time has to pass DURING the burst for this to bite — an instantaneous burst after idle
  // is bounded by capacity alone and the old bucket passed that too, so a test built on one could not fail.
  // Greedy asking across three minutes is what separates 'capacity + rate' from 'rate'.
  it('never admits more than rpm across any rolling minute, however the load arrives', () => {
    const limiter = new RateLimiter({ rpm: 5, rpd: 10_000 })
    const admitted: number[] = []

    for (let step = 0; step <= 3_600; step += 1) {
      if (limiter.tryConsume()) admitted.push(Date.now())
      vi.advanceTimersByTime(50)
    }

    const worstWindow = Math.max(
      // Closed window, deliberately. A half-open one cannot see the off-by-one at the window edge, because
      // an admission released exactly on the edge replaces the one leaving it and the count never rises.
      ...admitted.map((from) => admitted.filter((at) => at >= from && at <= from + 60_000).length)
    )

    expect(worstWindow).toBe(5)
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

  // A turn is not a request: ADK may issue up to `maxLlmCalls` per turn, so admitting on one slot let 15
  // turns become up to 60 requests against a 15 RPM quota (#167). The ceiling is reserved and the remainder
  // handed back, which is the whole difference between this and simply lowering `rpm`.
  it('takes a whole turn worth of slots at once', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })

    limiter.reserveCalls(4)

    expect(limiter.remainingRpm).toBe(6)
  })

  it('hands back the slots the turn did not use', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })

    limiter.reserveCalls(4)?.release(1)

    expect(limiter.remainingRpm).toBe(9)
  })

  it('keeps every slot the turn actually spent', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })

    limiter.reserveCalls(4)?.release(4)

    expect(limiter.remainingRpm).toBe(6)
  })

  // All or nothing. A turn admitted with fewer slots than it may spend is the overshoot this exists to stop.
  it('refuses a turn it cannot fund in full', () => {
    const limiter = new RateLimiter({ rpm: 5, rpd: 100 })

    limiter.reserveCalls(4)

    expect(limiter.reserveCalls(4)).toBeUndefined()
  })

  it('releases once however many times it is asked', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })
    const reservation = limiter.reserveCalls(4)

    reservation?.release(0)
    reservation?.release(0)

    expect(limiter.remainingRpm).toBe(10)
  })

  // An incomplete caller — a turn that threw before it could report — must hold its slots rather than let the
  // arithmetic degrade quietly to a full release.
  it('holds the whole reservation when the caller cannot say what it spent', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })

    limiter.reserveCalls(4)?.release(undefined as unknown as number)

    expect(limiter.remainingRpm).toBe(6)
  })

  it('says no when a whole turn would not fit', () => {
    const limiter = new RateLimiter({ rpm: 5, rpd: 100 })

    limiter.reserveCalls(4)

    expect(limiter.canAdmitCalls(4)).toBe(false)
  })

  it('does not consume when only asked whether it could', () => {
    const limiter = new RateLimiter({ rpm: 10, rpd: 100 })

    limiter.canAdmitCalls(4)

    expect(limiter.remainingRpm).toBe(10)
  })

  // The release earning its keep, and the exact figure rather than the one I first guessed. A turn is only
  // admitted when a WHOLE reservation fits, so single-call turns settle at `rpm - maxLlmCalls + 1` a minute,
  // not `rpm`: at 12 and 4 that is 9. Keeping the unused slots would give 3. The headroom is the standing
  // cost of bounding the peak, and it is a fifth of the budget at production's 15 and 4.
  it('admits three times the turns that keeping the unused slots would', () => {
    const limiter = new RateLimiter({ rpm: 12, rpd: 100 })
    let admitted = 0

    for (let turn = 0; turn < 12; turn += 1) {
      const reservation = limiter.reserveCalls(4)
      if (!reservation) break
      admitted += 1
      reservation.release(1)
    }

    expect(admitted).toBe(9)
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
