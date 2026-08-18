import '../env.js'

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { config } from '../../../src/config.js'
import { closeDb, getDb } from '../../../src/storage/database.js'
import { runCaseSet } from '../toolTrigger.js'
import { loadCaseSet, meetsLiveVerdict, scoreCaseSet } from '../toolTriggerScoring.js'

const TRIALS = 3

/**
 * One entry per case set, each scored on its own. `search-web.jsonl` shipped with #93 and was never loaded
 * — the gate called loadCaseSet() with no argument, so "the live gate passed" meant recall_user alone while
 * reading as though it covered every tool it had a fixture for (#123).
 *
 * Deliberately one `it` per fixture rather than one loop inside a single test: vitest.live.config.ts derives
 * testTimeout from a 36-turn run, so folding three fixtures into one test would silently need three times
 * the budget and abort mid-run with no verdict — the exact trap that config's comment exists to prevent.
 * Per-test also means a failure names the tool that regressed instead of just "the gate".
 */
const CASE_SETS = [
  ['recall_user', 'tests/harness/tool-trigger/recall-user.jsonl'],
  ['search_web', 'tests/harness/tool-trigger/search-web.jsonl'],
  ['remember_user', 'tests/harness/tool-trigger/remember-user.jsonl']
] as const

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

  // These tests deliberately have no vi.mock for @google/adk or @google/genai: real model tool calls are the subject.
  it.each(CASE_SETS)('meets the provisional %s trigger criteria', async (tool, fixturePath) => {
    assertLiveEnvironment()
    closeDb()

    try {
      const { header, cases } = await loadCaseSet(resolve(fixturePath))
      expect(header.tool).toBe(tool)

      const observations = await runCaseSet(header, cases, { trials: TRIALS })
      const report = scoreCaseSet(cases, observations)

      console.log(`Tool-trigger live confusion matrix [${tool}]:`, {
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
      console.log(`Tool-trigger live per-case table [${tool}]:`, report.perCase)

      expect(report.caseCount).toBe(12)
      expect(report.trials).toBe(TRIALS)
      expect(meetsLiveVerdict(report)).toBe(true)
      expect(getDb().prepare('SELECT COUNT(*) AS count FROM extraction_events').get()).toEqual({ count: 0 })
    } finally {
      closeDb()
    }
  })
})
