import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn() }
}))

vi.mock('../jikanThrottle.js', () => ({
  jikanThrottle: vi.fn().mockResolvedValue(undefined)
}))

import { logger } from '../../../utils/logger.js'
import { searchAnime } from '../searchAnime.js'

const originalFetch = globalThis.fetch

let fetchMock: ReturnType<typeof vi.fn>

describe('searchAnime', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) })
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('passes a five-second timeout signal to Jikan fetch', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)

    await searchAnime({ query: 'Bloom Into You' })

    expect(timeout).toHaveBeenCalledWith(5000)
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(signal)
  })

  it('logs the error name and message when a Jikan request fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed: DNS lookup failed'))

    await searchAnime({ query: 'Bloom Into You' })

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        errorName: 'TypeError',
        errorMessage: 'fetch failed: DNS lookup failed',
        query: 'Bloom Into You'
      }),
      'Failed to search anime'
    )
  })

  it('maps genre names to MyAnimeList genre ids', async () => {
    const { GENRE_IDS } = await import('../searchAnime.js')

    expect(GENRE_IDS).toEqual({
      action: 1,
      adventure: 2,
      comedy: 4,
      drama: 8,
      fantasy: 10,
      horror: 14,
      mecha: 18,
      music: 19,
      mystery: 7,
      psychological: 40,
      romance: 22,
      'sci-fi': 24,
      'slice of life': 36,
      sports: 30,
      supernatural: 37,
      suspense: 41
    })
  })

  it('sends genres=<id> on /v4/anime when genre is given without a query', async () => {
    await searchAnime({ genre: 'romance', sort_by: 'score' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/v4/anime?')
    expect(calledUrl).toContain('genres=22')
    expect(calledUrl).not.toContain('q=')
  })

  it('combines genre with a query keyword', async () => {
    await searchAnime({ query: 'romance', genre: 'sci-fi' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain(`q=${encodeURIComponent('romance')}`)
    expect(calledUrl).toContain('genres=24')
  })
})
