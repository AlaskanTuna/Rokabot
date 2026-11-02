import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { logger } from '../../../utils/logger.js'
import { SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import { startSearchPrefetch } from '../../searchPrefetch.js'
import { exaSearch } from '../search/exa.js'
import { clipSnippet } from '../search/types.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.EXA_API_KEY

const NO_SUMMARY = 'No summary available.'
const LABEL = SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL

/** The cap covers the page text, not the label, so the label comes off before measuring. */
function labelStripped(answer: string): string {
  return answer.startsWith(`${LABEL}\n`) ? answer.slice(LABEL.length + 1) : answer
}

/** True when a string holds half a surrogate pair, which the model APIs reject. */
function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
}

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
    expect(result.answer).toBe(`${LABEL}\nfirst fact\n${'x'.repeat(200)}\nunused second highlight\nthird fact`)
    expect(labelStripped(result.answer).length).toBeLessThanOrEqual(1500)
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

    expect(result.answer).toBe(`${LABEL}\na1\na2\nb1\nb2`)
  })

  // Exa returns highlights over 1,500 characters; dropping the whole one would leave no answer at all.
  it('clips rather than drops a highlight past the cap', async () => {
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: ['h'.repeat(2000)] }] })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toBe(`${LABEL}\n${'h'.repeat(1500)}`)
    expect(result.answer).not.toBe(NO_SUMMARY)
    expect(labelStripped(result.answer).length).toBeLessThanOrEqual(1500)
  })

  // A Japanese page often carries one early space and no other, so backing off to the last whitespace threw away
  // nearly the whole share. The cut only backs off when that whitespace sits near the end of the allowance.
  it('keeps a long run with no spaces instead of backing off to an early one', async () => {
    exaReplies({
      results: [{ title: 'A', url: 'https://a.test', highlights: [`葬送のフリーレン 第2期 ${'あ'.repeat(2000)}`] }]
    })

    const result = await exaSearch({ query: 'q' })

    expect(labelStripped(result.answer).length).toBeGreaterThan(1400)
  })

  it('ends on a whole word when a space is near the cut', async () => {
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: ['word '.repeat(400)] }] })

    const result = await exaSearch({ query: 'q' })

    const pageText = labelStripped(result.answer)
    expect(pageText.endsWith('word')).toBe(true)
  })

  // One off-target top page used to decide the whole answer, so a fact in a later result's highlight never reached
  // the model — and the snippet clips at 200, so it was nowhere at all. A share per result keeps later ones in.
  it('gives later results a share when the first highlight is very long', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: ['x'.repeat(1800)] },
        { title: 'B', url: 'https://b.test', highlights: [`${'y'.repeat(190)}NEEDLE`] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toContain('NEEDLE')
    expect(labelStripped(result.answer).length).toBeLessThanOrEqual(1500)
  })

  // A replay of 20 real Exa responses showed equal shares cutting real answers: the fact sits about character 450
  // into the top result, so the fair share of ~300 a page of five results left threw it away. The top result takes
  // half the allowance instead, and later results still get their share of what is left.
  it('keeps a fact deep in the top result while later results still get text', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: [`${'x'.repeat(450)}NEEDLE${'x'.repeat(1544)}`] },
        ...Array.from({ length: 4 }, (_, index) => ({
          title: `T${index}`,
          url: `https://t${index}.test`,
          highlights: [`${'y'.repeat(100)}OTHER${'y'.repeat(893)}`]
        }))
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toContain('NEEDLE')
    expect(result.answer).toContain('OTHER')
    expect(labelStripped(result.answer).length).toBeLessThanOrEqual(1500)
  })

  it('rolls unused share forward', async () => {
    exaReplies({
      results: [
        { title: 'A', url: 'https://a.test', highlights: ['short first fact'] },
        { title: 'B', url: 'https://b.test', highlights: ['y'.repeat(1400)] }
      ]
    })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toContain('short first fact')
    expect(result.answer).toContain('y'.repeat(751))
    expect(labelStripped(result.answer).length).toBeLessThanOrEqual(1500)
  })

  // A cut inside an emoji leaves half a surrogate pair, which the model APIs reject. Both cuts must straddle the
  // pair: the answer's 1,500-character cap and the snippet's 200-character clip.
  it('never leaves a lone surrogate at a cut', async () => {
    exaReplies({
      results: [{ title: 'A', url: 'https://a.test', highlights: [`${'e'.repeat(1499)}😀${'t'.repeat(50)}`] }]
    })

    const result = await exaSearch({ query: 'q' })

    expect(hasLoneSurrogate(result.answer)).toBe(false)
    expect(hasLoneSurrogate(clipSnippet(`${'e'.repeat(199)}😀`))).toBe(false)
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

  // Pino prints a plain `error` key as `{}`, so only the message is logged — the object itself must stay a string.
  it('logs only the message when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'))

    await exaSearch({ query: 'q' })

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ error: 'socket hang up' }), 'Exa search error')
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
      text: `${LABEL}\nIt premiered in January.\nA second fact.`,
      sources: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a' },
        { title: 'Polygon', url: 'https://www.polygon.com/b' }
      ]
    })
  })

  it('labels page text as untrusted, and leaves the no-summary text alone', async () => {
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: ['a fact'] }] })
    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({
      answer: `${LABEL}\na fact`
    })

    exaReplies({ results: [{ title: 'A', url: 'https://a.test' }] })
    await expect(exaSearch({ query: 'q' })).resolves.toMatchObject({ answer: NO_SUMMARY })
  })

  // The label is not page text, so it does not eat into the 1,500 characters of excerpts.
  it('measures the cap against the page text, not the label', async () => {
    exaReplies({ results: [{ title: 'A', url: 'https://a.test', highlights: ['h'.repeat(2000)] }] })

    const result = await exaSearch({ query: 'q' })

    expect(result.answer).toBe(`${LABEL}\n${'h'.repeat(1500)}`)
  })
})
