import { describe, expect, it, vi } from 'vitest'
import { beginSocialPostLookup, createSocialPostViewer } from '../socialPosts/service.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

const settings = {
  enabled: true,
  maxLookupsPerTurn: 1,
  timeoutMs: 1000,
  maxTextChars: 1500,
  cacheTtlMs: 900_000,
  maxCacheEntries: 2,
  ytDlpPath: 'yt-dlp'
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function blueskyVideoThread(did: string, cid: string) {
  return {
    thread: {
      post: {
        author: { did, handle: 'roka.bsky.social', displayName: 'Roka' },
        record: {
          createdAt: '2026-10-06T00:00:00.000Z',
          text: 'A video post',
          embed: { video: { ref: { $link: cid }, mimeType: 'video/mp4', size: 42 } }
        },
        embed: { $type: 'app.bsky.embed.video#view', thumbnail: 'https://cdn.bsky.app/video-cover' }
      }
    }
  }
}

function plcDocument(serviceEndpoint: string) {
  return {
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint }]
  }
}

describe('SocialPostViewer', () => {
  it('fetches and caches one normalized X post by platform and post ID', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ tweet: { id: '123', text: 'post' } })
    )
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl('https://x.com/roka/status/123')!

    const first = await viewer.lookup(target)
    const second = await viewer.lookup(target)

    expect(first).toMatchObject({ status: 'found', post: { platform: 'x', id: '123', text: 'post' } })
    expect(second).toEqual(first)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.fxtwitter.com/status/123')
  })

  it('resolves Bluesky handles and requests a depth-zero post thread', async () => {
    const fetcher = vi
      .fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ did: 'did:plc:abcdef123' }))
      .mockResolvedValueOnce(jsonResponse({ thread: { post: { record: { text: 'post' } } } }))
    const viewer = createSocialPostViewer(settings, { fetcher })

    await viewer.lookup(parseSocialPostUrl('https://bsky.app/profile/roka.bsky.social/post/abc123')!)

    expect(String(fetcher.mock.calls[0][0])).toBe(
      'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=roka.bsky.social'
    )
    const threadUrl = new URL(String(fetcher.mock.calls[1][0]))
    expect(threadUrl.origin).toBe('https://public.api.bsky.app')
    expect(threadUrl.pathname).toBe('/xrpc/app.bsky.feed.getPostThread')
    expect(threadUrl.searchParams.get('uri')).toBe('at://did:plc:abcdef123/app.bsky.feed.post/abc123')
    expect(threadUrl.searchParams.get('depth')).toBe('0')
    expect(threadUrl.searchParams.get('parentHeight')).toBe('0')
  })

  it('skips Bluesky handle resolution when the post URL already has a DID', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ thread: { post: { record: { text: 'post' } } } })
    )
    const viewer = createSocialPostViewer(settings, { fetcher })

    await viewer.lookup(parseSocialPostUrl('https://bsky.app/profile/did:plc:abcdef123/post/abc123')!)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('uri')).toBe(
      'at://did:plc:abcdef123/app.bsky.feed.post/abc123'
    )
  })

  it('resolves a Bluesky video blob to its public PDS URL', async () => {
    const did = 'did:plc:abcdef123'
    const cid = 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input)
      return url.startsWith('https://plc.directory/')
        ? jsonResponse(plcDocument('https://8.8.8.8/'))
        : jsonResponse(blueskyVideoThread(did, cid))
    })
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)!

    const result = await viewer.lookup(target)

    expect(result).toMatchObject({
      status: 'found',
      post: {
        video: {
          url: `https://8.8.8.8/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`,
          bytes: 42,
          headers: null,
          hasAudio: null
        }
      }
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[1][0])).toBe(`https://plc.directory/${did}`)
    expect(fetcher.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps a Bluesky post found when PLC lookup returns 404', async () => {
    const did = 'did:plc:abcdef123'
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith('https://plc.directory/')
        ? jsonResponse({}, 404)
        : jsonResponse(blueskyVideoThread(did, 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'))
    )
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)!

    const result = await viewer.lookup(target)

    expect(result).toMatchObject({ status: 'found', post: { video: null } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('gives up on a slow PLC lookup without losing the post', async () => {
    vi.useRealTimers()
    const did = 'did:plc:abcdef123'
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).startsWith('https://plc.directory/')) {
        return jsonResponse(blueskyVideoThread(did, 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'))
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    })
    const viewer = createSocialPostViewer({ ...settings, timeoutMs: 10_000 }, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)!

    const startedAt = Date.now()
    const result = await viewer.lookup(target)

    expect(result).toMatchObject({ status: 'found', post: { video: null } })
    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })

  it('keeps a Bluesky post found when PLC lookup throws', async () => {
    const did = 'did:plc:abcdef123'
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith('https://plc.directory/')) throw new Error('PLC unavailable')
      return jsonResponse(blueskyVideoThread(did, 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'))
    })
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)!

    const result = await viewer.lookup(target)

    expect(result).toMatchObject({ status: 'found', post: { video: null } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['non-HTTPS endpoint', 'http://8.8.8.8'],
    ['private endpoint', 'https://127.0.0.1']
  ])('keeps a Bluesky post found when its PDS has a %s', async (_name, endpoint) => {
    const did = 'did:plc:abcdef123'
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith('https://plc.directory/')
        ? jsonResponse(plcDocument(endpoint))
        : jsonResponse(blueskyVideoThread(did, 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'))
    )
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)!

    const result = await viewer.lookup(target)

    expect(result).toMatchObject({ status: 'found', post: { video: null } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not resolve a Bluesky video PDS for did:web authors', async () => {
    const did = 'did:web:roka.example'
    const fetcher = vi.fn(async (_input: string | URL | Request) =>
      jsonResponse(blueskyVideoThread(did, 'bafkreifkphpesihcwllhvyazux4ho33nf4obttkmblbj3d4fhdtkllmdpy'))
    )
    const viewer = createSocialPostViewer(settings, { fetcher })
    const target = parseSocialPostUrl(`https://bsky.app/profile/${did}/post/abc123`)

    const result = await viewer.lookup(target!)

    expect(result).toMatchObject({ status: 'found', post: { video: null } })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('reuses a validated PDS endpoint across posts by the same DID', async () => {
    const did = 'did:plc:abcdef123'
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('https://plc.directory/')) return jsonResponse(plcDocument('https://8.8.8.8'))
      const id = new URL(url).searchParams.get('uri')?.split('/').at(-1)
      return jsonResponse(blueskyVideoThread(did, id === 'first' ? 'cid-first' : 'cid-second'))
    })
    const viewer = createSocialPostViewer(settings, { fetcher })

    const first = await viewer.lookup(parseSocialPostUrl(`https://bsky.app/profile/${did}/post/first`)!)
    const second = await viewer.lookup(parseSocialPostUrl(`https://bsky.app/profile/${did}/post/second`)!)

    expect(first).toMatchObject({ status: 'found', post: { video: { url: expect.stringContaining('cid-first') } } })
    expect(second).toMatchObject({ status: 'found', post: { video: { url: expect.stringContaining('cid-second') } } })
    expect(fetcher.mock.calls.filter(([input]) => String(input).startsWith('https://plc.directory/'))).toHaveLength(1)
  })

  it('returns a platform and status reason for unavailable posts without exposing response text', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('secret token content', { status: 404 })
    )
    const warn = vi.fn()
    const viewer = createSocialPostViewer(settings, { fetcher, warn })

    await expect(viewer.lookup(parseSocialPostUrl('https://x.com/roka/status/123')!)).resolves.toEqual({
      status: 'failed',
      platform: 'x',
      reason: 'http_404'
    })
    expect(warn).toHaveBeenCalledWith('x', 'http_404')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret')
  })

  it('does not start a network lookup when disabled', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
    const viewer = createSocialPostViewer({ ...settings, enabled: false }, { fetcher })

    await expect(viewer.lookup(parseSocialPostUrl('https://x.com/roka/status/123')!)).resolves.toEqual({
      status: 'none'
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  // YouTube answers repeated requests from one home IP with a "confirm you're not a bot" wall (seen on the Pi);
  // its oEmbed endpoint has no such check and still gives the title, channel and thumbnail.
  it('falls back to YouTube oEmbed when yt-dlp is refused', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        title: 'Me at the zoo',
        author_name: 'jawed',
        author_url: 'https://www.youtube.com/@jawed',
        thumbnail_url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg'
      })
    )
    const runExtractor = vi.fn(async (_binaryPath: string, _url: string, _timeoutMs: number) => ({ reason: 'exit_1' }))
    const viewer = createSocialPostViewer(settings, { fetcher, runExtractor, warn: vi.fn() })

    const result = await viewer.lookup(parseSocialPostUrl('https://youtu.be/jNQXAC9IVRw')!)

    expect(result).toMatchObject({
      status: 'found',
      post: {
        platform: 'youtube',
        authorHandle: 'jawed',
        authorName: 'jawed',
        text: 'Me at the zoo',
        imageUrl: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
        videoCount: 1
      }
    })
    const oembedUrl = new URL(String(fetcher.mock.calls[0][0]))
    expect(oembedUrl.origin + oembedUrl.pathname).toBe('https://www.youtube.com/oembed')
    expect(oembedUrl.searchParams.get('url')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
  })

  it("keeps yt-dlp's failure reason when YouTube oEmbed fails too", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}, 401))
    const runExtractor = vi.fn(async (_binaryPath: string, _url: string, _timeoutMs: number) => ({ reason: 'exit_1' }))
    const viewer = createSocialPostViewer(settings, { fetcher, runExtractor, warn: vi.fn() })

    await expect(viewer.lookup(parseSocialPostUrl('https://youtu.be/jNQXAC9IVRw')!)).resolves.toEqual({
      status: 'failed',
      platform: 'youtube',
      reason: 'exit_1'
    })
  })

  it('keeps X available when yt-dlp platforms are disabled at startup', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ tweet: { id: '123', text: 'post' } })
    )
    const runExtractor = vi.fn(async (_binaryPath: string, _url: string, _timeoutMs: number) => ({
      reason: 'binary_missing'
    }))
    const warn = vi.fn()
    const viewer = createSocialPostViewer(settings, { fetcher, runExtractor, warn })
    viewer.setYtDlpAvailable(false)

    await expect(viewer.lookup(parseSocialPostUrl('https://www.youtube.com/watch?v=abc_123')!)).resolves.toEqual({
      status: 'failed',
      platform: 'youtube',
      reason: 'binary_missing'
    })
    await expect(viewer.lookup(parseSocialPostUrl('https://x.com/roka/status/123')!)).resolves.toMatchObject({
      status: 'found',
      post: { platform: 'x' }
    })
    expect(runExtractor).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('prefers current message URLs, then reply URLs, before forwarded URLs', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const id = new URL(String(input)).pathname.split('/').at(-1)!
      return jsonResponse({ tweet: { id, text: id } })
    })
    const viewer = createSocialPostViewer(settings, { fetcher })
    const forwarded = ['https://x.com/forwarded/status/303']

    await beginSocialPostLookup(
      ['question https://x.com/current/status/101'],
      Promise.resolve(['https://x.com/reply/status/202', ...forwarded]),
      viewer
    )
    await beginSocialPostLookup(
      ['question without a URL'],
      Promise.resolve(['https://x.com/reply/status/202', ...forwarded]),
      viewer
    )

    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.fxtwitter.com/status/101')
    expect(String(fetcher.mock.calls[1][0])).toBe('https://api.fxtwitter.com/status/202')
  })

  it('expires old cache entries and evicts the oldest when full', async () => {
    let now = 0
    const fetcher = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const id = String(url).split('/').at(-1)!
      return jsonResponse({ tweet: { id, text: id } })
    })
    const viewer = createSocialPostViewer({ ...settings, cacheTtlMs: 10 }, { fetcher, now: () => now })
    const first = parseSocialPostUrl('https://x.com/roka/status/101')!
    const second = parseSocialPostUrl('https://x.com/roka/status/102')!
    const third = parseSocialPostUrl('https://x.com/roka/status/103')!

    await viewer.lookup(first)
    await viewer.lookup(second)
    await viewer.lookup(third)
    await viewer.lookup(first)
    await viewer.lookup(second)
    now = 11
    await viewer.lookup(second)

    expect(fetcher).toHaveBeenCalledTimes(6)
  })
})
