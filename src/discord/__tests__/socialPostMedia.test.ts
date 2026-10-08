import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialPost } from '../socialPosts/types.js'
import { parseSocialPostUrl } from '../socialPosts/urls.js'

const mocks = vi.hoisted(() => ({ watch: true, resolveMediaUrl: vi.fn() }))

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    get media() {
      return { watch: mocks.watch }
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
      durationSec: 15.474
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

  it('falls back to the thumbnail when the video is bigger than one watch can take', async () => {
    mocks.resolveMediaUrl
      .mockResolvedValueOnce({ url: xVideo.url, contentType: 'video/mp4', size: 40 * 1024 * 1024 })
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
      startSec: 754
    })
  })

  it('keeps thumbnails only when watching is switched off', async () => {
    mocks.watch = false
    mocks.resolveMediaUrl.mockResolvedValueOnce({ url: 'https://pbs.twimg.com/thumb.jpg', contentType: 'image/jpeg' })

    await socialPostMedia(post({ url: 'https://x.com/roka/status/123', video: xVideo }))

    expect(mocks.resolveMediaUrl).toHaveBeenCalledOnce()
    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith('https://pbs.twimg.com/thumb.jpg')
  })
})
