import { logger } from './logger.js'

export interface RateLimiterConfig {
  rpm: number
  rpd: number
}

let sharedRateLimiter: RateLimiter | undefined

/**
 * Token-bucket rate limiter with per-minute (RPM) and per-day (RPD) caps.
 * Tokens refill continuously; daily counter resets at midnight UTC.
 */
export class RateLimiter {
  private tokens: number
  private readonly maxTokens: number
  private readonly refillIntervalMs: number
  private lastRefill: number

  private dailyCount: number
  private readonly maxDaily: number
  private dailyResetDate: string

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.rpm
    this.tokens = config.rpm
    this.refillIntervalMs = (60 * 1000) / config.rpm
    this.lastRefill = Date.now()

    this.maxDaily = config.rpd
    this.dailyCount = 0
    this.dailyResetDate = this.todayString()
  }

  /** Attempt to consume one token; returns false if either limit is exhausted. */
  tryConsume(): boolean {
    this.checkDailyReset()
    this.refillTokens()

    if (this.dailyCount >= this.maxDaily) {
      logger.warn({ dailyCount: this.dailyCount, maxDaily: this.maxDaily }, 'Daily rate limit reached')
      return false
    }

    if (this.tokens < 1) {
      logger.warn({ tokens: this.tokens }, 'RPM rate limit reached')
      return false
    }

    this.tokens -= 1
    this.dailyCount += 1
    return true
  }

  tryConsumeAboveFloor(floor: number): boolean {
    if (this.remainingRpm < floor) return false
    return this.tryConsume()
  }

  get remainingRpm(): number {
    this.refillTokens()
    return Math.floor(this.tokens)
  }

  get remainingRpd(): number {
    this.checkDailyReset()
    return this.maxDaily - this.dailyCount
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const refill = elapsed / this.refillIntervalMs

    if (refill >= 1) {
      this.tokens = Math.min(this.maxTokens, this.tokens + refill)
      this.lastRefill = now
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
