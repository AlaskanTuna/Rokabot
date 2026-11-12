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
})
