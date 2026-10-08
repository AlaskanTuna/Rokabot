import { describe, expect, it, vi } from 'vitest'
import { config } from '../../../config.js'
import type { runYtDlp } from '../../../discord/socialPosts/ytDlp.js'
import { resolveYouTubeStreams, selectYouTubeStreams, youtubeVideoId } from '../youtubeStreams.js'

const CANONICAL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

const realisticFormats = [
  {
    format_id: 'sb0',
    ext: 'mhtml',
    protocol: 'mhtml',
    vcodec: 'none',
    acodec: 'none',
    height: 44,
    url: 'https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard.mhtml'
  },
  {
    format_id: '160',
    ext: 'mp4',
    protocol: 'https',
    vcodec: 'avc1.4d400c',
    acodec: 'none',
    height: 144,
    tbr: 110.5,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=160'
  },
  {
    format_id: '133',
    ext: 'mp4',
    protocol: 'https',
    vcodec: 'avc1.4d400d',
    acodec: 'none',
    height: 240,
    tbr: 250.2,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=133',
    http_headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/', Cookie: 42 }
  },
  {
    format_id: '278',
    ext: 'webm',
    protocol: 'https',
    vcodec: 'vp9',
    acodec: 'none',
    height: 144,
    tbr: 80.1,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=278'
  },
  {
    format_id: '242',
    ext: 'webm',
    protocol: 'https',
    vcodec: 'vp9',
    acodec: 'none',
    height: 240,
    tbr: 180.4,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=242'
  },
  {
    format_id: '134',
    ext: 'mp4',
    protocol: 'https',
    vcodec: 'avc1.4d401e',
    acodec: 'none',
    height: 360,
    tbr: 400,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=134'
  },
  {
    format_id: '18',
    ext: 'mp4',
    protocol: 'https',
    vcodec: 'avc1.42001E',
    acodec: 'mp4a.40.2',
    height: 360,
    tbr: 500,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=18'
  },
  {
    format_id: '139',
    ext: 'm4a',
    protocol: 'https',
    vcodec: 'none',
    acodec: 'mp4a.40.5',
    abr: 48,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=139'
  },
  {
    format_id: '140',
    ext: 'm4a',
    protocol: 'https',
    vcodec: 'none',
    acodec: 'mp4a.40.2',
    abr: 129.5,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=140'
  },
  {
    format_id: '249',
    ext: 'webm',
    protocol: 'https',
    vcodec: 'none',
    acodec: 'opus',
    abr: 50,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=249'
  },
  {
    format_id: '251',
    ext: 'webm',
    protocol: 'https',
    vcodec: 'none',
    acodec: 'opus',
    abr: 130,
    url: 'https://rr1.googlevideo.com/videoplayback?itag=251'
  }
]

const metadata = {
  title: 'Never Gonna Give You Up',
  description: 'Official video',
  duration: 212.5,
  formats: realisticFormats
}

describe('selectYouTubeStreams', () => {
  it('picks the lowest 240p video, preferring mp4 over webm at the same height', () => {
    const streams = selectYouTubeStreams(metadata)

    expect(streams.video?.url).toBe('https://rr1.googlevideo.com/videoplayback?itag=133')
  })

  it('picks the lowest audio bitrate at or above 32 kbps', () => {
    const streams = selectYouTubeStreams(metadata)

    // 139 (48 kbps) is the lowest >= 32 kbps; 249 (50 kbps) is next.
    expect(streams.audio?.url).toBe('https://rr1.googlevideo.com/videoplayback?itag=139')
  })

  it('copies string http_headers and drops non-string values', () => {
    const streams = selectYouTubeStreams(metadata)

    expect(streams.video?.headers).toEqual({ 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' })
  })

  it('returns null headers when the chosen format has none', () => {
    const streams = selectYouTubeStreams(metadata)

    expect(streams.audio?.headers).toBeNull()
  })

  it('ignores m3u8, dash, and mhtml formats even when they would otherwise win', () => {
    const streams = selectYouTubeStreams({
      formats: [
        {
          format_id: 'hls-240',
          ext: 'mp4',
          protocol: 'm3u8_native',
          vcodec: 'avc1',
          acodec: 'mp4a',
          height: 240,
          tbr: 1,
          url: 'https://manifest.googlevideo.com/api/manifest/hls_playlist/index.m3u8'
        },
        {
          format_id: 'dash-240',
          ext: 'mp4',
          protocol: 'http_dash_segments',
          vcodec: 'avc1',
          acodec: 'none',
          height: 240,
          tbr: 1,
          url: 'https://rr1.googlevideo.com/dash/240.mpd'
        },
        {
          format_id: 'sb0',
          ext: 'mhtml',
          protocol: 'mhtml',
          vcodec: 'avc1',
          acodec: 'none',
          height: 240,
          tbr: 1,
          url: 'https://i.ytimg.com/sb/storyboard.mhtml'
        },
        {
          format_id: '133',
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'avc1',
          acodec: 'none',
          height: 240,
          tbr: 250,
          url: 'https://rr1.googlevideo.com/videoplayback?itag=133'
        }
      ]
    })

    expect(streams.video?.url).toBe('https://rr1.googlevideo.com/videoplayback?itag=133')
  })

  it('falls back to the highest https video height when nothing reaches 240p', () => {
    const streams = selectYouTubeStreams({
      formats: [
        {
          ext: 'webm',
          protocol: 'https',
          vcodec: 'vp9',
          acodec: 'none',
          height: 144,
          tbr: 80,
          url: 'https://a.test/278'
        },
        {
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'avc1',
          acodec: 'none',
          height: 144,
          tbr: 110,
          url: 'https://a.test/160'
        },
        {
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'avc1',
          acodec: 'none',
          height: 180,
          tbr: 300,
          url: 'https://a.test/180'
        }
      ]
    })

    expect(streams.video?.url).toBe('https://a.test/180')
  })

  it('prefers mp4 at the fallback height when heights tie', () => {
    const streams = selectYouTubeStreams({
      formats: [
        {
          ext: 'webm',
          protocol: 'https',
          vcodec: 'vp9',
          acodec: 'none',
          height: 144,
          tbr: 80,
          url: 'https://a.test/278'
        },
        {
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'avc1',
          acodec: 'none',
          height: 144,
          tbr: 110,
          url: 'https://a.test/160'
        }
      ]
    })

    expect(streams.video?.url).toBe('https://a.test/160')
  })

  it('returns null streams when no usable format exists', () => {
    const streams = selectYouTubeStreams({
      formats: [{ format_id: 'sb0', ext: 'mhtml', protocol: 'mhtml', vcodec: 'none', acodec: 'none', height: 44 }]
    })

    expect(streams.video).toBeNull()
    expect(streams.audio).toBeNull()
  })

  it('parses a positive finite duration and nulls anything else', () => {
    expect(selectYouTubeStreams(metadata).durationSec).toBe(212.5)
    expect(selectYouTubeStreams({ duration: 0 }).durationSec).toBeNull()
    expect(selectYouTubeStreams({ duration: '212' }).durationSec).toBeNull()
    expect(selectYouTubeStreams({}).durationSec).toBeNull()
  })

  it('reads title and description, defaulting to empty strings', () => {
    expect(selectYouTubeStreams(metadata)).toMatchObject({
      title: 'Never Gonna Give You Up',
      description: 'Official video'
    })
    expect(selectYouTubeStreams({})).toMatchObject({ title: '', description: '' })
  })

  it('tolerates non-object metadata', () => {
    expect(selectYouTubeStreams(null)).toEqual({
      durationSec: null,
      title: '',
      description: '',
      video: null,
      audio: null
    })
  })
})

describe('youtubeVideoId', () => {
  it('accepts the canonical watch URL and extra query parameters', () => {
    expect(youtubeVideoId(CANONICAL)).toBe('dQw4w9WgXcQ')
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })

  it('rejects other hosts, malformed IDs, and garbage', () => {
    expect(youtubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(youtubeVideoId(`https://www.youtube.com/watch?v=${'a'.repeat(21)}`)).toBeNull()
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ/../')).toBeNull()
    expect(youtubeVideoId('not a url')).toBeNull()
  })
})

describe('resolveYouTubeStreams', () => {
  it('calls the extractor with the canonical URL and maps its metadata to streams', async () => {
    const runExtractor = vi.fn<typeof runYtDlp>(async () => ({ metadata }))

    const result = await resolveYouTubeStreams('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', {
      runExtractor,
      ytDlpPath: '/usr/bin/yt-dlp',
      timeoutMs: 20_000
    })

    expect(runExtractor).toHaveBeenCalledWith('/usr/bin/yt-dlp', CANONICAL, 20_000)
    expect(result).toMatchObject({
      durationSec: 212.5,
      video: { url: 'https://rr1.googlevideo.com/videoplayback?itag=133' },
      audio: { url: 'https://rr1.googlevideo.com/videoplayback?itag=139' }
    })
  })

  it('passes through the extractor reason', async () => {
    const runExtractor = vi.fn<typeof runYtDlp>(async () => ({ reason: 'exit_1' }))

    const result = await resolveYouTubeStreams(CANONICAL, { runExtractor })

    expect(result).toEqual({ reason: 'exit_1' })
  })

  it('rejects a non-YouTube URL without invoking the extractor', async () => {
    const runExtractor = vi.fn<typeof runYtDlp>(async () => ({ metadata }))

    const result = await resolveYouTubeStreams('https://example.com/video', { runExtractor })

    expect(result).toEqual({ reason: 'invalid_url' })
    expect(runExtractor).not.toHaveBeenCalled()
  })

  it('defaults to the configured binary and a timeout of at least 15 seconds', async () => {
    const runExtractor = vi.fn<typeof runYtDlp>(async () => ({ reason: 'timeout' }))

    await resolveYouTubeStreams(CANONICAL, { runExtractor })

    expect(runExtractor).toHaveBeenCalledWith(
      config.socialPosts.ytDlpPath,
      CANONICAL,
      Math.max(15_000, config.socialPosts.timeoutMs)
    )
  })
})
