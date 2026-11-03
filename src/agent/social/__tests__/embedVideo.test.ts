import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ watcher: 'gemini', resolveMediaUrl: vi.fn() }))

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    get media() {
      return { watcher: mocks.watcher, maxStreamedUploadBytes: 52_428_800 }
    }
  }
}))

vi.mock('../../media/mediaRules.js', () => ({ resolveMediaUrl: mocks.resolveMediaUrl }))

import { embedVideoMedia } from '../media.js'

beforeEach(() => {
  mocks.watcher = 'gemini'
  mocks.resolveMediaUrl.mockReset()
})

describe('embedVideoMedia', () => {
  it('watches a playable embed video on any host', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://video.example/clip.mp4',
      contentType: 'video/mp4',
      size: 1_000_000
    })

    const media = await embedVideoMedia('https://video.example/clip.mp4')

    expect(mocks.resolveMediaUrl).toHaveBeenCalledWith('https://video.example/clip.mp4')
    expect(media).toEqual({
      url: 'https://video.example/clip.mp4',
      contentType: 'video/mp4',
      size: 1_000_000,
      origin: 'link',
      sourceAuthorId: null
    })
  })

  it('keeps the thumbnail path when the URL does not resolve to video', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://www.youtube.com/embed/abc',
      contentType: 'text/html',
      size: 5_000
    })

    const media = await embedVideoMedia('https://www.youtube.com/embed/abc')

    expect(media).toBeNull()
  })

  it('refuses a video the address checks reject', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce(null)

    const media = await embedVideoMedia('https://video.example/clip.mp4')

    expect(media).toBeNull()
  })

  it('refuses a video bigger than one watch can take', async () => {
    mocks.resolveMediaUrl.mockResolvedValueOnce({
      url: 'https://video.example/big.mp4',
      contentType: 'video/mp4',
      size: 60 * 1024 * 1024
    })

    const media = await embedVideoMedia('https://video.example/big.mp4')

    expect(media).toBeNull()
  })

  it.each(['direct', 'off'])('keeps thumbnails only when the watcher is %s', async (watcher) => {
    mocks.watcher = watcher

    const media = await embedVideoMedia('https://video.example/clip.mp4')

    expect(mocks.resolveMediaUrl).not.toHaveBeenCalled()
    expect(media).toBeNull()
  })
})
