import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type FrameRunner, PROTOCOL_WHITELIST } from '../frames.js'
import {
  type TranscriberSettings,
  audioWindows,
  extractAudioWav,
  postTranscription,
  transcribeSource
} from '../transcribe.js'

type RunResult = Awaited<ReturnType<FrameRunner>>
interface RunCall {
  command: string
  args: string[]
  timeoutMs: number
}

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)])

function fakeRun(respond: (call: RunCall) => RunResult = () => ({ code: 0, stdout: WAV, timedOut: false })) {
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

interface FetchCall {
  url: string
  init: RequestInit
}

function fakeFetch(respond: (call: FetchCall, index: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return respond(call, calls.length - 1)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function transcriptBody(overrides: Record<string, unknown> = {}) {
  return {
    language: 'en',
    engine: 'moonshine',
    speechSec: 2,
    segments: [{ start: 0.5, end: 1.5, text: ' hello ' }],
    ...overrides
  }
}

function settingsFor(fetchImpl: typeof fetch, overrides: Partial<TranscriberSettings> = {}): TranscriberSettings {
  return { url: 'http://sidecar:8080', timeoutMs: 60_000, maxSpeechSec: 120, fetchImpl, ...overrides }
}

describe('audioWindows', () => {
  it('returns the whole video when it fits the audio budget', () => {
    expect(audioWindows(90.4, 120)).toEqual([{ startSec: 0, endSec: 90 }])
  })

  it('samples four windows centred on the quarters of a long video', () => {
    expect(audioWindows(1200, 120)).toEqual([
      { startSec: 135, endSec: 165 },
      { startSec: 435, endSec: 465 },
      { startSec: 735, endSec: 765 },
      { startSec: 1035, endSec: 1065 }
    ])
  })

  it('clamps a focus window to the video', () => {
    expect(audioWindows(100, 120, { startSec: 95, endSec: 140 })).toEqual([{ startSec: 95, endSec: 100 }])
    expect(audioWindows(100, 120, { startSec: -5, endSec: 10 })).toEqual([{ startSec: 0, endSec: 10 }])
  })

  it('returns no windows for a focus window entirely outside the video', () => {
    expect(audioWindows(100, 120, { startSec: 200, endSec: 210 })).toEqual([])
  })
})

describe('extractAudioWav', () => {
  it('runs ffmpeg with the whitelist, headers, seek and output format', async () => {
    const { run, calls } = fakeRun()
    const wav = await extractAudioWav(
      { input: '/videos/a.mp4', headers: { Referer: 'https://example.com/' } },
      { startSec: 1.5, endSec: 3.25 },
      { run }
    )

    expect(wav).toEqual(WAV)
    expect(calls).toEqual([
      {
        command: 'ffmpeg',
        args: [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          PROTOCOL_WHITELIST,
          '-headers',
          'Referer: https://example.com/\r\n',
          '-ss',
          '1.500',
          '-t',
          '1.750',
          '-i',
          '/videos/a.mp4',
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
        timeoutMs: 20_000
      }
    ])
  })

  it('omits header args when there are no headers and honours the timeout option', async () => {
    const { run, calls } = fakeRun()
    await extractAudioWav({ input: '/videos/a.mp4' }, { startSec: 0, endSec: 2 }, { run, timeoutMs: 5000 })

    expect(calls[0].args).not.toContain('-headers')
    expect(calls[0].timeoutMs).toBe(5000)
  })

  it.each([
    ['http:// input', 'http://example.com/a.mp4'],
    ['relative path', 'videos/a.mp4']
  ])('rejects %s without running ffmpeg', async (_label, input) => {
    const { run, calls } = fakeRun()
    expect(await extractAudioWav({ input }, { startSec: 0, endSec: 2 }, { run })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['non-zero exit', { code: 1, stdout: WAV, timedOut: false }],
    ['timeout', { code: null, stdout: Buffer.alloc(0), timedOut: true }],
    ['non-RIFF output', { code: 0, stdout: Buffer.from('ID3\0\0\0\0\0\0'), timedOut: false }],
    ['truncated output', { code: 0, stdout: Buffer.from('RIF'), timedOut: false }],
    ['empty output', { code: 0, stdout: Buffer.alloc(0), timedOut: false }]
  ] as const)('returns null on %s', async (_label, result) => {
    const { run } = fakeRun(() => ({ ...result, stdout: Buffer.from(result.stdout) }))
    expect(await extractAudioWav({ input: '/videos/a.mp4' }, { startSec: 0, endSec: 2 }, { run })).toBeNull()
  })
})

describe('postTranscription', () => {
  const wav = WAV

  it('reports disabled without sending anything when the url is empty', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(transcriptBody()))
    expect(await postTranscription(wav, settingsFor(fetchImpl, { url: '' }))).toEqual({ reason: 'disabled' })
    expect(calls).toHaveLength(0)
  })

  it('posts the WAV bytes with maxSpeechSec in the query and returns a cleaned transcript', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(transcriptBody()))
    const result = await postTranscription(wav, settingsFor(fetchImpl))

    expect(result).toEqual({
      language: 'en',
      engine: 'moonshine',
      speechSec: 2,
      segments: [{ startSec: 0.5, endSec: 1.5, text: 'hello' }]
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://sidecar:8080/transcribe?maxSpeechSec=120')
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe('audio/wav')
    expect(Buffer.from(calls[0].init.body as Uint8Array).equals(wav)).toBe(true)
  })

  it('does not double the slash when the base url ends with one', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(transcriptBody()))
    await postTranscription(wav, settingsFor(fetchImpl, { url: 'http://sidecar:8080/' }))
    expect(calls[0].url).toBe('http://sidecar:8080/transcribe?maxSpeechSec=120')
  })

  it('maps a non-OK status to http_<status>', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('busy', { status: 503 }))
    expect(await postTranscription(wav, settingsFor(fetchImpl))).toEqual({ reason: 'http_503' })
  })

  it('maps an aborted request to timeout', async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new DOMException('aborted', 'AbortError')))
    expect(await postTranscription(wav, settingsFor(fetchImpl))).toEqual({ reason: 'timeout' })
  })

  it('times out a request that never answers', async () => {
    const { fetchImpl } = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    expect(await postTranscription(wav, settingsFor(fetchImpl, { timeoutMs: 10 }))).toEqual({ reason: 'timeout' })
  })

  it('maps a caller abort to timeout', async () => {
    const { fetchImpl } = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const controller = new AbortController()
    const pending = postTranscription(wav, settingsFor(fetchImpl), controller.signal)
    controller.abort()
    expect(await pending).toEqual({ reason: 'timeout' })
  })

  it('maps a network failure to unreachable', async () => {
    const { fetchImpl } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')))
    expect(await postTranscription(wav, settingsFor(fetchImpl))).toEqual({ reason: 'unreachable' })
  })

  it.each([
    ['not JSON', new Response('not json', { status: 200 })],
    ['null body', json(null)],
    ['missing segments', json({ language: 'en', engine: 'none', speechSec: 0 })],
    ['non-numeric speechSec', json(transcriptBody({ speechSec: 'two' }))],
    ['non-string language', json(transcriptBody({ language: 3 }))]
  ])('maps a %s body to invalid', async (_label, response) => {
    const { fetchImpl } = fakeFetch(() => response)
    expect(await postTranscription(wav, settingsFor(fetchImpl))).toEqual({ reason: 'invalid' })
  })

  it('keeps only segments with finite ordered times and non-empty text', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(
        transcriptBody({
          segments: [
            { start: 0, end: 1, text: 'ok' },
            { start: 2, end: 1, text: 'backwards' },
            { start: null, end: 1, text: 'no start' },
            { start: 3, end: 4, text: '   ' },
            { start: 4, end: 5, text: 42 },
            { start: 5, end: 6, text: '  kept  ' }
          ]
        })
      )
    )
    const result = await postTranscription(wav, settingsFor(fetchImpl))
    expect(result).toMatchObject({
      segments: [
        { startSec: 0, endSec: 1, text: 'ok' },
        { startSec: 5, endSec: 6, text: 'kept' }
      ]
    })
  })
})

describe('transcribeSource', () => {
  it('shifts each window to absolute time and merges the segments in order', async () => {
    const { run } = fakeRun()
    const { fetchImpl, calls } = fakeFetch((_call, index) => {
      return index === 0
        ? json(
            transcriptBody({
              language: 'en',
              engine: 'moonshine',
              speechSec: 2,
              segments: [
                { start: 0, end: 1, text: 'a' },
                { start: 2, end: 3, text: 'b' }
              ]
            })
          )
        : json(
            transcriptBody({
              language: 'ja',
              engine: 'sensevoice',
              speechSec: 3,
              segments: [{ start: 5, end: 6, text: 'c' }]
            })
          )
    })
    const windows = [
      { startSec: 10, endSec: 20 },
      { startSec: 100, endSec: 130 }
    ]

    const result = await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl), { run })

    expect(result).toEqual({
      language: 'ja',
      engine: 'sensevoice',
      speechSec: 5,
      segments: [
        { startSec: 10, endSec: 11, text: 'a' },
        { startSec: 12, endSec: 13, text: 'b' },
        { startSec: 105, endSec: 106, text: 'c' }
      ]
    })
    expect(calls.map((call) => call.url)).toEqual([
      'http://sidecar:8080/transcribe?maxSpeechSec=60',
      'http://sidecar:8080/transcribe?maxSpeechSec=60'
    ])
  })

  it('floors the per-window speech budget at 10 seconds', async () => {
    const { run } = fakeRun()
    const { fetchImpl, calls } = fakeFetch(() => json(transcriptBody({ segments: [] })))
    const windows = Array.from({ length: 8 }, (_, i) => ({ startSec: i * 10, endSec: i * 10 + 5 }))

    await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl, { maxSpeechSec: 40 }), { run })

    expect(calls).toHaveLength(8)
    expect(calls[0].url).toBe('http://sidecar:8080/transcribe?maxSpeechSec=10')
  })

  it('returns what succeeded when some windows fail', async () => {
    const { run } = fakeRun((call) =>
      ssOf(call.args) === '10.000'
        ? { code: 1, stdout: Buffer.alloc(0), timedOut: false }
        : { code: 0, stdout: WAV, timedOut: false }
    )
    const { fetchImpl } = fakeFetch((_call, index) =>
      index === 0
        ? json(transcriptBody({ segments: [{ start: 0, end: 1, text: 'heard' }] }))
        : new Response('', { status: 500 })
    )
    const windows = [
      { startSec: 10, endSec: 20 },
      { startSec: 40, endSec: 50 },
      { startSec: 70, endSec: 80 }
    ]

    const result = await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl), { run })

    expect(result).toMatchObject({ segments: [{ startSec: 40, endSec: 41, text: 'heard' }] })
  })

  it('returns the first failure reason when every window fails', async () => {
    const { run } = fakeRun()
    const { fetchImpl } = fakeFetch(() => new Response('', { status: 503 }))
    const windows = [
      { startSec: 10, endSec: 20 },
      { startSec: 40, endSec: 50 }
    ]
    expect(await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl), { run })).toEqual({
      reason: 'http_503'
    })
  })

  it('reports no_audio when no window yields a WAV', async () => {
    const { run } = fakeRun(() => ({ code: 1, stdout: Buffer.alloc(0), timedOut: false }))
    const { fetchImpl, calls } = fakeFetch(() => json(transcriptBody()))
    const windows = [
      { startSec: 10, endSec: 20 },
      { startSec: 40, endSec: 50 }
    ]
    expect(await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl), { run })).toEqual({
      reason: 'no_audio'
    })
    expect(calls).toHaveLength(0)
  })

  it('stops taking windows once the deadline has passed, keeping what was heard', async () => {
    const { run, calls: runs } = fakeRun()
    const controller = new AbortController()
    const { fetchImpl } = fakeFetch(() => {
      controller.abort()
      return json(transcriptBody())
    })
    const windows = [
      { startSec: 10, endSec: 20 },
      { startSec: 40, endSec: 50 }
    ]
    const result = await transcribeSource({ input: '/videos/a.mp4' }, windows, settingsFor(fetchImpl), {
      run,
      signal: controller.signal
    })
    expect(runs).toHaveLength(1)
    expect(result).not.toHaveProperty('reason')
  })

  it('reports no_audio when given no windows', async () => {
    const { run } = fakeRun()
    const { fetchImpl } = fakeFetch(() => json(transcriptBody()))
    expect(await transcribeSource({ input: '/videos/a.mp4' }, [], settingsFor(fetchImpl), { run })).toEqual({
      reason: 'no_audio'
    })
  })
})

describe('extractAudioWav with real ffmpeg', () => {
  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
  let dir: string

  beforeAll(async () => {
    if (!hasFfmpeg) return
    dir = await mkdtemp(join(tmpdir(), 'transcribe-'))
    const made = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', join(dir, 'a.mp4')])
    expect(made.status).toBe(0)
  })

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it.skipIf(!hasFfmpeg)('extracts a RIFF WAV from a local clip', async () => {
    const wav = await extractAudioWav({ input: join(dir, 'a.mp4') }, { startSec: 0, endSec: 2 })
    expect(wav).not.toBeNull()
    expect(wav?.subarray(0, 4).toString('ascii')).toBe('RIFF')
  })
})
