import { describe, expect, it, vi } from 'vitest'
import { type QwenFrame, type QwenWatchInput, type QwenWatchSettings, watchFramesWithQwen } from '../qwenWatch.js'
import type { MediaClip, MediaObservations } from '../types.js'

vi.mock('../../../config.js', () => ({
  config: {
    gemini: { apiKey: 'test-key', model: 'test-model', safetyThreshold: 'OFF' },
    media: { digestMaxOutputTokens: 1200, watchTimeoutMs: 20_000 }
  }
}))

interface RecordedCall {
  url: string
  init: RequestInit
}

interface RequestBody {
  model: string
  messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }>
  temperature: number
  max_tokens: number
  enable_thinking: boolean
  stream: boolean
  response_format: { type: string }
}

const bins: MediaClip[] = [
  { startSec: 0, endSec: 10 },
  { startSec: 10, endSec: 20 }
]

const frames: QwenFrame[] = [
  { atSec: 5, jpeg: Buffer.from([0xff, 0xd8, 0x01]) },
  { atSec: 15, jpeg: Buffer.from([0xff, 0xd8, 0x02]) }
]

function observations(overrides: Partial<MediaObservations> = {}): MediaObservations {
  return {
    summary: 'A cook slices onions in a bright kitchen.',
    timeline: [
      { bin: 1, visual: 'Onions on a board.', audio: '' },
      { bin: 2, visual: 'The knife lifts.', audio: '' }
    ],
    speech: [],
    onScreenText: [{ bin: 2, text: 'Step 2' }],
    moments: [{ bin: 2, note: 'A clean cut.' }],
    style: 'Static shot, no music.',
    uncertainties: ['The pan is off screen.'],
    ...overrides
  }
}

function completion(content: string | null | undefined) {
  return { choices: [{ message: { content } }] }
}

function okResponse(content = JSON.stringify(observations())): Response {
  return new Response(JSON.stringify(completion(content)), { status: 200 })
}

function input(overrides: Partial<QwenWatchInput> = {}): QwenWatchInput {
  return {
    frames,
    bins,
    durationSec: 20,
    label: 'YouTube video',
    focus: 'what is she cutting?',
    mode: 'whole',
    ...overrides
  }
}

function settings(overrides: Partial<QwenWatchSettings> = {}): QwenWatchSettings {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://modelscope.test/v1/',
    model: 'Qwen/Qwen3-VL-test',
    timeoutMs: 5_000,
    maxOutputTokens: 900,
    ...overrides
  }
}

function fakeFetch(respond: (init: RequestInit) => Response | Promise<Response> = () => okResponse()) {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond(init ?? {})
  }) as typeof fetch
  return { fetchImpl, calls }
}

function requestBody(call: RecordedCall): RequestBody {
  return JSON.parse(String(call.init.body)) as RequestBody
}

function promptText(call: RecordedCall): string {
  const content = requestBody(call).messages[0].content
  return content.at(-1)?.text ?? ''
}

describe('watchFramesWithQwen request', () => {
  it('posts one chat completion to the OpenAI-compatible endpoint with the ModelScope body', async () => {
    const { fetchImpl, calls } = fakeFetch()

    await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://modelscope.test/v1/chat/completions')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    const body = requestBody(calls[0])
    expect(body).toMatchObject({
      model: 'Qwen/Qwen3-VL-test',
      temperature: 0,
      max_tokens: 900,
      enable_thinking: false,
      stream: false,
      response_format: { type: 'json_object' }
    })
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
  })

  it('sends each frame as a labelled text part followed by a JPEG data URI', async () => {
    const { fetchImpl, calls } = fakeFetch()

    await watchFramesWithQwen(input(), settings({ fetchImpl }))

    const content = requestBody(calls[0]).messages[0].content
    const images = content.filter((part) => part.type === 'image_url')
    expect(images).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'Frame 1 (bin 1) at 0:05' })
    expect(content[1].type).toBe('image_url')
    expect(content[2]).toEqual({ type: 'text', text: 'Frame 2 (bin 2) at 0:15' })
    expect(content[3].type).toBe('image_url')
    for (const [index, image] of images.entries()) {
      const url = image.image_url?.url ?? ''
      expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
      expect(Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64')).toEqual(frames[index].jpeg)
    }
  })

  it('states the shared watch instructions, the no-sound rule and the JSON shape in the closing text', async () => {
    const { fetchImpl, calls } = fakeFetch()

    await watchFramesWithQwen(input(), settings({ fetchImpl }))

    const text = promptText(calls[0])
    expect(text).toContain('Bin 1: 0:00–0:10')
    expect(text).toContain('Bin 2: 0:10–0:20')
    expect(text).toContain('still frames, one per bin, in order')
    expect(text).toContain("every timeline `audio` must be '' and `speech` must be empty")
    expect(text).toContain(
      '{"summary": string, "timeline": [{"bin": int, "visual": string, "audio": string}], "speech": [], "onScreenText": [{"bin": int, "text": string}], "moments": [{"bin": int, "note": string}], "style": string, "uncertainties": [string]}'
    )
    expect(text).toContain('Reply with that JSON object only.')
    expect(text).toContain('what is she cutting?')
    expect(text).not.toContain('This part covers')
  })

  it('passes the post context as untrusted text only when it is given', async () => {
    const withContext = fakeFetch()
    await watchFramesWithQwen(
      input({ context: 'Knife skills, part 3' }),
      settings({ fetchImpl: withContext.fetchImpl })
    )
    expect(promptText(withContext.calls[0])).toContain('Knife skills, part 3')

    const without = fakeFetch()
    await watchFramesWithQwen(input(), settings({ fetchImpl: without.fetchImpl }))
    expect(promptText(without.calls[0])).not.toContain('Knife skills')
  })

  it('limits the instructions to the focus window when watching a focused part', async () => {
    const { fetchImpl, calls } = fakeFetch()

    await watchFramesWithQwen(input({ mode: 'focus', focusSec: 15 }), settings({ fetchImpl }))

    expect(promptText(calls[0])).toContain('This part covers 0:00–0:20 of a longer video')
  })
})

describe('watchFramesWithQwen result', () => {
  it('builds a video digest from the frames and the validated observations', async () => {
    const { fetchImpl } = fakeFetch()

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.watchMs).toBeGreaterThanOrEqual(0)
    expect(result.digest).toEqual({
      kind: 'video',
      label: 'YouTube video',
      durationSec: 20,
      mode: 'whole',
      fps: null,
      frames: 2,
      heard: 'none',
      bins,
      observations: observations(),
      incomplete: false
    })
    expect(result.digest).not.toHaveProperty('focusSec')
  })

  it('records the focus moment on a focused digest', async () => {
    const { fetchImpl } = fakeFetch()

    const result = await watchFramesWithQwen(input({ mode: 'focus', focusSec: 15 }), settings({ fetchImpl }))

    expect(result.status === 'ok' && result.digest).toMatchObject({ mode: 'focus', focusSec: 15 })
  })

  it('accepts a JSON reply wrapped in a fence', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(observations())}\n\`\`\``
    const { fetchImpl } = fakeFetch(() => okResponse(fenced))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result.status === 'ok' && result.digest.observations.summary).toBe(observations().summary)
  })

  it('drops an observation whose bin is outside the watched bins and marks the digest incomplete', async () => {
    const reply = observations({
      timeline: [
        { bin: 1, visual: 'Onions on a board.', audio: '' },
        { bin: 3, visual: 'Out of range.', audio: '' }
      ]
    })
    const { fetchImpl } = fakeFetch(() => okResponse(JSON.stringify(reply)))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result.status === 'ok' && result.digest.observations.timeline).toEqual([
      { bin: 1, visual: 'Onions on a board.', audio: '' }
    ])
    expect(result.status === 'ok' && result.digest.incomplete).toBe(true)
  })
})

describe('watchFramesWithQwen failures', () => {
  it.each([401, 403, 404])('maps HTTP %i to unavailable', async (status) => {
    const { fetchImpl } = fakeFetch(() => new Response('nope', { status }))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'unavailable' })
  })

  it.each([429, 500, 503])('maps HTTP %i to overloaded', async (status) => {
    const { fetchImpl } = fakeFetch(() => new Response('busy', { status }))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'overloaded' })
  })

  it('maps other non-OK statuses and a thrown fetch to error', async () => {
    const badRequest = fakeFetch(() => new Response('bad', { status: 400 }))
    expect(await watchFramesWithQwen(input(), settings({ fetchImpl: badRequest.fetchImpl }))).toMatchObject({
      status: 'failed',
      reason: 'error'
    })

    const thrown = fakeFetch(() => Promise.reject(new TypeError('fetch failed')))
    expect(await watchFramesWithQwen(input(), settings({ fetchImpl: thrown.fetchImpl }))).toMatchObject({
      status: 'failed',
      reason: 'error'
    })
  })

  it('maps a timeout to timeout', async () => {
    const hangs = fakeFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl: hangs.fetchImpl, timeoutMs: 10 }))

    expect(result).toMatchObject({ status: 'failed', reason: 'timeout' })
  })

  it('maps a caller abort to timeout', async () => {
    const hangs = fakeFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const controller = new AbortController()
    const pending = watchFramesWithQwen(input({ signal: controller.signal }), settings({ fetchImpl: hangs.fetchImpl }))
    controller.abort()

    expect(await pending).toMatchObject({ status: 'failed', reason: 'timeout' })
  })

  it.each([
    ['no choices', { choices: [] }],
    ['empty content', completion('   ')],
    ['null content', completion(null)],
    ['content that is not JSON', completion('Here is my answer: not json')],
    ['JSON without a summary', completion(JSON.stringify({ timeline: [] }))]
  ])('maps a reply with %s to invalid', async (_label, body) => {
    const { fetchImpl } = fakeFetch(() => new Response(JSON.stringify(body), { status: 200 }))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'invalid' })
  })

  it('maps a response body that is not JSON to invalid', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('<html>gateway</html>', { status: 200 }))

    const result = await watchFramesWithQwen(input(), settings({ fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'invalid' })
  })

  it('reports unavailable without calling fetch when the API key is missing', async () => {
    const { fetchImpl, calls } = fakeFetch()

    const result = await watchFramesWithQwen(input(), settings({ apiKey: undefined, fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'unavailable' })
    expect(calls).toHaveLength(0)
  })

  it('reports unavailable without calling fetch when there are no frames', async () => {
    const { fetchImpl, calls } = fakeFetch()

    const result = await watchFramesWithQwen(input({ frames: [] }), settings({ fetchImpl }))

    expect(result).toMatchObject({ status: 'failed', reason: 'unavailable' })
    expect(calls).toHaveLength(0)
  })
})
