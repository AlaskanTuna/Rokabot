import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { fetchThreadsReplies } from '../socialPosts/replies/threads.js'
import { createSocialPostViewer } from '../socialPosts/service.js'
import { parseThreadsPage } from '../socialPosts/threads.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'
import { replyContext } from './replyFetchTestContext.js'

const PAGE = readFileSync(new URL('../../../tests/fixtures/social/threads-post.html', import.meta.url), 'utf8')
const target = parseSocialPostUrl('https://www.threads.com/@poster_one/post/DFixtur3abc')!

const settings = {
  enabled: true,
  maxLookupsPerTurn: 1,
  timeoutMs: 1000,
  maxTextChars: 1500,
  cacheTtlMs: 900_000,
  maxCacheEntries: 2,
  ytDlpPath: 'yt-dlp'
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// The page embeds each GraphQL result in this wrapper; a post with no photos or replies needs only the one block.
function pageWith(media: Record<string, unknown>): string {
  const block = {
    require: [
      [
        'ScheduledServerJS',
        'handle',
        null,
        [
          {
            __bbox: {
              require: [
                [
                  'RelayPrefetchedStreamCache',
                  'next',
                  [],
                  [
                    'adp_BarcelonaPostPageTargetQueryRelayPreloader_0',
                    { __bbox: { complete: true, result: { data: { media } } } }
                  ]
                ]
              ]
            }
          }
        ]
      ]
    ]
  }
  return `<html><body><script type="application/json" data-sjs>${JSON.stringify(block)}</script></body></html>`
}

describe('Threads links', () => {
  it.each([
    ['threads.com', 'https://www.threads.com/@poster_one/post/DFixtur3abc'],
    ['threads.net', 'https://www.threads.net/@poster_one/post/DFixtur3abc'],
    ['a media tab and query', 'https://threads.com/@poster_one/post/DFixtur3abc/media?xmt=abc'],
    ['a dotted username', 'https://www.threads.com/@poster.one/post/DFixtur3abc']
  ])('recognizes %s', (_name, url) => {
    expect(parseSocialPostUrl(url)).toMatchObject({ platform: 'threads', id: 'DFixtur3abc' })
  })

  it('keeps the profile in the canonical address', () => {
    expect(parseSocialPostUrl('https://www.threads.net/@poster_one/post/DFixtur3abc')).toMatchObject({
      lookupKey: 'threads:DFixtur3abc',
      canonicalUrl: 'https://www.threads.com/@poster_one/post/DFixtur3abc',
      profile: 'poster_one'
    })
  })

  it('reads a short /t/ link, which Threads redirects to the full post', () => {
    expect(parseSocialPostUrl('https://www.threads.com/t/DFixtur3abc')).toMatchObject({
      platform: 'threads',
      canonicalUrl: 'https://www.threads.com/t/DFixtur3abc'
    })
  })

  it.each([
    'https://www.threads.com/@poster_one',
    'https://www.threads.com/@poster_one/post/',
    'https://threads.com.evil.com/@poster_one/post/DFixtur3abc'
  ])('rejects %s', (url) => {
    expect(parseSocialPostUrl(url)).toBeNull()
  })
})

describe('parseThreadsPage', () => {
  it('reads the linked post, counting every photo and video in a carousel', () => {
    expect(parseThreadsPage(PAGE, target, 1500)?.post).toMatchObject({
      platform: 'threads',
      id: 'DFixtur3abc',
      authorHandle: 'poster_one',
      authorName: 'Poster One',
      createdAt: '2025-10-03',
      text: 'A day at the research lab. Three photos and a clip.',
      photoCount: 2,
      videoCount: 1,
      imageUrl: 'https://scontent.cdninstagram.com/v/fixture-one.jpg',
      replyCount: 897,
      video: {
        url: 'https://instagram.fkul4-3.fna.fbcdn.net/o1/v/fixture-clip.mp4',
        bytes: null,
        headers: null,
        hasAudio: true
      }
    })
  })

  it('reads a quoted post and a link card', () => {
    const page = pageWith({
      code: 'DFixtur3abc',
      media_type: 19,
      taken_at: 1759505661,
      caption: { text: 'Worth a read' },
      user: { username: 'poster_one', full_name: '' },
      text_post_app_info: {
        direct_reply_count: 0,
        link_preview_attachment: {
          url: 'https://example.com/a',
          title: 'An article',
          image_url: 'https://example.com/a.jpg'
        },
        share_info: { quoted_post: { caption: { text: 'The original take' }, user: { username: 'quoted_one' } } }
      }
    })

    expect(parseThreadsPage(page, target, 1500)?.post).toMatchObject({
      text: 'Worth a read',
      quotedText: 'The original take',
      quotedAuthorHandle: 'quoted_one',
      externalTitle: 'An article',
      imageUrl: 'https://example.com/a.jpg',
      photoCount: 0,
      videoCount: 0,
      replyCount: 0,
      video: null
    })
  })

  it('ignores related posts and returns null when the page carries no post data', () => {
    expect(parseThreadsPage(PAGE, parseSocialPostUrl('https://www.threads.com/@x/post/DOtherPost2')!, 1500)).toBeNull()
    expect(parseThreadsPage('<html><title>Threads</title></html>', target, 1500)).toBeNull()
  })
})

describe('SocialPostViewer on Threads', () => {
  it('requests the post page as a browser navigation and reads the post from it', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => htmlResponse(PAGE))
    const viewer = createSocialPostViewer(settings, { fetcher })

    const result = await viewer.lookup(target)

    expect(result).toMatchObject({ status: 'found', post: { platform: 'threads', authorHandle: 'poster_one' } })
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe('https://www.threads.com/@poster_one/post/DFixtur3abc')
    const headers = new Headers(init?.headers)
    // Without these Threads serves an empty app shell instead of the rendered post.
    expect(headers.get('accept')).toContain('text/html')
    expect(headers.get('sec-fetch-mode')).toBe('navigate')
    expect(headers.get('sec-fetch-dest')).toBe('document')
  })

  it('reports a page without post data as unopened', async () => {
    const viewer = createSocialPostViewer(settings, { fetcher: vi.fn(async () => htmlResponse('<html></html>')) })

    expect(await viewer.lookup(target)).toEqual({ status: 'failed', platform: 'threads', reason: 'no_post_data' })
  })

  it('reports an HTTP failure', async () => {
    const viewer = createSocialPostViewer(settings, { fetcher: vi.fn(async () => htmlResponse('', 429)) })

    expect(await viewer.lookup(target)).toEqual({ status: 'failed', platform: 'threads', reason: 'http_429' })
  })
})

describe('fetchThreadsReplies', () => {
  it('ranks the replies the page carries by likes, once each, skipping ones without text', async () => {
    const context = replyContext({ fetcher: vi.fn(async () => htmlResponse(PAGE)) as unknown as typeof fetch })

    expect(await fetchThreadsReplies(target, context)).toEqual({
      status: 'found',
      platform: 'threads',
      total: 897,
      replies: [
        { author: 'critic_one', text: 'Not convinced', likes: 17 },
        { author: 'fan_three', text: 'When does it ship?', likes: 13 },
        { author: 'fan_one', text: 'Looks great', likes: 7 },
        { author: 'fan_two', text: 'Count me in', likes: 4 },
        { author: 'fan_five', text: 'Nice', likes: 0 }
      ]
    })
  })

  it('fails when the page carries no post data', async () => {
    const context = replyContext({
      fetcher: vi.fn(async () => htmlResponse('<html></html>')) as unknown as typeof fetch
    })

    expect(await fetchThreadsReplies(target, context)).toEqual({
      status: 'failed',
      platform: 'threads',
      reason: 'no_post_data'
    })
  })
})
