import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../jikanThrottle.js', () => ({
  jikanThrottle: vi.fn().mockResolvedValue(undefined)
}))

import { getAnimeSchedule } from '../getAnimeSchedule.js'

const originalFetch = globalThis.fetch

/** A full Jikan page of 25 entries. Scores rise with the index, so the best-rated entries sit at the end. */
function jikanPage() {
  return {
    pagination: { items: { total: 25 } },
    data: Array.from({ length: 25 }, (_, i) => ({ title: `Show ${i}`, score: 5 + i * 0.1 }))
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function requestedUrl(): URL {
  return new URL(fetchMock.mock.calls[0][0] as string)
}

describe('getAnimeSchedule ranking', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => jikanPage() })
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('ranks the day schedule across the full page, not just the first limit entries', async () => {
    const result = await getAnimeSchedule({ scope: 'day', day: 'monday', sort_by: 'score', limit: 5 })

    expect(result.entries.map((e) => e.title)).toEqual(['Show 24', 'Show 23', 'Show 22', 'Show 21', 'Show 20'])
    expect(result.entries.map((e) => Math.round((e.score ?? 0) * 10))).toEqual([74, 73, 72, 71, 70])
  })

  it('ranks the week schedule across the full page, not just the first limit entries', async () => {
    const result = await getAnimeSchedule({ scope: 'week', sort_by: 'score', limit: 5 })

    expect(result.entries.map((e) => e.title)).toEqual(['Show 24', 'Show 23', 'Show 22', 'Show 21', 'Show 20'])
  })

  it('ranks the season across the full page, not just the first limit entries', async () => {
    const result = await getAnimeSchedule({ scope: 'season', sort_by: 'score', limit: 5 })

    expect(result.entries.map((e) => e.title)).toEqual(['Show 24', 'Show 23', 'Show 22', 'Show 21', 'Show 20'])
  })

  it('cuts the ranked page to the caller limit', async () => {
    const result = await getAnimeSchedule({ scope: 'day', day: 'monday', sort_by: 'score', limit: 2 })

    expect(result.entries).toHaveLength(2)
    expect(result.entries.map((e) => e.title)).toEqual(['Show 24', 'Show 23'])
  })

  it('requests the full Jikan page size of 25 for each scope', async () => {
    await getAnimeSchedule({ scope: 'day', day: 'monday', limit: 5 })
    expect(requestedUrl().searchParams.get('limit')).toBe('25')

    fetchMock.mockClear()
    await getAnimeSchedule({ scope: 'week', limit: 5 })
    expect(requestedUrl().searchParams.get('limit')).toBe('25')

    fetchMock.mockClear()
    await getAnimeSchedule({ scope: 'season', limit: 5 })
    expect(requestedUrl().searchParams.get('limit')).toBe('25')
  })

  it('makes exactly one Jikan request per invocation for each scope', async () => {
    await getAnimeSchedule({ scope: 'day', day: 'monday', limit: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    await getAnimeSchedule({ scope: 'week', limit: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    await getAnimeSchedule({ scope: 'season', limit: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
