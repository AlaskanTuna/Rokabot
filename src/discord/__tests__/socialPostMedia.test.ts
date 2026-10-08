import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialPost } from '../socialPosts/types.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

const mocks = vi.hoisted(() => ({ watch: true, resolveMediaUrl: vi.fn() }))

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    get media() {
      return { watch: mocks.watch, maxStreamedUploadBytes: 52_428_800 }
    }
  }
}))

vi.mock('../attachments.js', () => ({ resolveMediaUrl: mocks.resolveMediaUrl }))

import { socialPostMedia } from '../socialPosts/media.js'

function post(overrides: Partial<SocialPost> & { url: string }): SocialPost {
  const target = parseSocialPostUrl(overrides.url)!
  return {
    platform: target.platform,
    id: target.id,
    canonicalUrl: target.canonicalUrl,
    target,
    authorHandle: 'roka',
    authorName: 'Roka',
    createdAt: null,
    text: 'post text',
    quotedText: '',
    quotedAuthorHandle: '',
    photoCount: 0,
    videoCount: 1,
    imageUrl: 'https://pbs.twimg.com/thumb.jpg',
    externalTitle: '',
    replyCount: null,
    durationSec: null,
    video: null,
    ...overrides
  }
}

const xVideo = {
  url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/240x240/a.mp4',
  bytes: null,
  headers: null,
  hasAudio: null
}

beforeEach(() => {
  mocks.watch = true
  mocks.resolveMediaUrl.mockReset()
})

describe('socialPostMedia', () => {
  it('watches the smallest X video instead of its thumbnail', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: xVideo.url, contentType: 'video/mp4', size: 334_617 })

    const media = await socialPostMedia(
      post({ url: 'https://x.com/roka/status/123', video: xVideo, durationSec: 15.474 })
    )

    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith(xVideo.url)
    expect(media).toEqual({
      url: xVideo.url,
      contentType: 'video/mp4',
      size: 334_617,
      durationSec: 15.474,
      origin: 'link',
      sourceAuthorId: null,
      contentKey: 'x:123:0'
    })
  })

  it('marks a stream known to have no sound', async () => {
    const silent = { ...xVideo, url: 'https://v.redd.it/abc/DASH_240.mp4', hasAudio: false }
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: silent.url, contentType: 'video/mp4', size: 892_001 })

    const media = await socialPostMedia(
      post({ url: 'https://www.reddit.com/r/videos/comments/6rrwyj/x/', video: silent, durationSec: 12 })
    )

    expect(media).toMatchObject({ url: silent.url, silent: true, durationSec: 12 })
  })

  it('falls back to the thumbnail when the video will not open', async () => {
    mocks.resolveMediaUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })

    const media = await socialPostMedia(post({ url: 'https://x.com/roka/status/123', video: xVideo }))

    expect(mocks.resolveMediaUrl).toHaveBeenLastCalledWith('https://pbs.twimg.com/thumb.jpg')
    expect(media).toEqual({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })
  })

  it('streams a linked video above the inline cap through Files, not its thumbnail', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: xVideo.url, contentType: 'video/mp4', size: 40 * 1024 * 1024 })

    const media = await socialPostMedia(post({ url: 'https://x.com/roka/status/123', video: xVideo }))

    expect(media).toMatchObject({ url: xVideo.url, contentType: 'video/mp4', size: 40 * 1024 * 1024 })
  })

  it('falls back to the thumbnail when the video is bigger than one watch can take', async () => {
    mocks.resolveMediaUrl
      .mockResolvedValueOnce({ url: xVideo.url, contentType: 'video/mp4', size: 60 * 1024 * 1024 })
      .mockResolvedValueOnce({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })

    const media = await socialPostMedia(post({ url: 'https://x.com/roka/status/123', video: xVideo }))

    expect(media).toEqual({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })
  })

  it('watches a YouTube link from where its timestamp points', async () => {
    const media = await socialPostMedia(post({ url: 'https://youtu.be/jNQXAC9IVRw?t=754', durationSec: 1200 }))

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
    expect(media).toEqual({
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      contentType: 'video/mp4',
      transport: 'uri',
      durationSec: 1200,
      startSec: 754,
      origin: 'link',
      sourceAuthorId: null,
      contentKey: 'youtube:jNQXAC9IVRw@754'
    })
  })

  it('keeps the thumbnail when the host states no size and the post says the video is too big to download', async () => {
    mocks.resolveMediaUrl.mockImplementation(async (url: string) =>
      url.endsWith('.mp4')
        ? { url, contentType: 'video/mp4' }
        : { url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' }
    )

    const media = await socialPostMedia(
      post({ url: 'https://x.com/roka/status/123', video: { ...xVideo, bytes: 30 * 1024 * 1024 } })
    )

    expect(media).toEqual({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })
  })

  it('keys a Bluesky video by its account as well as its record key', async () => {
    mocks.resolveMediaUrl.mockResolvedValue({ url: 'https://pds.example/blob', contentType: 'video/mp4', size: 1000 })
    const video = { url: 'https://pds.example/blob', bytes: 1000, headers: null, hasAudio: true }

    const victim = await socialPostMedia(post({ url: 'https://bsky.app/profile/alice.bsky.social/post/3kabc', video }))
    const lookalike = await socialPostMedia(
      post({ url: 'https://bsky.app/profile/mallory.bsky.social/post/3kabc', video })
    )

    expect(victim?.contentKey).toBe('bluesky:alice.bsky.social/3kabc:0')
    expect(lookalike?.contentKey).not.toBe(victim?.contentKey)
  })

  it('keeps thumbnails only when watching is switched off', async () => {
    mocks.watch = false
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })

    await socialPostMedia(post({ url: 'https://x.com/roka/status/123', video: xVideo }))

    expect(mocks.resolveMediaUrl).toHaveBeenCalledOnce()
    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith('https://pbs.twimg.com/thumb.jpg')
  })
})
