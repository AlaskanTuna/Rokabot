import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  tavilySearch: vi.fn(),
  recordSearchCitations: vi.fn(),
  provider: 'tavily' as 'off' | 'native' | 'tavily' | 'exa',
  available: true
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../search/tavily.js', () => ({ tavilySearch: mocks.tavilySearch }))
vi.mock('../../searchCitations.js', () => ({ recordSearchCitations: mocks.recordSearchCitations }))
vi.mock('../../../searchSettings.js', () => ({
  searchProviderSetting: () => mocks.provider,
  searchIsAvailable: () => mocks.available
}))

import { searchWeb } from '../searchWeb.js'

const OUTCOME = {
  answer: 'It premiered in January.',
  results: [{ title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', snippet: 'a' }],
  resultCount: 1,
  succeeded: true
}

describe('searchWeb dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.provider = 'tavily'
    mocks.available = true
    mocks.tavilySearch.mockResolvedValue(OUTCOME)
  })

  it('returns the not-configured text without calling a backend when search is unavailable', async () => {
    mocks.available = false

    await expect(searchWeb({ query: 'q' })).resolves.toEqual({
      answer: 'Web search is not configured.',
      results: [],
      resultCount: 0
    })
    expect(mocks.tavilySearch).not.toHaveBeenCalled()
  })

  it('returns only the public result fields', async () => {
    await expect(searchWeb({ query: 'q' })).resolves.toEqual({
      answer: OUTCOME.answer,
      results: OUTCOME.results,
      resultCount: OUTCOME.resultCount
    })
  })

  it('records citations once after a successful search', async () => {
    await searchWeb({ query: 'q' })

    expect(mocks.recordSearchCitations).toHaveBeenCalledExactlyOnceWith([
      { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a' }
    ])
  })

  it('replaces citations when a search succeeds with no results', async () => {
    mocks.tavilySearch.mockResolvedValue({
      answer: 'No summary available.',
      results: [],
      resultCount: 0,
      succeeded: true
    })

    await searchWeb({ query: 'q' })

    expect(mocks.recordSearchCitations).toHaveBeenCalledExactlyOnceWith([])
  })

  // A turn that searched twice must still cite the search it answered from (Review Focus 3).
  it('leaves earlier citations in place when a later search fails', async () => {
    mocks.tavilySearch.mockResolvedValue({
      answer: 'Search request failed.',
      results: [],
      resultCount: 0,
      succeeded: false
    })

    await expect(searchWeb({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })
    expect(mocks.recordSearchCitations).not.toHaveBeenCalled()
  })

  it('logs only the message of an error a backend throws, and returns the failure text', async () => {
    mocks.tavilySearch.mockRejectedValue(new Error('boom'))

    await expect(searchWeb({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith(
      { provider: 'tavily', error: 'boom' },
      'Web search backend threw'
    )

    mocks.warn.mockClear()
    mocks.tavilySearch.mockRejectedValue('plain string')

    await expect(searchWeb({ query: 'q' })).resolves.toMatchObject({ answer: 'Search request failed.' })
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith(
      { provider: 'tavily', error: 'plain string' },
      'Web search backend threw'
    )
  })

  it('logs the provider, elapsed time and result count at info, without the query', async () => {
    await searchWeb({ query: 'the secret query' })

    expect(mocks.info).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'tavily', elapsedMs: expect.any(Number), resultCount: 1, succeeded: true }),
      'Web search finished'
    )
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain('the secret query')
  })
})
