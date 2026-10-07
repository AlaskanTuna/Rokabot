import { describe, expect, it } from 'vitest'
import { summarizePrefetchMeasurement } from '../prefetchMeasurement.js'

describe('prefetch measurement summary', () => {
  it('aggregates search rates, should-search latency and model calls, and prefetch fires', () => {
    const summary = summarizePrefetchMeasurement(
      [
        {
          id: 'S1',
          shouldFire: true,
          trials: [
            {
              searched: true,
              prefetchUsed: true,
              geminiCalledSearch: false,
              llmCalls: 1,
              generateMs: 10,
              outcome: 'ok'
            },
            {
              searched: true,
              prefetchUsed: false,
              geminiCalledSearch: true,
              llmCalls: 2,
              generateMs: 20,
              outcome: 'ok'
            },
            {
              searched: false,
              prefetchUsed: false,
              geminiCalledSearch: false,
              llmCalls: 2,
              generateMs: 30,
              outcome: 'ok'
            }
          ]
        },
        {
          id: 'N1',
          shouldFire: false,
          trials: [
            {
              searched: true,
              prefetchUsed: false,
              geminiCalledSearch: true,
              llmCalls: 1,
              generateMs: 15,
              outcome: 'ok'
            },
            {
              searched: false,
              prefetchUsed: false,
              geminiCalledSearch: false,
              llmCalls: 1,
              generateMs: 18,
              outcome: 'ok'
            }
          ]
        }
      ],
      2
    )

    expect(summary).toEqual({
      searchRecall: { searched: 2, eligible: 3, rate: 2 / 3 },
      falseSearchRate: { searched: 1, eligible: 2, rate: 0.5 },
      generateMs: { p50: 20, p95: 29 },
      meanLlmCalls: 5 / 3,
      prefetchFireCount: 2
    })
  })
})
