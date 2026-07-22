import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'
import { evaluateMemoryShadow, loadReplaySet } from '../memoryShadow.js'

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

afterEach(() => {
  mocks.generateContent.mockClear()
})

describe('memory shadow replay evaluation', () => {
  it('meets the promotion exit criteria on the labelled replay set', async () => {
    const scenarios = await loadReplaySet()
    const report = await evaluateMemoryShadow(scenarios)

    expect(report.networkCalls).toBe(0)
    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(report.harnessTurns).toBe(40)
    expect(report.visibleClaimsBackend).toBe(false)
    expect(report.crossGuildResults).toBe(0)
    expect(report.p95LatencyMs).toBeLessThan(10)
    expect(report.maxSelectedTokens).toBeLessThanOrEqual(report.retrievalTokenBudget)
    expect(report.speakerAnchorsDropped).toBe(0)
    expect(report.top10Recall).toBeGreaterThanOrEqual(0.9)
    expect(report.promptReduction).toBeGreaterThan(0.3)
    expect(report.telemetryContainsFactValues).toBe(false)

    console.log(
      `Memory shadow exit criteria: p95=${report.p95LatencyMs.toFixed(3)}ms recall=${(report.top10Recall * 100).toFixed(1)}% prompt_reduction=${(report.promptReduction * 100).toFixed(1)}%`
    )
  })

  it('fails the recall gate when the labels deliberately disagree with retrieval', async () => {
    const scenarios = await loadReplaySet()
    const wrongLabels = scenarios.map((scenario) => ({ ...scenario, expectedTopK: ['deliberately-wrong-label'] }))
    const report = await evaluateMemoryShadow(wrongLabels, { runHarness: false })

    expect(report.top10Recall).toBeLessThan(0.9)
  })
})
