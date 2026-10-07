export interface PrefetchMeasurementTrial {
  searched: boolean
  prefetchUsed: boolean
  geminiCalledSearch: boolean
  llmCalls: number
  generateMs: number
  outcome: string
}

export interface PrefetchMeasurementCase {
  id: string
  shouldFire: boolean
  trials: PrefetchMeasurementTrial[]
}

export interface PrefetchMeasurementSummary {
  searchRecall: { searched: number; eligible: number; rate: number | null }
  falseSearchRate: { searched: number; eligible: number; rate: number | null }
  generateMs: { p50: number | null; p95: number | null }
  meanLlmCalls: number | null
  prefetchFireCount: number
}

function percentile(values: number[], probability: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * probability
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const fraction = index - lowerIndex
  const value = sorted[lowerIndex]! + (sorted[upperIndex]! - sorted[lowerIndex]!) * fraction
  return Math.round(value * 10) / 10
}

export function summarizePrefetchMeasurement(
  cases: PrefetchMeasurementCase[],
  prefetchFireCount: number
): PrefetchMeasurementSummary {
  const shouldSearch = cases.filter((testCase) => testCase.shouldFire).flatMap(({ trials }) => trials)
  const shouldNotSearch = cases.filter((testCase) => !testCase.shouldFire).flatMap(({ trials }) => trials)
  const searchRecallCount = shouldSearch.filter(({ searched }) => searched).length
  const falseSearchCount = shouldNotSearch.filter(({ searched }) => searched).length

  return {
    searchRecall: {
      searched: searchRecallCount,
      eligible: shouldSearch.length,
      rate: shouldSearch.length === 0 ? null : searchRecallCount / shouldSearch.length
    },
    falseSearchRate: {
      searched: falseSearchCount,
      eligible: shouldNotSearch.length,
      rate: shouldNotSearch.length === 0 ? null : falseSearchCount / shouldNotSearch.length
    },
    generateMs: {
      p50: percentile(
        shouldSearch.map(({ generateMs }) => generateMs),
        0.5
      ),
      p95: percentile(
        shouldSearch.map(({ generateMs }) => generateMs),
        0.95
      )
    },
    meanLlmCalls:
      shouldSearch.length === 0
        ? null
        : shouldSearch.reduce((total, { llmCalls }) => total + llmCalls, 0) / shouldSearch.length,
    prefetchFireCount
  }
}
