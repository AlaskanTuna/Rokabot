import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { readSearchPrefetchRows, renderPrefetchShadowReport, scorePrefetchShadow } from '../searchPrefetchShadow.js'
import type { SearchPrefetchRow } from '../searchPrefetchShadow.js'

const databases: Database.Database[] = []

function makeDatabase(): Database.Database {
  const database = new Database(':memory:')
  databases.push(database)
  return database
}

function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE jev_events (
      kind TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE response_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      tools_used TEXT,
      created_at INTEGER NOT NULL
    );
  `)
}

const row = (overrides: Partial<SearchPrefetchRow> = {}): SearchPrefetchRow => ({
  needsLookup: 0.9,
  prefetchMode: 'on',
  threshold: 0.7,
  prefetchStatus: 'ready',
  toolCalled: false,
  ...overrides
})

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('scorePrefetchShadow', () => {
  it('counts what it would have prefetched next to what Gemini searched itself', () => {
    const report = scorePrefetchShadow([
      row({ needsLookup: 0.9, toolCalled: true }),
      row({ needsLookup: 0.9, toolCalled: true }),
      row({ needsLookup: 0.9, toolCalled: false }),
      row({ needsLookup: 0.2, prefetchStatus: 'below_threshold', toolCalled: false }),
      row({ needsLookup: null, prefetchStatus: 'no_noul', toolCalled: false })
    ])

    expect(report.totalTurns).toBe(5)
    expect(report.missingNoul).toBe(1)
    expect(report.wouldHaveSearched).toBe(3)
    expect(report.statusCounts.ready).toBe(3)
  })

  it('reports a cutoff as unavailable rather than as zero agreement when nothing selects', () => {
    const report = scorePrefetchShadow([row({ needsLookup: 0.2, toolCalled: false })])

    expect(report.precisionByThreshold.find((entry) => entry.minimumNoul === 0.95)?.agreement).toBeNull()
  })

  it('treats a pre-feature row with no needs_lookup key as missing, never as a throw', () => {
    const report = scorePrefetchShadow([
      { needsLookup: null, prefetchMode: 'on', threshold: 0.7, prefetchStatus: null, toolCalled: true }
    ])

    expect(report.judgedTurns).toBe(0)
    expect(report.missingNoul).toBe(1)
  })

  it('renders aggregates without any channel or user identifier', () => {
    const rendered = renderPrefetchShadowReport(scorePrefetchShadow([row()]))

    expect(rendered).toContain('wouldHaveSearched')
    expect(rendered).not.toMatch(/channel-1|user-1|\[/)
  })
})

describe('readSearchPrefetchRows', () => {
  it('matches each judgment to the nearest later response in the same channel', () => {
    const database = makeDatabase()
    createTables(database)
    const addTurn = database.prepare('INSERT INTO jev_events VALUES (?, ?, ?, ?, ?)')
    const addResponse = database.prepare(
      'INSERT INTO response_events (channel_id, tools_used, created_at) VALUES (?, ?, ?)'
    )

    addTurn.run(
      'turn',
      'channel-1',
      JSON.stringify({ prefetch: 'shadow' }),
      JSON.stringify({ needsLookup: 0.9, prefetchStatus: 'shadow_would_fire' }),
      10
    )
    addTurn.run(
      'turn',
      'channel-1',
      JSON.stringify({ prefetch: 'off' }),
      JSON.stringify({ needsLookup: 0.2, prefetchStatus: 'off' }),
      30
    )
    addResponse.run('channel-1', JSON.stringify(['search_web']), 20)
    addResponse.run('channel-1', JSON.stringify(['roll_dice']), 40)
    addResponse.run('channel-2', JSON.stringify(['search_web']), 35)

    expect(readSearchPrefetchRows(database, 0)).toEqual([
      {
        needsLookup: 0.9,
        prefetchMode: 'shadow',
        threshold: 0.7,
        prefetchStatus: 'shadow_would_fire',
        toolCalled: true
      },
      {
        needsLookup: 0.2,
        prefetchMode: 'off',
        threshold: 0.7,
        prefetchStatus: 'off',
        toolCalled: false
      }
    ])
  })

  it('returns an empty window when an older database lacks the response table', () => {
    const database = makeDatabase()
    database.exec(`
      CREATE TABLE jev_events (
        kind TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)

    expect(readSearchPrefetchRows(database, 0)).toEqual([])
  })

  it('parses malformed and pre-feature JSON as unknown values', () => {
    const database = makeDatabase()
    createTables(database)
    database.prepare('INSERT INTO jev_events VALUES (?, ?, ?, ?, ?)').run('turn', 'channel-1', '{', '{', 10)

    expect(readSearchPrefetchRows(database, 0)).toEqual([
      {
        needsLookup: null,
        prefetchMode: 'off',
        threshold: 0.7,
        prefetchStatus: null,
        toolCalled: false
      }
    ])
  })
})
