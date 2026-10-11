import { describe, expect, it, vi } from 'vitest'

vi.mock('../profiles.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../profiles.js')>()),
  profileFor: (_provider: string, model: string) => {
    const prices: Record<string, { input: number; output: number; cachedInput?: number; cacheWrite?: number }> = {
      priced: { input: 2, output: 10, cachedInput: 0.2 },
      uncached: { input: 2, output: 10 },
      written: { input: 2, output: 10, cacheWrite: 3 }
    }
    return prices[model] ? { price: prices[model] } : undefined
  }
}))

import { type CallUsage, estimateCostUsd } from '../usage.js'

function call(fields: Partial<CallUsage>): CallUsage {
  return { provider: 'anthropic', model: 'priced', workload: 'reply', inputTokens: 0, outputTokens: 0, ...fields }
}

describe('estimateCostUsd', () => {
  it('prices input and output per million tokens', () => {
    expect(estimateCostUsd(call({ inputTokens: 1_000_000, outputTokens: 500_000 }))).toBeCloseTo(7)
  })

  it('prices reasoning tokens at the output rate', () => {
    expect(estimateCostUsd(call({ reasoningTokens: 1_000_000 }))).toBeCloseTo(10)
  })

  it('prices cache reads at the cached-input rate', () => {
    expect(estimateCostUsd(call({ cacheReadTokens: 1_000_000 }))).toBeCloseTo(0.2)
  })

  it('prices cache reads at the input rate when the profile has no cached rate', () => {
    expect(estimateCostUsd(call({ model: 'uncached', cacheReadTokens: 1_000_000 }))).toBeCloseTo(2)
  })

  it('prices cache writes at 1.25 times the input rate', () => {
    expect(estimateCostUsd(call({ cacheWriteTokens: 1_000_000 }))).toBeCloseTo(2.5)
  })

  it("prices cache writes at the profile's own write rate when it has one", () => {
    expect(estimateCostUsd(call({ model: 'written', cacheWriteTokens: 1_000_000 }))).toBeCloseTo(3)
  })

  it('costs nothing for a model without a profile', () => {
    expect(estimateCostUsd(call({ model: 'unknown', inputTokens: 1_000_000 }))).toBe(0)
  })
})
