import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import { __resetExpressionState, getExpressionUrl } from '../expressions.js'

describe('getExpressionUrl', () => {
  beforeEach(() => {
    __resetExpressionState()
  })

  it('uses an injected RNG for deterministic selection', () => {
    expect(getExpressionUrl('playful', { rng: () => 0.9 })).toBe(
      'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/cheerful.webp'
    )
  })

  it('does not repeat the previous expression from a multi-expression pool', () => {
    const rng = () => 0

    expect(getExpressionUrl('playful', { rng })).not.toBe(getExpressionUrl('playful', { rng }))
  })

  it('falls back to the base expression for an unknown tone', () => {
    expect(getExpressionUrl('unknown' as never)).toBe(
      'https://pub-86e06f51812b4cd9a7562bf00fd8739c.r2.dev/expressions/v1/base.webp'
    )
  })

  it('resets remembered expression picks', () => {
    const rng = () => 0

    const first = getExpressionUrl('playful', { rng })
    getExpressionUrl('playful', { rng })
    __resetExpressionState()

    expect(getExpressionUrl('playful', { rng })).toBe(first)
  })
})
