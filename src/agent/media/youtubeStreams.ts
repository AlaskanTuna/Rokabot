import { config } from '../../config.js'
import { array, object, string } from '../../discord/socialPosts/parsers.js'
import { runYtDlp } from '../../discord/socialPosts/ytDlp.js'

export interface MediaStream {
  url: string
  headers: Record<string, string> | null
}

export interface YouTubeStreams {
  durationSec: number | null
  title: string
  description: string
  video: MediaStream | null
  audio: MediaStream | null
}

type JsonObject = ReturnType<typeof object>

interface VideoFormat {
  format: JsonObject
  url: string
  height: number
  mp4: boolean
  tbr: number
}

interface AudioFormat {
  format: JsonObject
  url: string
  kbps: number
}

const MIN_VIDEO_HEIGHT = 240
const MIN_AUDIO_KBPS = 32
const VIDEO_ID = /^[\w-]{6,20}$/

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hasCodec(value: unknown): boolean {
  const codec = string(value)
  return codec !== '' && codec !== 'none'
}

function directHttpsUrl(format: JsonObject): string | null {
  const url = string(format.url)
  return format.protocol === 'https' && url.startsWith('https://') ? url : null
}

function headersOf(format: JsonObject): Record<string, string> | null {
  const entries = Object.entries(object(format.http_headers)).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length ? Object.fromEntries(entries) : null
}

function videoFormats(formats: JsonObject[]): VideoFormat[] {
  return formats.flatMap((format) => {
    const url = directHttpsUrl(format)
    const height = finiteNumber(format.height)
    if (!url || height === null || !hasCodec(format.vcodec)) return []
    return [{ format, url, height, mp4: string(format.ext) === 'mp4', tbr: finiteNumber(format.tbr) ?? Infinity }]
  })
}

function audioFormats(formats: JsonObject[]): AudioFormat[] {
  return formats.flatMap((format) => {
    const url = directHttpsUrl(format)
    const kbps = finiteNumber(format.abr) ?? finiteNumber(format.tbr)
    if (!url || kbps === null || string(format.vcodec) !== 'none' || !hasCodec(format.acodec)) return []
    return [{ format, url, kbps }]
  })
}

function mp4First(left: { mp4: boolean; tbr: number }, right: { mp4: boolean; tbr: number }): number {
  return Number(right.mp4) - Number(left.mp4) || left.tbr - right.tbr
}

function pickVideo(formats: JsonObject[]): MediaStream | null {
  const candidates = videoFormats(formats)
  const chosen =
    candidates
      .filter((candidate) => candidate.height >= MIN_VIDEO_HEIGHT)
      .sort((left, right) => left.height - right.height || mp4First(left, right))[0] ??
    candidates.sort((left, right) => right.height - left.height || mp4First(left, right))[0]
  return chosen ? { url: chosen.url, headers: headersOf(chosen.format) } : null
}

function pickAudio(formats: JsonObject[]): MediaStream | null {
  const candidates = audioFormats(formats).sort((left, right) => left.kbps - right.kbps)
  const chosen = candidates.find((candidate) => candidate.kbps >= MIN_AUDIO_KBPS) ?? candidates[0]
  return chosen ? { url: chosen.url, headers: headersOf(chosen.format) } : null
}

export function youtubeVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname !== 'www.youtube.com' || parsed.pathname !== '/watch') return null
  const id = parsed.searchParams.get('v') ?? ''
  return VIDEO_ID.test(id) ? id : null
}

export function selectYouTubeStreams(metadata: unknown): YouTubeStreams {
  const root = object(metadata)
  const formats = array(root.formats).map(object)
  const duration = finiteNumber(root.duration)
  return {
    durationSec: duration !== null && duration > 0 ? duration : null,
    title: string(root.title),
    description: string(root.description),
    video: pickVideo(formats),
    audio: pickAudio(formats)
  }
}

export async function resolveYouTubeStreams(
  url: string,
  options: { runExtractor?: typeof runYtDlp; ytDlpPath?: string; timeoutMs?: number } = {}
): Promise<YouTubeStreams | { reason: string }> {
  const videoId = youtubeVideoId(url)
  if (!videoId) return { reason: 'invalid_url' }
  const result = await (options.runExtractor ?? runYtDlp)(
    options.ytDlpPath ?? config.socialPosts.ytDlpPath,
    `https://www.youtube.com/watch?v=${videoId}`,
    options.timeoutMs ?? Math.max(15_000, config.socialPosts.timeoutMs)
  )
  return 'reason' in result ? result : selectYouTubeStreams(result.metadata)
}
