import { describe, expect, it } from 'vitest'
import { type VideoCandidate, selectPlayableVideo } from '../socialPosts/videoVariant.js'

function candidate(overrides: Partial<VideoCandidate>): VideoCandidate {
  return {
    url: 'https://cdn.example/video.mp4',
    container: 'mp4',
    protocol: 'https',
    hasVideo: true,
    hasAudio: null,
    bytes: null,
    bitrate: null,
    headers: null,
    ...overrides
  }
}

describe('selectPlayableVideo', () => {
  it('prefers a muxed file over a smaller silent file', () => {
    expect(
      selectPlayableVideo([
        candidate({ url: 'https://cdn.example/silent.mp4', hasAudio: false, bytes: 100 }),
        candidate({ url: 'https://cdn.example/muxed.mp4', hasAudio: true, bytes: 1000 })
      ])
    ).toMatchObject({ url: 'https://cdn.example/muxed.mp4', hasAudio: true })
  })

  it('excludes HLS playlists', () => {
    expect(
      selectPlayableVideo([
        candidate({ url: 'https://cdn.example/video.m3u8', container: 'm3u8' }),
        candidate({ url: 'https://cdn.example/video.mp4', container: 'mp4' })
      ])
    ).toMatchObject({ url: 'https://cdn.example/video.mp4' })
  })

  it('accepts a missing container when the URL path is an MP4', () => {
    expect(
      selectPlayableVideo([candidate({ container: null, url: 'http://cdn.example/video.mp4?token=hidden' })])
    ).toMatchObject({ url: 'http://cdn.example/video.mp4?token=hidden' })
  })

  it.each([
    ['audio-only', { hasVideo: false }],
    ['non-HTTP URL', { url: 'ftp://cdn.example/video.mp4' }],
    ['DASH protocol', { protocol: 'http_dash_segments' }],
    ['non-MP4 container', { container: 'webm' }]
  ])('excludes %s candidates', (_name, overrides) => {
    expect(selectPlayableVideo([candidate(overrides)])).toBeNull()
  })

  it('breaks equal byte sizes by lower bitrate', () => {
    expect(
      selectPlayableVideo([
        candidate({ url: 'https://cdn.example/high.mp4', bytes: 1000, bitrate: 800 }),
        candidate({ url: 'https://cdn.example/low.mp4', bytes: 1000, bitrate: 300 })
      ])
    ).toMatchObject({ url: 'https://cdn.example/low.mp4' })
  })

  it('returns null when no candidate qualifies', () => {
    expect(selectPlayableVideo([])).toBeNull()
  })
})
