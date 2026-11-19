import { describe, expect, it } from 'vitest'
import { findSocialPostTarget, parseSocialPostUrl } from '../urls.js'

describe('parseSocialPostUrl', () => {
  it.each([
    ['x.com', 'https://x.com/roka/status/1234567890123456789', 'x'],
    ['twitter.com', 'https://twitter.com/roka/status/1234567890123456789', 'x'],
    ['mobile.twitter.com', 'https://mobile.twitter.com/roka/status/1234567890123456789', 'x'],
    ['fxtwitter.com', 'https://fxtwitter.com/roka/status/1234567890123456789', 'x'],
    ['fixupx.com', 'https://fixupx.com/roka/status/1234567890123456789', 'x'],
    ['vxtwitter.com', 'https://vxtwitter.com/roka/status/1234567890123456789', 'x'],
    ['fixvx.com', 'https://fixvx.com/roka/status/1234567890123456789', 'x'],
    ['Bluesky handle', 'https://bsky.app/profile/roka.bsky.social/post/abc123', 'bluesky'],
    ['Bluesky DID', 'https://bsky.app/profile/did:plc:abcd1234/post/abc123', 'bluesky'],
    ['YouTube watch', 'https://www.youtube.com/watch?v=abc_123', 'youtube'],
    ['YouTube short', 'https://youtube.com/shorts/abc_123', 'youtube'],
    ['YouTube short host', 'https://youtu.be/abc_123', 'youtube'],
    ['TikTok', 'https://www.tiktok.com/@roka/video/1234567890', 'tiktok'],
    ['Reddit', 'https://www.reddit.com/r/videos/comments/abc123/a_post/', 'reddit'],
    ['Old Reddit', 'https://old.reddit.com/r/videos/comments/abc123/a_post/', 'reddit'],
    ['Short Reddit', 'https://redd.it/abc123', 'reddit'],
    ['Instagram post', 'https://www.instagram.com/p/AbCd123/', 'instagram'],
    ['Instagram reel', 'https://instagram.com/reel/AbCd123/', 'instagram'],
    ['Bilibili', 'https://www.bilibili.com/video/BV1ab411c7mD', 'bilibili']
  ])('recognizes %s', (_name, url, platform) => {
    expect(parseSocialPostUrl(url)).toMatchObject({ platform })
  })

  it.each([
    'http://x.com/roka/status/1234567890123456789',
    'https://127.0.0.1/roka/status/1234567890123456789',
    'https://x.com:443/roka/status/1234567890123456789',
    'https://user@x.com/roka/status/1234567890123456789',
    'https://x.com/roka/likes/1234567890123456789',
    'https://youtube.com.evil.com/watch?v=abc_123',
    'https://example.com/watch?v=abc_123'
  ])('rejects unsafe or unsupported URL %s', (url) => {
    expect(parseSocialPostUrl(url)).toBeNull()
  })

  it('resolves lookalike hosts only to the first-party URL', () => {
    for (const url of [
      'https://x.com.evil.com/roka/status/1234567890123456789',
      'https://evilx.com/roka/status/1234567890123456789'
    ]) {
      expect(parseSocialPostUrl(url)).toMatchObject({
        canonicalUrl: 'https://x.com/i/status/1234567890123456789',
        extractorUrl: 'https://x.com/i/status/1234567890123456789'
      })
    }
  })

  it('recognizes unknown Instagram mirror reel links by shape', () => {
    const parsed = parseSocialPostUrl('https://www.oginstagram.com/reel/Df6n2AHsM66/?gpwx=MTBkYXQxd3FvNzl4cw==')
    expect(parsed).toMatchObject({
      platform: 'instagram',
      id: 'Df6n2AHsM66',
      lookupKey: 'instagram:Df6n2AHsM66',
      canonicalUrl: 'https://www.instagram.com/reel/Df6n2AHsM66/',
      extractorUrl: 'https://www.instagram.com/reel/Df6n2AHsM66/'
    })
  })

  it.each([
    ['Instagram reel mirror', 'https://ddinstagram.com/reel/Df6n2AHsM66/', 'instagram', 'ddinstagram'],
    ['Instagram post mirror', 'https://www.kkinstagram.com/p/Df6n2AHsM66/', 'instagram', 'kkinstagram'],
    ['TikTok mirror', 'https://vxtiktok.com/@roka/video/1234567890', 'tiktok', 'vxtiktok'],
    ['Reddit mirror', 'https://rxddit.com/r/videos/comments/abc123/a_post/', 'reddit', 'rxddit'],
    ['Bluesky mirror', 'https://fxbsky.app/profile/roka.bsky.social/post/abc123', 'bluesky', 'fxbsky'],
    ['X mirror', 'https://xcancel.com/roka/status/1234567890123456789', 'x', 'xcancel'],
    ['Threads mirror', 'https://fixthreads.net/@roka/post/AbC123', 'threads', 'fixthreads'],
    ['Bilibili mirror', 'https://bilibili.example/video/BV1ab411c7mD', 'bilibili', 'example']
  ])('recognizes %s on an unknown host by shape', (_name, url, platform, hostPart) => {
    const unknownHost = new URL(url).hostname
    const parsed = parseSocialPostUrl(url)
    expect(parsed).toMatchObject({ platform })
    expect(parsed?.canonicalUrl).not.toContain(unknownHost)
    expect(parsed?.canonicalUrl).not.toContain(hostPart)
    expect(parsed?.extractorUrl).not.toContain(unknownHost)
    expect(parsed?.extractorUrl).not.toContain(hostPart)
  })

  it.each([
    'https://substack.com/p/hello-world',
    'https://www.facebook.com/reel/1234567890123456',
    'https://example.com/p/Df6n2AHsM66/',
    'https://example.com/watch?v=abc_123',
    'https://example.com/comments/abc123',
    'https://example.com/t/AbC123',
    'https://example.com/video/av12345',
    'https://example.com/roka/status/123',
    'http://ddinstagram.com/reel/Df6n2AHsM66/',
    'https://ddinstagram.com:443/reel/Df6n2AHsM66/',
    'https://u@ddinstagram.com/reel/Df6n2AHsM66/',
    'https://10.0.0.1/reel/Df6n2AHsM66/'
  ])('rejects unsupported or unsafe unknown-host URL %s', (url) => {
    expect(parseSocialPostUrl(url)).toBeNull()
  })

  it('keeps the first-party Instagram post rule without a length limit', () => {
    expect(parseSocialPostUrl('https://www.instagram.com/p/AbCd123/')).toMatchObject({
      platform: 'instagram',
      id: 'AbCd123',
      canonicalUrl: 'https://www.instagram.com/p/AbCd123/',
      extractorUrl: 'https://www.instagram.com/p/AbCd123/'
    })
  })

  it('rebuilds canonical extractor URLs from parsed identifiers', () => {
    expect(parseSocialPostUrl('https://vxtwitter.com/roka/status/1234567890123456789?token=secret')).toMatchObject({
      id: '1234567890123456789',
      canonicalUrl: 'https://x.com/i/status/1234567890123456789',
      lookupKey: 'x:1234567890123456789',
      extractorUrl: 'https://x.com/i/status/1234567890123456789'
    })
    expect(parseSocialPostUrl('https://youtu.be/abc_123?t=45')).toMatchObject({
      id: 'abc_123',
      canonicalUrl: 'https://www.youtube.com/watch?v=abc_123',
      extractorUrl: 'https://www.youtube.com/watch?v=abc_123'
    })
  })

  it.each([
    ['plain seconds', 'https://youtu.be/abc_123?t=754', 754],
    ['seconds with s', 'https://youtu.be/abc_123?t=754s', 754],
    ['minutes and seconds', 'https://www.youtube.com/watch?v=abc_123&t=12m34s', 754],
    ['hours, minutes and seconds', 'https://www.youtube.com/watch?v=abc_123&t=1h2m3s', 3723],
    ['start parameter', 'https://www.youtube.com/watch?v=abc_123&start=754', 754],
    ['fragment', 'https://youtu.be/abc_123#t=754', 754],
    ['shorts link', 'https://youtube.com/shorts/abc_123?t=30', 30]
  ])('reads the start time from a YouTube link with %s', (_name, url, startSec) => {
    expect(parseSocialPostUrl(url)).toMatchObject({ startSec })
  })

  it.each([
    'https://youtu.be/abc_123',
    'https://youtu.be/abc_123?t=',
    'https://youtu.be/abc_123?t=garbage',
    'https://youtu.be/abc_123?t=12.5',
    'https://youtu.be/abc_123?t=1m2s3',
    'https://youtu.be/abc_123#t=garbage',
    'https://x.com/roka/status/1234567890123456789?t=754'
  ])('leaves startSec undefined for %s', (url) => {
    expect(parseSocialPostUrl(url)?.startSec).toBeUndefined()
  })

  it('keeps the start time out of the lookup key and canonical URL', () => {
    const plain = parseSocialPostUrl('https://youtu.be/abc_123')
    const timed = parseSocialPostUrl('https://youtu.be/abc_123?t=754')
    expect(timed).toMatchObject({
      lookupKey: plain?.lookupKey,
      canonicalUrl: plain?.canonicalUrl,
      extractorUrl: plain?.extractorUrl
    })
  })
})

describe('findSocialPostTarget', () => {
  it('finds a link wrapped in a Discord spoiler', () => {
    expect(findSocialPostTarget('look ||https://fixupx.com/roka/status/1234567890123456789||')).toMatchObject({
      platform: 'x',
      canonicalUrl: 'https://x.com/i/status/1234567890123456789'
    })
  })
})
