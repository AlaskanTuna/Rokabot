import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type FrameRunner,
  type FrameSource,
  extractFrames,
  frameBins,
  frameCount,
  frameTimestamps,
  probeDurationSec,
  runMediaTool
} from '../frames.js'

type RunResult = Awaited<ReturnType<FrameRunner>>
type RunCall = { command: string; args: string[]; timeoutMs: number }

const WHITELIST = 'file,https,tls,tcp,crypto'
const LOCAL: FrameSource = { input: '/srv/media/clip.mp4' }
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const ok = (stdout: Buffer = JPEG): RunResult => ({ code: 0, stdout, stderr: Buffer.alloc(0), timedOut: false })

function recorder(respond: (call: RunCall) => RunResult | Promise<RunResult>) {
  const calls: RunCall[] = []
  const run: FrameRunner = async (command, args, timeoutMs) => {
    const call = { command, args, timeoutMs }
    calls.push(call)
    return respond(call)
  }
  return { run, calls }
}

function ssOf(args: string[]): string | undefined {
  return args[args.indexOf('-ss') + 1]
}

describe('frameBins and frameTimestamps', () => {
  it('splits a 186 s clip into 16 contiguous, non-empty bins rounded to whole seconds', () => {
    const bins = frameBins(186, 16)

    expect(bins).toHaveLength(16)
    expect(bins[0]).toEqual({ startSec: 0, endSec: 12 })
    expect(bins[1]).toEqual({ startSec: 12, endSec: 23 })
    expect(bins.at(-1)).toEqual({ startSec: 174, endSec: 186 })
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].startSec).toBe(bins[i - 1].endSec)
      expect(bins[i].endSec).toBeGreaterThan(bins[i].startSec)
    }
  })

  it('returns fewer bins, all non-empty, when the clip is shorter than the bin count', () => {
    const bins = frameBins(7, 16)

    expect(bins).toHaveLength(7)
    expect(bins[0].startSec).toBe(0)
    expect(bins.at(-1)?.endSec).toBe(7)
    for (const bin of bins) expect(bin.endSec).toBeGreaterThan(bin.startSec)
  })

  it('splits a window into bins covering only that window', () => {
    const bins = frameBins(3000, 8, { startSec: 600, endSec: 720 })

    expect(bins).toHaveLength(8)
    expect(bins[0]).toEqual({ startSec: 600, endSec: 615 })
    expect(bins.at(-1)).toEqual({ startSec: 705, endSec: 720 })
  })

  it('returns no bins for an empty duration or a non-positive count', () => {
    expect(frameBins(0, 4)).toEqual([])
    expect(frameBins(Number.NaN, 4)).toEqual([])
    expect(frameBins(10, 0)).toEqual([])
  })

  it('takes one frame per secondsPerFrame of the watched span, between minFrames and maxFrames', () => {
    const settings = { secondsPerFrame: 4, minFrames: 16, maxFrames: 32 }

    expect(frameCount(7, settings)).toBe(16)
    expect(frameCount(39, settings)).toBe(16)
    expect(frameCount(90, settings)).toBe(23)
    expect(frameCount(128, settings)).toBe(32)
    expect(frameCount(1200, settings)).toBe(32)
  })

  it('places each timestamp at the midpoint of its bin', () => {
    expect(
      frameTimestamps([
        { startSec: 0, endSec: 12 },
        { startSec: 12, endSec: 23 }
      ])
    ).toEqual([6, 17.5])
  })
})

describe('runMediaTool', () => {
  it('captures stdout and the exit code of a finished process', async () => {
    const result = await runMediaTool(process.execPath, ['-e', 'process.stdout.write("hi")'], 10_000)

    expect(result).toEqual({ code: 0, stdout: Buffer.from('hi'), stderr: Buffer.alloc(0), timedOut: false })
  })

  it('keeps only the bounded tail of stderr', async () => {
    const result = await runMediaTool(
      process.execPath,
      ['-e', 'process.stderr.write("x".repeat(5000) + "tail")'],
      10_000
    )

    expect(result.stderr).toHaveLength(4096)
    expect(result.stderr.subarray(-4).toString()).toBe('tail')
  })

  it('kills a process that outlives its timeout', async () => {
    const result = await runMediaTool(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], 200)

    expect(result.timedOut).toBe(true)
    expect(result.code).toBeNull()
  })

  it('treats output past the 8 MiB cap as a failure', async () => {
    const result = await runMediaTool(
      process.execPath,
      ['-e', 'process.stdout.write(Buffer.alloc(9 * 1024 * 1024))'],
      10_000
    )

    expect(result.code).toBeNull()
    expect(result.timedOut).toBe(false)
  })

  it('resolves with a null code instead of rejecting when the binary is missing', async () => {
    const result = await runMediaTool('/nonexistent/rokabot-frames-binary', [], 5_000)

    expect(result).toEqual({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false })
  })
})

describe('probeDurationSec', () => {
  it('runs ffprobe with the protocol whitelist and parses the duration', async () => {
    const { run, calls } = recorder(() => ok(Buffer.from('186.021000\n')))

    const duration = await probeDurationSec(LOCAL, { run, timeoutMs: 9_000 })

    expect(duration).toBe(186.021)
    expect(calls).toEqual([
      {
        command: 'ffprobe',
        args: [
          '-v',
          'error',
          '-protocol_whitelist',
          WHITELIST,
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          '/srv/media/clip.mp4'
        ],
        timeoutMs: 9_000
      }
    ])
  })

  it.each([
    ['empty output', ok(Buffer.from(''))],
    ['garbage output', ok(Buffer.from('N/A'))],
    ['a zero duration', ok(Buffer.from('0.000000\n'))],
    [
      'a non-zero exit',
      { code: 1, stdout: Buffer.from('12.5'), stderr: Buffer.alloc(0), timedOut: false } as RunResult
    ],
    ['a timeout', { code: null, stdout: Buffer.from('12.5'), stderr: Buffer.alloc(0), timedOut: true } as RunResult]
  ])('returns null for %s', async (_label, result) => {
    const { run } = recorder(() => result)

    expect(await probeDurationSec(LOCAL, { run })).toBeNull()
  })

  it('passes headers as one CRLF-terminated block with CR and LF stripped', async () => {
    const { run, calls } = recorder(() => ok(Buffer.from('5\n')))

    await probeDurationSec(
      { input: 'https://cdn.example.com/a.mp4', headers: { Referer: 'https://a.test\r\nX-Evil: 1', Cookie: 'a=b' } },
      { run }
    )

    expect(calls[0].args.slice(0, 6)).toEqual([
      '-v',
      'error',
      '-protocol_whitelist',
      WHITELIST,
      '-headers',
      'Referer: https://a.testX-Evil: 1\r\nCookie: a=b\r\n'
    ])
  })
})

describe('extractFrames', () => {
  it('runs one ffmpeg per timestamp with exact arguments, the whitelist before the input and the default scale', async () => {
    const { run, calls } = recorder(() => ok())

    await extractFrames(LOCAL, [0.5], { run, timeoutMs: 7_000 })

    expect(calls).toEqual([
      {
        command: 'ffmpeg',
        args: [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          WHITELIST,
          '-ss',
          '0.500',
          '-i',
          '/srv/media/clip.mp4',
          '-frames:v',
          '1',
          '-vf',
          'scale=-2:360',
          '-q:v',
          '6',
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          'pipe:1'
        ],
        timeoutMs: 7_000
      }
    ])
  })

  it('uses the requested height and formats seek times to three decimals', async () => {
    const { run, calls } = recorder(() => ok())

    await extractFrames(LOCAL, [2.5], { run, height: 240 })

    expect(calls[0].args).toContain('scale=-2:240')
    expect(ssOf(calls[0].args)).toBe('2.500')
  })

  it('adds sanitized headers before -ss for an https source', async () => {
    const { run, calls } = recorder(() => ok())

    await extractFrames({ input: 'https://cdn.example.com/a.mp4', headers: { 'X-Token': 'a\r\nb' } }, [1], { run })

    const args = calls[0].args
    expect(args.slice(3, 7)).toEqual(['-protocol_whitelist', WHITELIST, '-headers', 'X-Token: ab\r\n'])
    expect(args[args.indexOf('-i') + 1]).toBe('https://cdn.example.com/a.mp4')
  })

  it('returns frames in timestamp order even when they finish out of order', async () => {
    const delays: Record<string, number> = { '1.000': 30, '2.000': 10, '3.000': 0 }
    const { run } = recorder(async ({ args }) => {
      await new Promise((resolve) => setTimeout(resolve, delays[ssOf(args) ?? ''] ?? 0))
      return ok(Buffer.from([0xff, 0xd8, Number(ssOf(args)?.charAt(0))]))
    })

    const frames = await extractFrames(LOCAL, [1, 2, 3], { run, concurrency: 3 })

    expect(frames.map((frame) => frame.atSec)).toEqual([1, 2, 3])
    expect(frames.map((frame) => frame.jpeg[2])).toEqual([1, 2, 3])
  })

  it('never runs more ffmpeg processes at once than the concurrency limit', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const { run } = recorder(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return ok()
    })

    const frames = await extractFrames(LOCAL, [0, 1, 2, 3, 4, 5, 6, 7], { run, concurrency: 2 })

    expect(frames).toHaveLength(8)
    expect(maxInFlight).toBe(2)
  })

  it('skips frames that fail, time out, or return empty or non-JPEG output', async () => {
    const { run } = recorder(({ args }) => {
      switch (ssOf(args)) {
        case '1.000':
          return { code: 1, stdout: JPEG, stderr: Buffer.alloc(0), timedOut: false }
        case '2.000':
          return { code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: true }
        case '3.000':
          return ok(Buffer.from('not a jpeg'))
        case '4.000':
          return ok(Buffer.alloc(0))
        default:
          return ok()
      }
    })

    const frames = await extractFrames(LOCAL, [1, 2, 3, 4, 5], { run })

    expect(frames).toEqual([{ atSec: 5, jpeg: JPEG }])
  })

  it.each([
    'http://cdn.example.com/a.mp4',
    'rtsp://camera.local/stream',
    'file:///srv/media/clip.mp4',
    'clip.mp4',
    './clip.mp4'
  ])('rejects the input %s without running ffmpeg', async (input) => {
    const { run, calls } = recorder(() => ok())

    expect(await extractFrames({ input }, [1], { run })).toEqual([])
    expect(await probeDurationSec({ input }, { run })).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('real ffmpeg', () => {
  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
  let dir = ''
  let clip = ''

  beforeAll(async () => {
    if (!hasFfmpeg) return
    dir = await mkdtemp(join(tmpdir(), 'rokabot-frames-'))
    clip = join(dir, 'clip.mp4')
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=320x240:rate=10', clip])
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it.skipIf(!hasFfmpeg)(
    'probes the duration and extracts one JPEG per timestamp',
    async () => {
      const duration = await probeDurationSec({ input: clip })
      const frames = await extractFrames({ input: clip }, [0.5, 2.5])

      expect(duration).toBeCloseTo(4, 0)
      expect(frames.map((frame) => frame.atSec)).toEqual([0.5, 2.5])
      for (const frame of frames) expect(frame.jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    },
    30_000
  )
})
