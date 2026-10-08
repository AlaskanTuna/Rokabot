import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'
import type { MediaClip } from './types.js'

export interface FrameSource {
  /** A local file path or an https URL. */
  input: string
  headers?: Record<string, string> | null
}

export type FrameRunner = (
  command: string,
  args: string[],
  timeoutMs: number
) => Promise<{ code: number | null; stdout: Buffer; timedOut: boolean }>

const MAX_MEDIA_TOOL_STDOUT_BYTES = 8 * 1024 * 1024
const PROTOCOL_WHITELIST = 'file,https,tls,tcp,crypto'
const EMPTY = Buffer.alloc(0)

export const runMediaTool: FrameRunner = (command, args, timeoutMs) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const finish = (result: Awaited<ReturnType<FrameRunner>>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ code: null, stdout: EMPTY, timedOut: true })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > MAX_MEDIA_TOOL_STDOUT_BYTES) {
        child.kill('SIGKILL')
        finish({ code: null, stdout: EMPTY, timedOut: false })
        return
      }
      chunks.push(chunk)
    })
    child.once('error', () => finish({ code: null, stdout: EMPTY, timedOut: false }))
    child.once('close', (code) => finish({ code, stdout: Buffer.concat(chunks), timedOut: false }))
  })

export function frameBins(
  durationSec: number,
  count: number,
  window?: { startSec: number; endSec: number }
): MediaClip[] {
  const start = Math.round(window?.startSec ?? 0)
  const end = Math.round(window?.endSec ?? durationSec)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || count < 1) return []

  const edges = [start]
  for (let i = 1; i < count; i++) edges.push(Math.round(start + ((end - start) * i) / count))
  edges.push(end)

  const bins: MediaClip[] = []
  for (let i = 0; i < count; i++) {
    if (edges[i + 1] > edges[i]) bins.push({ startSec: edges[i], endSec: edges[i + 1] })
  }
  return bins
}

export function frameTimestamps(bins: MediaClip[]): number[] {
  return bins.map((bin) => (bin.startSec + bin.endSec) / 2)
}

function isAcceptedInput(input: string): boolean {
  if (input.includes('\0')) return false
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return input.startsWith('https://') && URL.canParse(input)
  return isAbsolute(input)
}

function headerArgs(headers: FrameSource['headers']): string[] {
  const entries = Object.entries(headers ?? {})
  if (entries.length === 0) return []
  const block = entries
    .map(([key, value]) => `${key.replace(/[\r\n]/g, '')}: ${value.replace(/[\r\n]/g, '')}\r\n`)
    .join('')
  return ['-headers', block]
}

export async function probeDurationSec(
  source: FrameSource,
  options: { run?: FrameRunner; timeoutMs?: number } = {}
): Promise<number | null> {
  if (!isAcceptedInput(source.input)) return null
  const { run = runMediaTool, timeoutMs = 15_000 } = options
  const result = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      PROTOCOL_WHITELIST,
      ...headerArgs(source.headers),
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      source.input
    ],
    timeoutMs
  )
  if (result.code !== 0 || result.timedOut) return null

  const value = result.stdout.toString('utf8').trim()
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  const seconds = Number(value)
  return seconds > 0 ? seconds : null
}

async function extractFrame(
  source: FrameSource,
  atSec: number,
  height: number,
  timeoutMs: number,
  run: FrameRunner
): Promise<{ atSec: number; jpeg: Buffer } | null> {
  if (!Number.isFinite(atSec) || atSec < 0) return null
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
      atSec.toFixed(3),
      '-i',
      source.input,
      '-frames:v',
      '1',
      '-vf',
      `scale=-2:${height}`,
      '-q:v',
      '6',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1'
    ],
    timeoutMs
  )
  const isJpeg = result.stdout.length >= 2 && result.stdout[0] === 0xff && result.stdout[1] === 0xd8
  if (result.code !== 0 || result.timedOut || !isJpeg) return null
  return { atSec, jpeg: result.stdout }
}

export async function extractFrames(
  source: FrameSource,
  timestamps: number[],
  options: { height?: number; concurrency?: number; timeoutMs?: number; run?: FrameRunner } = {}
): Promise<Array<{ atSec: number; jpeg: Buffer }>> {
  if (!isAcceptedInput(source.input)) return []
  const { height = 360, concurrency = 4, timeoutMs = 15_000, run = runMediaTool } = options

  const results: Array<{ atSec: number; jpeg: Buffer } | null> = new Array(timestamps.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < timestamps.length) {
      const index = next++
      results[index] = await extractFrame(source, timestamps[index], height, timeoutMs, run)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, timestamps.length) }, worker))
  return results.filter((frame): frame is { atSec: number; jpeg: Buffer } => frame !== null)
}
