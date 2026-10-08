import { describe, expect, it, vi } from 'vitest'
import { createReplyReader } from '../socialPosts/replies/service.js'
import type { ReplyFetcher, ReplyLookup } from '../socialPosts/replies/types.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

const SETTINGS = {
  enabled: true,
  timeoutMs: 50,
  maxReplies: 5,
  maxReplyChars: 280,
  cacheTtlMs: 1000,
  maxCacheEntries: 2,
  ytDlpPath: 'yt-dlp'
}
const xTarget = parseSocialPostUrl('https://x.com/a/status/1')!
const FOUND: ReplyLookup = { status: 'found', platform: 'x', total: 1, replies: [{ author: 'a', text: 'b', likes: 1 }] }

function readerWith(x: ReplyFetcher, overrides: Partial<typeof SETTINGS> = {}, now = () => 0) {
  const warn = vi.fn()
  const reader = createReplyReader(
    { ...SETTINGS, ...overrides },
    {
      fetchers: { x, instagram: vi.fn(async () => FOUND) },
      now,
      warn,
      youtubeApiKey: () => 'key-from-env'
    }
  )
  return { reader, warn }
}

describe('ReplyReader', () => {
  it('dispatches to the platform fetcher with the configured limits', async () => {
    const x = vi.fn(async () => FOUND)
    const { reader } = readerWith(x)

    expect(await reader.read(xTarget)).toEqual(FOUND)
    expect(x).toHaveBeenCalledWith(
      xTarget,
      expect.objectContaining({ maxReplies: 5, maxReplyChars: 280, timeoutMs: 50, youtubeApiKey: 'key-from-env' })
    )
  })

  it('reuses a found result until it expires, and never caches a failure', async () => {
    let clock = 0
    const x = vi.fn(async () => FOUND)
    const { reader } = readerWith(x, {}, () => clock)

    await reader.read(xTarget)
    await reader.read(xTarget)
    expect(x).toHaveBeenCalledTimes(1)
    clock = 1001
    await reader.read(xTarget)
    expect(x).toHaveBeenCalledTimes(2)

    const failing = vi.fn(async (): Promise<ReplyLookup> => ({ status: 'failed', platform: 'x', reason: 'http_500' }))
    const second = readerWith(failing).reader
    await second.read(xTarget)
    await second.read(xTarget)
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('times out a slow fetcher, aborts it, and warns with the platform and reason only', async () => {
    let signal: AbortSignal | undefined
    const x: ReplyFetcher = (_target, context) => {
      signal = context.signal
      return new Promise(() => {})
    }
    const { reader, warn } = readerWith(x)

    expect(await reader.read(xTarget)).toEqual({ status: 'failed', platform: 'x', reason: 'timeout' })
    expect(signal?.aborted).toBe(true)
    expect(warn).toHaveBeenCalledWith('x', 'timeout')
  })

  it('maps a thrown error to network_error', async () => {
    const { reader } = readerWith(vi.fn(async () => Promise.reject(new Error('socket hang up'))))

    expect(await reader.read(xTarget)).toEqual({ status: 'failed', platform: 'x', reason: 'network_error' })
  })

  it('does nothing when disabled and refuses Instagram without yt-dlp', async () => {
    const x = vi.fn(async () => FOUND)
    expect(await readerWith(x, { enabled: false }).reader.read(xTarget)).toEqual({
      status: 'failed',
      platform: 'x',
      reason: 'disabled'
    })
    expect(x).not.toHaveBeenCalled()

    const { reader } = readerWith(x)
    reader.setYtDlpAvailable(false)
    expect(await reader.read(parseSocialPostUrl('https://www.instagram.com/p/abc/')!)).toEqual({
      status: 'failed',
      platform: 'instagram',
      reason: 'binary_missing'
    })
  })
})
