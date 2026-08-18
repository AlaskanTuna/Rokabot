import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { searchWeb } from '../searchWeb.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.TAVILY_API_KEY

/** The exact string src/discord/events/tools/search.ts compares against to pick its not-found branch. */
const NO_SUMMARY = 'No summary available.'

let fetchMock: ReturnType<typeof vi.fn>

function tavilyReplies(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  })
}

/** The request body searchWeb actually handed to Tavily on the most recent call. */
function sentBody(): {
  query: string
  topic: string
  max_results: number
  search_depth: string
  include_answer: string
} {
  return JSON.parse(fetchMock.mock.calls[0][1].body)
}

describe('searchWeb', () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.TAVILY_API_KEY = originalKey
    vi.clearAllMocks()
  })

  // Appending "(as of <date>, <location>)" made Tavily retrieve same-day and region-local pages regardless of
  // subject, and its synthesiser wrote confident answers off them (issue #19). The query goes out untouched.
  it('sends the query verbatim, with no date or location appended', async () => {
    tavilyReplies({ answer: 'a', results: [], response_time: 1 })

    await searchWeb({ query: 'Frieren season 2 release date' })

    expect(sentBody().query).toBe('Frieren season 2 release date')
  })

  it('preserves the no-summary sentinel the slash command branches on', async () => {
    tavilyReplies({ results: [], response_time: 1 })

    await expect(searchWeb({ query: 'anything' })).resolves.toMatchObject({ answer: NO_SUMMARY })
  })

  it('reports itself unconfigured when no API key is set, without calling out', async () => {
    // biome-ignore lint/performance/noDelete: assigning undefined coerces to "undefined", defeating the guard
    delete process.env.TAVILY_API_KEY

    await expect(searchWeb({ query: 'anything' })).resolves.toEqual({
      answer: 'Web search is not configured.',
      results: [],
      resultCount: 0
    })
  })

  // On include_answer 'basic' the synthesiser attributed OpenAI's models to Amazon over correct sources, and on
  // search_depth 'basic' retrieval surfaced fan wikis that produced two different wrong answers for the same
  // character (issue #19). They fix different layers, so both are pinned.
  it('asks Tavily for advanced retrieval, not the default depth', async () => {
    tavilyReplies({ answer: 'a', results: [], response_time: 1 })

    await searchWeb({ query: 'q' })

    expect(sentBody().search_depth).toBe('advanced')
  })

  it('asks Tavily for advanced answer synthesis, not the quick summary', async () => {
    tavilyReplies({ answer: 'a', results: [], response_time: 1 })

    await searchWeb({ query: 'q' })

    expect(sentBody().include_answer).toBe('advanced')
  })

  it('leaves the caller-supplied topic and result count intact', async () => {
    tavilyReplies({ answer: 'a', results: [], response_time: 1 })

    await searchWeb({ query: 'q', topic: 'news', max_results: 3 })

    expect(sentBody()).toMatchObject({ topic: 'news', max_results: 3 })
  })

  it('truncates long snippets so a single result cannot flood the model context', async () => {
    tavilyReplies({
      answer: 'a',
      results: [{ title: 't', url: 'https://example.com', content: 'x'.repeat(500), score: 1 }],
      response_time: 1
    })

    const result = await searchWeb({ query: 'q' })

    expect(result.results[0].snippet).toBe(`${'x'.repeat(200)}...`)
  })

  it('translates a quota rejection into a message rather than an error', async () => {
    tavilyReplies({}, { ok: false, status: 429 })

    await expect(searchWeb({ query: 'q' })).resolves.toMatchObject({
      answer: 'Search quota exceeded. Try again later.'
    })
  })
})
