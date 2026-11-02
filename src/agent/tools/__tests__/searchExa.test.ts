import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { startSearchPrefetch } from '../../searchPrefetch.js'
import { exaSearch } from '../search/exa.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.EXA_API_KEY

const NO_SUMMARY = 'No summary available.'

let fetchMock: ReturnType<typeof vi.fn>

function exaReplies(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  })
}

/** The request body exaSearch actually handed to Exa on the most recent call. */
function sentBody(): {
  query: string
  type: string
  numResults: number
  contents: { highlights: boolean }
} {
  return JSON.parse(fetchMock.mock.calls[0][1].body)
}

describe('exaSearch', () => {
  beforeEach(() => {
    process.env.EXA_API_KEY = 'test-key'
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined", leaving exaSearch's `!apiKey` guard truthy
    if (originalKey === undefined) delete process.env.EXA_API_KEY
    else process.env.EXA_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('sends only the query, type, result count and highlights', async () => {
    exaReplies({ results: [] })

    await exaSearch({ query: 'q' })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.exa.ai/search')
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('test-key')
    expect(sentBody()).toEqual({ query: 'q', type: 'auto', numResults: 5, contents: { highlights: true } })
  })

  // Exa's own guidance calls mapping a news task onto `category: news` a mistake, and recency words in the query
  // would break the verbatim rule (issue #19). So the topic is dropped rather than translated.
  it('ignores topic and sends the query verbatim', async () => {
    exaReplies({ results: [] })

    await exaSearch({ query: 'Frieren season 2 release date', topic: 'news' })

    expect(sentBody()).toEqual({
      query: 'Frieren season 2 release date',
      type: 'auto',
      numResults: 5,
      contents: { highlights: true }
    })
  })

  it.each([
    [0, 1],
    [-3, 1],
    [2.5, 2],
    [7, 7],
    [50, 10]
  ])('clamps max_results %s to %s', async (requested, expected) => {
    exaReplies({ results: [] })

    await exaSearch({ query: 'q', max_results: requested })

    expect(sentBody().numResults).toBe(expected)
  })

  it('passes an optional abort signal through', async () => {
    exaReplies({ results: [] })
    const signal = new AbortController().signal

    await exaSearch({ query: 'q', signal })

    expect(fetchMock.mock.calls[0]?.[1].signal).toBe(signal)
  })

  it('maps results, using the first highlight as a clipped snippet', async () => {
    exaReplies({
      results: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', highlights: ['x'.repeat(500), 'second'] },
        { title: 'Polygon', url: 'https://www.polygon.com/b', highlights: ['b'] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.results).toEqual([
      { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', snippet: `${'x'.repeat(200)}...` },
      { title: 'Polygon', url: 'https://www.polygon.com/b', snippet: 'b' }
    ])
    expect(result.resultCount).toBe(2)
    expect(result.succeeded).toBe(true)
  })

  it('fills answer with highlights in rank order, within 1,500 characters', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: ['first fact'] },
        { title: 'B', url: 'https://b.test', highlights: ['x'.repeat(200), 'unused second highlight'] },
        { title: 'C', url: 'https://c.test', highlights: ['third fact'] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    // Every highlight joins in rank order; the whole joined text stays inside the cap.
    expect(result.answer).toBe(`first fact\n${'x'.repeat(200)}\nunused second highlight\nthird fact`)
    expect(result.answer.length).toBeLessThanOrEqual(1500)
  })

  // Exa's highlights hold the answer sentence, and on a real page the fact often sits well past character 200:
  // GPT-5.6's context window lands around character 450. The snippet may clip, the answer must not.
  it('keeps full highlight text in the answer, past the snippet clip', async () => {
    const long = `${'y'.repeat(450)}NEEDLE${'z'.repeat(100)}`
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: [long] }] })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toContain('NEEDLE')
    expect(result.results[0].snippet).not.toContain('NEEDLE')
    expect(result.results[0].snippet).toBe(`${'y'.repeat(200)}...`)
  })

  it('includes every highlight of a result, in rank order', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: ['a1', 'a2'] },
        { title: 'B', url: 'https://b.test', highlights: ['b1', 'b2'] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toBe('a1\na2\nb1\nb2')
  })

  // Exa returns highlights over 1,500 characters; dropping the whole one would leave no answer at all.
  it('clips rather than drops a highlight past the cap', async () => {
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: ['h'.repeat(2000)] }] })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toBe('h'.repeat(1500))
    expect(result.answer).not.toBe(NO_SUMMARY)
  })

  it('drops a highlight that would push the answer past 1,500 characters', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: ['x'.repeat(200)] },
        ...Array.from({ length: 8 }, (_, index) => ({
          title: `T${index}`,
          url: `https://t${index}.test`,
          highlights: ['y'.repeat(200)]
        }))
      ]
    })

    const result = await exaSearch({ query: 'q' })

    // Nine 200-character highlights cannot all fit, so the answer stops at the cap instead of overshooting.
    expect(result.answer.length).toBe(1500)
    expect(result.answer.startsWith('x'.repeat(200))).toBe(true)
  })

  // A result with no title still carries a usable link, and the citation footer needs the URL regardless.
  it('keeps a result with a null title or no highlights', async () => {
    exaReplies({
      results: [
        { title: null, url: 'https://untitled.test/a', highlights: ['a fact'] },
        { title: 'No highlights', url: 'https://empty.test/b' },
        { title: '', url: 'https://whitespace.test/c', highlights: ['c fact'] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.results).toEqual([
      { title: 'https://untitled.test/a', url: 'https://untitled.test/a', snippet: 'a fact' },
      { title: 'No highlights', url: 'https://empty.test/b', snippet: '' },
      // An empty title is no title either.
      { title: 'https://whitespace.test/c', url: 'https://whitespace.test/c', snippet: 'c fact' }
    ])
    expect(result.succeeded).toBe(true)
  })

  it('uses the no-summary text when no result has a highlight, and keeps the results', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test' },
        { title: 'B', url: 'https://b.test', highlights: [] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toBe(NO_SUMMARY)
    expect(result.resultCount).toBe(2)
  })

  it('reports itself unconfigured without calling out when EXA_API_KEY is unset', async () => {
    // biome-ignore lint/performance/noDelete: assigning undefined coerces to "undefined", defeating the guard
    delete process.env.EXA_API_KEY

    await expect(exaSearch({ query: 'anything' })).resolves.toEqual({
      answer: 'Web search is not configured.',
      results: [],
      resultCount: 0,
      succeeded: false
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 402 is Exa's exhausted-credit and exceeded-budget status, so it reads as a quota wall rather than a fault.
  it.each([402, 429])('maps %s to the quota text', async (status) => {
    exaReplies({}, { ok: false, status })

    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({
      answer: 'Search quota exceeded. Try again later.',
      succeeded: false
    })
  })

  it.each([401, 500])('maps %s to the failure text', async (status) => {
    exaReplies({}, { ok: false, status })

    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({
      answer: 'Search request failed.',
      succeeded: false
    })
  })

  it('maps a network error or a body with no results to the failure text', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'))
    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })

    exaReplies({ requestId: 'abc' })
    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })

    exaReplies({ results: null })
    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })
  })

  it('produces a ready prefetch', async () => {
    exaReplies({
      results: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', highlights: ['It premiered in January.'] },
        { title: 'Polygon', url: 'https://www.polygon.com/b', highlights: ['A second fact.'] }
      ]
    })
    const signal = new AbortController().signal

    await expect(startSearchPrefetch({ query: 'q', signal, search: exaSearch })).resolves.toEqual({
      status: 'ready',
      text: 'It premiered in January.\nA second fact.',
      sources: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a' },
        { title: 'Polygon', url: 'https://www.polygon.com/b' }
      ]
    })
  })
})
