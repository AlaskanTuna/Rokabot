import { describe, expect, it } from 'vitest'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

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
    'https://x.com.evil.com/roka/status/1234567890123456789',
    'https://evilx.com/roka/status/1234567890123456789',
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
