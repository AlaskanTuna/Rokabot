import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {
    memory: {
      judge: 'jev' as string,
      admitThreshold: 0.5,
      verifyThreshold: 0.55,
      modelAdmitThreshold: 0.7,
      modelVerifyThreshold: 0.75
    }
  }
}))

vi.mock('../../../config.js', () => ({ config: mocks.config }))

import { admitThreshold, verifyThreshold } from '../judgeThresholds.js'

describe('judge thresholds', () => {
  it.each([
    ['jev', 0.5, 0.55],
    ['none', 0.5, 0.55],
    ['model', 0.7, 0.75]
  ])('uses the %s judge thresholds', (judge, admit, verify) => {
    mocks.config.memory.judge = judge
    expect(admitThreshold()).toBe(admit)
    expect(verifyThreshold()).toBe(verify)
  })
})
