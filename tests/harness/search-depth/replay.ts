/** Offline replay of recorded search provider payloads through the real searchWeb. */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSearchSources } from '../../../src/agent/searchSources.js'
import type { SearchField, SearchResult } from '../../../src/agent/tools/search/types.js'
import { searchWeb } from '../../../src/agent/tools/searchWeb.js'
import { fakeFetch, json } from '../fakeFetch.js'

const SEARCH_DEPTH_DIR = dirname(fileURLToPath(import.meta.url))
export const FACTS_PATH = join(SEARCH_DEPTH_DIR, 'facts.json')
export const EXPECTED_PATH = join(SEARCH_DEPTH_DIR, 'expected-coverage.json')
export const FIXTURES_DIR = join(SEARCH_DEPTH_DIR, 'fixtures')

export interface FixtureExchange {
  provider: string
  method: string
  url: string
  requestBody: unknown
  status: number | null
  responseBody: unknown
}

export interface FixtureToolCall {
  tool: string
  args?: { query?: string; max_results?: number; fields?: SearchField[]; local_query?: string; source?: string }
}

export interface CaseFixture {
  caseId: string
  recordedAt: string
  commit: string | null
  toolCalls: FixtureToolCall[]
  exchanges: FixtureExchange[]
}

export interface Fact {
  text: string
  pattern: string
}

export interface CaseFacts {
  checkedOn: string
  volatile?: boolean
  facts: Fact[]
}

export interface CaseVerdict {
  caseId: string
  volatile: boolean
  covered: string[]
  missing: string[]
  regressions: string[]
  improvements: string[]
}

export function loadFacts(): Record<string, CaseFacts> {
  return JSON.parse(readFileSync(FACTS_PATH, 'utf8')) as Record<string, CaseFacts>
}

export function loadExpected(): Record<string, { covered: string[]; missing: string[] }> {
  if (!existsSync(EXPECTED_PATH)) return {}
  return JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as Record<string, { covered: string[]; missing: string[] }>
}

export function loadFixtures(dir: string = FIXTURES_DIR): CaseFixture[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as CaseFixture)
}

function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string') return body ?? null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

// A replayed searchWeb call rebuilds its provider body from the recorded args, so an exact body match
// would fail on any future body-shape change. Search exchanges match on URL plus the query; page-read
// exchanges (/contents, /extract) match on the requested URL, since their bodies carry no query.
function urlsIn(body: unknown): string[] {
  const parsed = typeof body === 'string' ? parseJsonBody(body) : body
  if (typeof parsed !== 'object' || parsed === null) return []
  const urls: string[] = []
  for (const key of ['urls', 'ids']) {
    const value = (parsed as Record<string, unknown>)[key]
    if (Array.isArray(value)) for (const url of value) if (typeof url === 'string') urls.push(url)
  }
  return urls
}

function exchangeMatches(exchange: FixtureExchange, url: string, body: unknown): boolean {
  if (exchange.url !== url) return false
  const wantUrls = urlsIn(exchange.requestBody)
  const gotUrls = urlsIn(body)
  if (wantUrls.length > 0 || gotUrls.length > 0) return wantUrls.some((want) => gotUrls.includes(want))
  const want = (exchange.requestBody ?? {}) as { query?: unknown }
  const got = (body ?? {}) as { query?: unknown }
  if (typeof want.query === 'string' || typeof got.query === 'string') return want.query === got.query
  return true
}

export function evidenceText(result: SearchResult): string {
  return [result.answer, ...result.results.flatMap((r) => [r.title, r.url, r.snippet])].join('\n')
}

/**
 * Replays one fixture's search_web calls through the real searchWeb with the recorded provider
 * payloads. Needs SEARCH_PROVIDER=exa and a dummy EXA_API_KEY; the caller sets both. Reads run
 * inside a source scope, so the brief cites the stable source ids a live turn would use.
 */
export async function replayFixture(fixture: CaseFixture): Promise<string> {
  const realFetch = globalThis.fetch
  const remaining = [...fixture.exchanges]
  const { fetchImpl } = fakeFetch(({ url, init }) => {
    const index = remaining.findIndex((exchange) => exchangeMatches(exchange, url, parseJsonBody(init.body)))
    if (index === -1) return json({ error: 'no recorded exchange for this request' }, 599)
    const [exchange] = remaining.splice(index, 1)
    return json(exchange.responseBody, exchange.status ?? 599)
  })
  globalThis.fetch = fetchImpl
  try {
    return await withSearchSources(async () => {
      const parts: string[] = []
      for (const call of fixture.toolCalls) {
        if (call.tool !== 'search_web' || typeof call.args?.query !== 'string') continue
        const result = await searchWeb({
          query: call.args.query,
          ...(call.args.max_results !== undefined ? { max_results: call.args.max_results } : {}),
          ...(call.args.fields !== undefined ? { fields: call.args.fields } : {}),
          ...(call.args.local_query !== undefined ? { local_query: call.args.local_query } : {}),
          ...(call.args.source !== undefined ? { source: call.args.source } : {})
        })
        parts.push(evidenceText(result))
      }
      return parts.join('\n')
    })
  } finally {
    globalThis.fetch = realFetch
  }
}

export function matchFacts(evidence: string, facts: Fact[]): { covered: string[]; missing: string[] } {
  const covered: string[] = []
  const missing: string[] = []
  for (const fact of facts) {
    if (new RegExp(fact.pattern, 'i').test(evidence)) covered.push(fact.text)
    else missing.push(fact.text)
  }
  return { covered, missing }
}

// A fact listed as covered that the replay no longer finds is a regression; one listed as missing that
// now shows up is an improvement to promote into expected-coverage.json. Volatile cases never regress.
export function diffCoverage(
  caseId: string,
  actual: { covered: string[]; missing: string[] },
  expected: { covered: string[]; missing: string[] } | undefined,
  volatile: boolean
): CaseVerdict {
  const expectedCovered = new Set(expected?.covered ?? [])
  const expectedMissing = new Set(expected?.missing ?? [])
  const actualCovered = new Set(actual.covered)
  const regressions = volatile ? [] : [...expectedCovered].filter((text) => !actualCovered.has(text))
  const improvements = [...expectedMissing].filter((text) => actualCovered.has(text))
  return { caseId, volatile, covered: actual.covered, missing: actual.missing, regressions, improvements }
}
