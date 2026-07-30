import '../env.js'

import { describe, expect, it } from 'vitest'
import { config } from '../../../src/config.js'
import { closeDb, getDb } from '../../../src/storage/database.js'
import { runCaseSet } from '../toolTrigger.js'
import { loadCaseSet, meetsLiveVerdict, scoreCaseSet } from '../toolTriggerScoring.js'

const TRIALS = 3

function assertLiveEnvironment(): void {
  expect(process.env.GEMINI_API_KEY).toBeTruthy()
  expect(process.env.GEMINI_API_KEY).not.toBe('harness-fake-sentinel')
  expect(process.env.GOOGLE_GENAI_API_KEY).toBeTruthy()
  expect(process.env.ROKABOT_DB_PATH).toBe(':memory:')
  expect(config.memory.claimsBackend).toBe(true)
}

describe('live tool-trigger evaluation', () => {
  it('preflights the isolated live environment', () => {
    assertLiveEnvironment()
  })

  // This test deliberately has no vi.mock for @google/adk or @google/genai: real model tool calls are the subject.
  it('meets the provisional recall_user trigger criteria', async () => {
    assertLiveEnvironment()
    closeDb()

    try {
      const { header, cases } = await loadCaseSet()
      const observations = await runCaseSet(header, cases, { trials: TRIALS })
      const report = scoreCaseSet(cases, observations)

      console.log('Tool-trigger live confusion matrix:', {
        truePositives: report.truePositives,
        falsePositives: report.falsePositives,
        trueNegatives: report.trueNegatives,
        falseNegatives: report.falseNegatives,
        accuracy: report.accuracy,
        precision: report.precision,
        recall: report.recall,
        systematicFailures: report.systematicFailures,
        hour: report.hour
      })
      console.log('Tool-trigger live per-case table:', report.perCase)

      expect(report.caseCount).toBe(12)
      expect(report.trials).toBe(TRIALS)
      expect(meetsLiveVerdict(report)).toBe(true)
      expect(getDb().prepare('SELECT COUNT(*) AS count FROM extraction_events').get()).toEqual({ count: 0 })
    } finally {
      closeDb()
    }
  })
})
