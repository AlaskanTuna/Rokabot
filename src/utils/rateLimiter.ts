import { logger } from './logger.js'

export interface RateLimiterConfig {
  rpm: number
  rpd: number
}

let sharedRateLimiter: RateLimiter | undefined

/**
 * Slots held for one turn, handed back when it turns out not to have needed them.
 *
 * A turn is not a request. ADK is given `runConfig.maxLlmCalls`, so one turn may issue several — measured at
 * ~1.13 on average in production and up to 3.8 in a tool-heavy benchmark run (#167). Reserving the ceiling
 * and releasing the remainder bounds the peak at `rpm` without pricing the average turn at the peak, which
 * is the whole difference between this and simply lowering `rpm`.
 */
export interface CallReservation {
  /** Hand back everything beyond `used`. Idempotent: a turn that both throws and unwinds releases once. */
  release(used: number): void
}

/** The span `rpm` is counted over. Not configurable: it is the unit Google's own quota is expressed in. */
const RPM_WINDOW_MS = 60 * 1000

/**
 * Sliding-window rate limiter with per-minute (RPM) and per-day (RPD) caps. The daily counter resets at
 * midnight UTC.
 *
 * A sliding window rather than the token bucket this used to be, because a bucket whose capacity equals its
 * rate admits `capacity + rate x T` over a window of length T — at T = one minute, twice `rpm`. Simulated
 * against the old implementation, `rpm: 15` admitted 29 requests in the worst rolling minute (#149). It only
 * bit after idle, which is why it never showed up: under sustained load the bucket runs empty and settles at
 * exactly the configured rate. The reachable case was a quiet channel suddenly getting busy.
 *
 * `src/agent/tokenBudget.ts` has the same shape and is NOT being converted, deliberately. It meters a
 * continuous quantity, so an exact window would mean retaining every charge rather than a bounded count, and
 * it was resolved instead by halving its knob so that 2x is the real ceiling (#148). Here the count is
 * `rpm` — fifteen timestamps — so exactness is nearly free and costs no throughput, where halving `rpm` to 7
 * would give up half the request budget. Exact where exactness is cheap; halved where it is not.
 */
export class RateLimiter {
  /** Admission times inside the current window, oldest first. Bounded by `maxPerMinute`. */
  private readonly admitted: number[] = []
  private readonly maxPerMinute: number

  private dailyCount: number
  private readonly maxDaily: number
  private dailyResetDate: string

  constructor(config: RateLimiterConfig) {
    this.maxPerMinute = config.rpm

    this.maxDaily = config.rpd
    this.dailyCount = 0
    this.dailyResetDate = this.todayString()
  }

  /** Attempt to consume one token; returns false if either limit is exhausted. */
  tryConsume(): boolean {
    this.checkDailyReset()
    this.pruneWindow()

    if (this.dailyCount >= this.maxDaily) {
      logger.warn({ dailyCount: this.dailyCount, maxDaily: this.maxDaily }, 'Daily rate limit reached')
      return false
    }

    if (this.admitted.length >= this.maxPerMinute) {
      logger.warn({ inWindow: this.admitted.length, maxPerMinute: this.maxPerMinute }, 'RPM rate limit reached')
      return false
    }

    this.admitted.push(Date.now())
    this.dailyCount += 1
    return true
  }

  /**
   * Whether `count` slots could be taken right now. A peek with no side effect, so a handler can decline
   * early — before spending a Discord round trip — without holding anything across the work that follows.
   * The reservation itself is taken later and is the authoritative one; a turn that loses the race between
   * them is refused there instead.
   */
  canAdmitCalls(count: number): boolean {
    this.checkDailyReset()
    this.pruneWindow()
    return this.dailyCount < this.maxDaily && this.admitted.length + count <= this.maxPerMinute
  }

  /**
   * Take `count` slots for a single turn, or nothing at all. Refuses rather than partially reserving: a turn
   * admitted with fewer slots than it may spend is exactly the overshoot this exists to stop.
   */
  reserveCalls(count: number): CallReservation | undefined {
    this.checkDailyReset()
    this.pruneWindow()

    if (this.dailyCount >= this.maxDaily) {
      logger.warn({ dailyCount: this.dailyCount, maxDaily: this.maxDaily }, 'Daily rate limit reached')
      return undefined
    }

    if (this.admitted.length + count > this.maxPerMinute) {
      logger.warn(
        { inWindow: this.admitted.length, wanted: count, maxPerMinute: this.maxPerMinute },
        'RPM rate limit reached'
      )
      return undefined
    }

    // Every slot carries the same stamp, which is what lets `release` give back this turn's own rather than
    // whichever happen to be newest — two turns reserving in the same millisecond hold indistinguishable
    // slots, so crossing them has no effect on the count or on when they age out.
    const stamp = Date.now()
    for (let slot = 0; slot < count; slot += 1) this.admitted.push(stamp)
    this.dailyCount += 1

    let settled = false
    return {
      release: (used: number) => {
        if (settled) return
        settled = true
        // A non-number means the caller could not say, which happens when a turn throws before reporting.
        // Treated as "spent everything" deliberately rather than by the arithmetic degrading to NaN: holding
        // slots costs a minute, handing back slots that were spent costs the quota.
        const spent = Number.isFinite(used) ? Math.min(Math.max(0, used), count) : count
        // The daily unit is taken per reservation rather than per call, so a turn that made no call at all
        // has to hand it back explicitly — unlike the slots below, it never ages out of a window. Guarded on
        // zero rather than refunded proportionally because the counter is per-turn: any turn that reached the
        // model has spent its unit whatever it spent of its ladder.
        if (spent === 0) this.dailyCount = Math.max(0, this.dailyCount - 1)
        let giveBack = count - spent
        while (giveBack > 0) {
          const index = this.admitted.indexOf(stamp)
          // Gone already: the turn outlived the window, and the slots aged out on their own.
          if (index === -1) return
          this.admitted.splice(index, 1)
          giveBack -= 1
        }
      }
    }
  }

  tryConsumeAboveFloor(floor: number): boolean {
    if (this.remainingRpm < floor) return false
    return this.tryConsume()
  }

  get remainingRpm(): number {
    this.pruneWindow()
    return this.maxPerMinute - this.admitted.length
  }

  get remainingRpd(): number {
    this.checkDailyReset()
    return this.maxDaily - this.dailyCount
  }

  /**
   * Drops admissions that are strictly more than a window old. Strictly, rather than at exactly the window
   * edge, so that no closed 60-second interval can ever contain more than `rpm` of them — releasing on the
   * edge would let the 16th in at exactly t+60s alongside the 15 starting at t.
   */
  private pruneWindow(): void {
    const cutoff = Date.now() - RPM_WINDOW_MS
    while (this.admitted.length > 0 && (this.admitted[0] as number) < cutoff) {
      this.admitted.shift()
    }
  }

  private checkDailyReset(): void {
    const today = this.todayString()
    if (today !== this.dailyResetDate) {
      this.dailyCount = 0
      this.dailyResetDate = today
      logger.info('Daily rate limit counter reset')
    }
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10)
  }
}

export function getSharedRateLimiter(config: RateLimiterConfig): RateLimiter {
  sharedRateLimiter ??= new RateLimiter(config)
  return sharedRateLimiter
}
