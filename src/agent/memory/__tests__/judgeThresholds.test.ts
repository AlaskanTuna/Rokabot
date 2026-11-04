import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {
    memory: {
      judge: 'jev' as string,
      admitThreshold: 0.5,
      verifyThreshold: 0.55,
      summaryThreshold: 0.6,
      modelAdmitThreshold: 0.7,
      modelVerifyThreshold: 0.75,
      modelSummaryThreshold: 0.8
    }
  }
}))

vi.mock('../../../config.js', () => ({ config: mocks.config }))

import { admitThreshold, summaryThreshold, verifyThreshold } from '../judgeThresholds.js'

describe('judge thresholds', () => {
  it.each([
    ['jev', 0.5, 0.55, 0.6],
    ['none', 0.5, 0.55, 0.6],
    ['model', 0.7, 0.75, 0.8]
  ])('uses the %s judge thresholds', (judge, admit, verify, summary) => {
    mocks.config.memory.judge = judge
    expect(admitThreshold()).toBe(admit)
    expect(verifyThreshold()).toBe(verify)
    expect(summaryThreshold()).toBe(summary)
  })
})
