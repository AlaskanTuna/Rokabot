import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { config } from '../../config.js'
import { TokenBucket, __resetTokenBudgetForTest, remainingTokensThisMinute, tokenBucketFor } from '../tokenBudget.js'

describe('per-model token buckets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetTokenBudgetForTest()
  })

  it('is the main model bucket that the attachment guard reads', () => {
    tokenBucketFor(config.llm.main)?.charge(30_000)

    expect(remainingTokensThisMinute()).toBe(config.gemini.maxTokensPerMinute - 30_000)
  })

  it('keeps one bucket per provider and model', () => {
    const limits = { tpm: 10_000 }
    const first = tokenBucketFor({ provider: 'anthropic', model: 'claude-test', limits })

    expect(tokenBucketFor({ provider: 'anthropic', model: 'claude-test', limits })).toBe(first)
    expect(tokenBucketFor({ provider: 'anthropic', model: 'other', limits })).not.toBe(first)
  })

  it('meters nothing for a model whose entry sets no tpm', () => {
    expect(tokenBucketFor({ provider: 'anthropic', model: 'claude-test' })).toBeNull()
  })

  it('refunds an over-estimate without going below empty', () => {
    const bucket = new TokenBucket(100_000)

    bucket.charge(10_000)
    bucket.refund(25_000)

    expect(bucket.remaining()).toBe(100_000)
  })

  it('refunds against what has already drained', () => {
    const bucket = new TokenBucket(60_000)

    bucket.charge(60_000)
    vi.advanceTimersByTime(30_000)
    bucket.refund(10_000)

    expect(bucket.remaining()).toBe(40_000)
  })
})
