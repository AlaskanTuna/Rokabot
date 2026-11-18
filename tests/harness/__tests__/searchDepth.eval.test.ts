import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/searchSettings.js', () => ({
  searchIsAvailable: () => true,
  searchProviderSetting: () => 'exa'
}))

import {
  diffCoverage,
  loadExpected,
  loadFacts,
  loadFixtures,
  matchFacts,
  replayFixture
} from '../search-depth/replay.js'

// The replayed provider calls never reach the network; the backend only needs a key present.
process.env.EXA_API_KEY = 'search-depth-dummy-key'

describe('search depth replay gate (issue #522)', () => {
  it('keeps facts.json and expected-coverage.json in sync', () => {
    const facts = loadFacts()
    const expected = loadExpected()
    expect(Object.keys(facts).length).toBeGreaterThan(0)
    for (const [caseId, caseFacts] of Object.entries(facts)) {
      const texts = caseFacts.facts.map((fact) => {
        expect(() => new RegExp(fact.pattern, 'i')).not.toThrow()
        return fact.text
      })
      const entry = expected[caseId] ?? { covered: [], missing: [] }
      expect(new Set([...entry.covered, ...entry.missing])).toEqual(new Set(texts))
      expect(caseFacts.volatile ?? false).toBe(caseId.startsWith('N'))
    }
  })

  it('shows no coverage regressions against expected-coverage.json', async () => {
    const facts = loadFacts()
    const expected = loadExpected()
    const fixtures = loadFixtures()
    if (fixtures.length === 0) {
      console.log('search-depth replay: no fixtures recorded yet, nothing to check')
      return
    }
    const regressions: string[] = []
    const improvements: string[] = []
    for (const fixture of fixtures) {
      const caseFacts = facts[fixture.caseId]
      if (!caseFacts) continue
      const evidence = await replayFixture(fixture)
      const verdict = diffCoverage(
        fixture.caseId,
        matchFacts(evidence, caseFacts.facts),
        expected[fixture.caseId],
        caseFacts.volatile ?? false
      )
      regressions.push(...verdict.regressions.map((text) => `${fixture.caseId}: ${text}`))
      improvements.push(...verdict.improvements.map((text) => `${fixture.caseId}: ${text}`))
    }
    // Improvements print without failing: promote them deliberately with updateCoverage.ts.
    if (improvements.length > 0) console.log(`search-depth replay improvements to promote:\n${improvements.join('\n')}`)
    expect(regressions).toEqual([])
  })
})
