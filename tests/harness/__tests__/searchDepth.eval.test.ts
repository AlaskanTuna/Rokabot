import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/searchSettings.js', () => ({
  searchIsAvailable: () => true,
  searchProviderSetting: () => 'exa'
}))

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }))

// Page reads check the address before fetching; the replay fakes fetch, so DNS resolves to a public
// address the same way readPages.test.ts does and never touches a real resolver.
vi.mock('node:dns/promises', () => ({ lookup: dnsMocks.lookup }))
dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

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

describe('search depth brief (issue #534)', () => {
  it('covers the L1 menu through a cited brief with the live gate fields', async () => {
    const fixture = loadFixtures().find((f) => f.caseId === 'L1')
    expect(fixture).toBeDefined()
    const query = fixture?.toolCalls.find((call) => call.tool === 'search_web')?.args?.query ?? ''
    const evidence = await replayFixture({
      ...(fixture as NonNullable<typeof fixture>),
      toolCalls: [
        {
          tool: 'search_web',
          args: {
            query,
            max_results: 5,
            fields: [
              { kind: 'list', subject: 'menu items' },
              { kind: 'price', subject: 'drinks' },
              { kind: 'price', subject: 'food' }
            ]
          }
        }
      ]
    })
    expect(evidence).toMatch(/hotcakes?/i)
    expect(evidence).toMatch(/hot coffee|blended coffee|almond au lait|latte|iced cocoa/i)
    expect(evidence).toMatch(/sandwich|curry toast|cheese toast|pudding/i)
    expect(evidence).toMatch(/\[s\d+\]/)
  })

  it('covers the L1 menu with the split drink and food fields', async () => {
    const fixture = loadFixtures().find((f) => f.caseId === 'L1')
    expect(fixture).toBeDefined()
    const query = fixture?.toolCalls.find((call) => call.tool === 'search_web')?.args?.query ?? ''
    const evidence = await replayFixture({
      ...(fixture as NonNullable<typeof fixture>),
      toolCalls: [
        {
          tool: 'search_web',
          args: {
            query,
            max_results: 5,
            fields: [
              { kind: 'list', subject: 'coffee drinks' },
              { kind: 'list', subject: 'other drinks' },
              { kind: 'list', subject: 'food items' },
              { kind: 'price', subject: 'drinks' }
            ]
          }
        }
      ]
    })
    expect(evidence).toMatch(/hotcakes?/i)
    expect(evidence).toMatch(/hot coffee|blended coffee|almond au lait|latte|iced cocoa/i)
    expect(evidence).toMatch(/sandwich|curry toast|cheese toast|pudding/i)
    expect(evidence).toMatch(/\[s\d+\]/)
  })

  it('covers the L1 menu with the short menu and drinks price fields', async () => {
    const fixture = loadFixtures().find((f) => f.caseId === 'L1')
    expect(fixture).toBeDefined()
    const query = fixture?.toolCalls.find((call) => call.tool === 'search_web')?.args?.query ?? ''
    const evidence = await replayFixture({
      ...(fixture as NonNullable<typeof fixture>),
      toolCalls: [
        {
          tool: 'search_web',
          args: {
            query,
            max_results: 5,
            fields: [
              { kind: 'list', subject: 'menu' },
              { kind: 'price', subject: 'drinks' }
            ]
          }
        }
      ]
    })
    expect(evidence).toMatch(/hotcakes?/i)
    expect(evidence).toMatch(/hot coffee|blended coffee|almond au lait|latte|iced cocoa/i)
    expect(evidence).toMatch(/sandwich|curry toast|cheese toast|pudding/i)
    expect(evidence).toMatch(/\[s\d+\]/)
  })

  it('reads the menu page for the thin L1 case, with no local query', async () => {
    const fixture = loadFixtures().find((f) => f.caseId === 'L1-thin')
    expect(fixture).toBeDefined()
    const query = fixture?.toolCalls.find((call) => call.tool === 'search_web')?.args?.query ?? ''
    // The recorded args still carry the old string fields; replay with their typed equivalents instead.
    const evidence = await replayFixture({
      ...(fixture as NonNullable<typeof fixture>),
      toolCalls: [
        {
          tool: 'search_web',
          args: {
            query,
            max_results: 5,
            fields: [
              { kind: 'list', subject: 'menu items' },
              { kind: 'price', subject: 'drinks' },
              { kind: 'price', subject: 'food' }
            ]
          }
        }
      ]
    })
    expect(evidence).toMatch(/ブレンドコーヒー|アイスコーヒー/)
    expect(evidence).toMatch(/タマゴサンド|ホットケーキ/)
    expect(evidence).toMatch(/\[s\d+\]/)
  })
})
