import {
  type FrameRunner,
  type FrameSource,
  PROTOCOL_WHITELIST,
  headerArgs,
  isAcceptedInput,
  runMediaTool
} from './frames.js'
import type { MediaClip } from './types.js'

export interface TranscriptSegment {
  startSec: number
  endSec: number
  text: string
}

export interface Transcript {
  language: string
  engine: string
  speechSec: number
  segments: TranscriptSegment[]
}

export interface TranscriberSettings {
  url: string
  timeoutMs: number
  maxSpeechSec: number
  fetchImpl?: typeof fetch
}

const SAMPLED_WINDOW_COUNT = 4
const MIN_WINDOW_SPEECH_SEC = 10

export function audioWindows(durationSec: number, maxAudioSec: number, focus?: MediaClip): MediaClip[] {
  const total = Math.round(durationSec)
  if (focus) {
    const startSec = Math.max(0, Math.round(focus.startSec))
    const endSec = Math.min(total, Math.round(focus.endSec))
    return endSec > startSec ? [{ startSec, endSec }] : []
  }
  if (!(total > 0)) return []
  if (durationSec <= maxAudioSec) return [{ startSec: 0, endSec: total }]

  const windowSec = maxAudioSec / SAMPLED_WINDOW_COUNT
  const quarterSec = durationSec / SAMPLED_WINDOW_COUNT
  const windows: MediaClip[] = []
  let previousEnd = 0
  for (let i = 0; i < SAMPLED_WINDOW_COUNT; i++) {
    const centre = (i + 0.5) * quarterSec
    const startSec = Math.max(previousEnd, Math.round(centre - windowSec / 2))
    const endSec = Math.min(total, Math.round(centre + windowSec / 2))
    if (endSec > startSec) {
      windows.push({ startSec, endSec })
      previousEnd = endSec
    }
  }
  return windows
}

export async function extractAudioWav(
  source: FrameSource,
  window: MediaClip,
  options: { run?: FrameRunner; timeoutMs?: number } = {}
): Promise<Buffer | null> {
  if (!isAcceptedInput(source.input)) return null
  const { run = runMediaTool, timeoutMs = 20_000 } = options
  const result = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-nostdin',
      '-protocol_whitelist',
      PROTOCOL_WHITELIST,
      ...headerArgs(source.headers),
      '-ss',
      window.startSec.toFixed(3),
      '-t',
      (window.endSec - window.startSec).toFixed(3),
      '-i',
      source.input,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-sample_fmt',
      's16',
      '-f',
      'wav',
      'pipe:1'
    ],
    timeoutMs
  )
  if (result.code !== 0 || result.timedOut) return null
  if (result.stdout.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  return result.stdout
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function parseSegment(value: unknown): TranscriptSegment[] {
  if (typeof value !== 'object' || value === null) return []
  const { start, end, text } = value as Record<string, unknown>
  if (typeof start !== 'number' || !Number.isFinite(start)) return []
  if (typeof end !== 'number' || !Number.isFinite(end) || start > end) return []
  if (typeof text !== 'string' || text.trim() === '') return []
  return [{ startSec: start, endSec: end, text: text.trim() }]
}

function parseTranscript(body: unknown): Transcript | null {
  if (typeof body !== 'object' || body === null) return null
  const { language, engine, speechSec, segments } = body as Record<string, unknown>
  if (typeof language !== 'string' || typeof engine !== 'string') return null
  if (typeof speechSec !== 'number' || !Number.isFinite(speechSec) || !Array.isArray(segments)) return null
  return { language, engine, speechSec, segments: segments.flatMap(parseSegment) }
}

export async function postTranscription(
  wav: Buffer,
  settings: TranscriberSettings,
  signal?: AbortSignal
): Promise<Transcript | { reason: string }> {
  if (settings.url === '') return { reason: 'disabled' }
  const fetchImpl = settings.fetchImpl ?? fetch
  const url = `${settings.url.replace(/\/+$/, '')}/transcribe?maxSpeechSec=${settings.maxSpeechSec}`
  const timeout = AbortSignal.timeout(settings.timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
      signal: AbortSignal.any(signal ? [signal, timeout] : [timeout])
    })
    if (!response.ok) return { reason: `http_${response.status}` }
    const transcript = parseTranscript(await response.json())
    return transcript ?? { reason: 'invalid' }
  } catch (error) {
    if (isAbortError(error)) return { reason: 'timeout' }
    return { reason: error instanceof SyntaxError ? 'invalid' : 'unreachable' }
  }
}

export async function transcribeSource(
  source: FrameSource,
  windows: MediaClip[],
  settings: TranscriberSettings,
  options: { run?: FrameRunner; signal?: AbortSignal } = {}
): Promise<Transcript | { reason: string }> {
  const perWindowSec = Math.max(MIN_WINDOW_SPEECH_SEC, Math.floor(settings.maxSpeechSec / windows.length))
  const windowSettings = { ...settings, maxSpeechSec: perWindowSec }

  // The sidecar transcribes one request at a time, so windows go out sequentially.
  const transcripts: Array<{ window: MediaClip; transcript: Transcript }> = []
  const failures: string[] = []
  for (const window of windows) {
    if (options.signal?.aborted) {
      failures.push('timeout')
      break
    }
    const wav = await extractAudioWav(source, window, { run: options.run })
    if (!wav) {
      failures.push('no_audio')
      continue
    }
    const result = await postTranscription(wav, windowSettings, options.signal)
    if ('reason' in result) failures.push(result.reason)
    else transcripts.push({ window, transcript: result })
  }
  if (transcripts.length === 0) return { reason: failures[0] ?? 'no_audio' }

  const segments = transcripts
    .flatMap(({ window, transcript }) =>
      transcript.segments.map((segment) => ({
        startSec: segment.startSec + window.startSec,
        endSec: segment.endSec + window.startSec,
        text: segment.text
      }))
    )
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
  const dominant = transcripts.reduce((best, current) =>
    current.transcript.speechSec > best.transcript.speechSec ? current : best
  )
  return {
    language: dominant.transcript.language,
    engine: dominant.transcript.engine,
    speechSec: transcripts.reduce((sum, { transcript }) => sum + transcript.speechSec, 0),
    segments
  }
}
