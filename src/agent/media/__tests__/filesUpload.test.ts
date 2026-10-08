import { describe, expect, it, vi } from 'vitest'
import { deleteFile, streamToFiles } from '../filesUpload.js'

vi.mock('../../../config.js', () => ({
  config: { gemini: { apiKey: 'test-key' } }
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { warn: vi.fn() }
}))

const API = 'https://generativelanguage.googleapis.com'
const START_URL = `${API}/upload/v1beta/files`
const UPLOAD_URL = `${API}/upload/v1beta/files?upload_id=abc`
const SOURCE_URL = 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=1'
const FILE_NAME = 'files/xyz'
const FILE_URL = `${API}/v1beta/${FILE_NAME}`
const URI = `${API}/v1beta/files/xyz`

type Handler = (url: string, init: RequestInit & { duplex?: 'half' }) => Promise<Response>

function createFetcher(handle: Handler) {
  const calls: Array<{ url: string; init: RequestInit & { duplex?: 'half' } }> = []
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const options = init ?? {}
    calls.push({ url, init: options })
    return handle(url, options)
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

function sourceBody(chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let next = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next === chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[next]))
      next += 1
    },
    cancel() {
      onCancel?.()
    }
  })
}

async function readAll(body: RequestInit['body']): Promise<Buffer> {
  const reader = (body as ReadableStream<Uint8Array>).getReader()
  const parts: Uint8Array[] = []
  let chunk = await reader.read()
  while (!chunk.done) {
    parts.push(chunk.value)
    chunk = await reader.read()
  }
  return Buffer.concat(parts)
}

function fileResource(overrides: Record<string, unknown> = {}) {
  return { name: FILE_NAME, uri: URI, mimeType: 'video/mp4', state: 'PROCESSING', ...overrides }
}

function startResponse(): Response {
  return new Response(null, { status: 200, headers: { 'x-goog-upload-url': UPLOAD_URL } })
}

function isDelete(call: { init: RequestInit }): boolean {
  return call.init.method === 'DELETE'
}

describe('streamToFiles', () => {
  it('streams the body, polls until ACTIVE and returns the uri and video duration', async () => {
    let polls = 0
    let uploaded: Buffer | undefined
    const { fetcher, calls } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc', 'defg']), { status: 200 })
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        uploaded = await readAll(init.body)
        return Response.json({ file: fileResource() })
      }
      if (url === FILE_URL) {
        polls += 1
        return Response.json(
          polls === 1
            ? fileResource({ state: 'PROCESSING' })
            : fileResource({ state: 'ACTIVE', videoMetadata: { videoDuration: '10.5s' } })
        )
      }
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 5000,
      pollIntervalMs: 1,
      fetcher
    })

    expect(result).toEqual({ name: FILE_NAME, uri: URI, mimeType: 'video/mp4', durationSec: 10.5 })
    expect(uploaded?.toString()).toBe('abcdefg')

    const start = calls.find((call) => call.url === START_URL)
    expect(start?.init.method).toBe('POST')
    expect(start?.init.headers).toEqual({
      'x-goog-api-key': 'test-key',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': '7',
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'Content-Type': 'application/json'
    })
    expect(JSON.parse(String(start?.init.body))).toEqual({ file: { display_name: 'rokabot-media' } })

    const upload = calls.find((call) => call.url === UPLOAD_URL)
    expect(upload?.init.method).toBe('POST')
    expect(upload?.init.duplex).toBe('half')
    expect(upload?.init.headers).toEqual({
      'Content-Length': '7',
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    })

    const pollCalls = calls.filter((call) => call.url === FILE_URL)
    expect(pollCalls).toHaveLength(2)
    expect(pollCalls[0].init.headers).toEqual({ 'x-goog-api-key': 'test-key' })
    expect(calls.some(isDelete)).toBe(false)
  })

  it('returns a null duration when the file carries no video metadata', async () => {
    const { fetcher } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc']), { status: 200 })
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        await readAll(init.body)
        return Response.json({ file: fileResource({ state: 'ACTIVE', mimeType: 'audio/ogg' }) })
      }
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'audio/ogg',
      size: 3,
      deadlineMs: 5000,
      fetcher
    })

    expect(result).toEqual({ name: FILE_NAME, uri: URI, mimeType: 'audio/ogg', durationSec: null })
  })

  it('returns null without starting an upload when the source responds with an error', async () => {
    const { fetcher, calls } = createFetcher(async (url) => {
      if (url === SOURCE_URL) return new Response('gone', { status: 404 })
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 5000,
      fetcher
    })

    expect(result).toBeNull()
    expect(calls.map((call) => call.url)).toEqual([SOURCE_URL])
  })

  it('stops reading the source when the upload cannot start', async () => {
    const { fetcher, calls } = createFetcher(async (url) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc', 'defg']), { status: 200 })
      return new Response('nope', { status: 500 })
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 5000,
      fetcher
    })

    expect(result).toBeNull()
    expect(calls[0].init.signal?.aborted).toBe(true)
  })

  it('aborts the upload when the body runs past its stated size and creates nothing to delete', async () => {
    let sourceCancelled = false
    const { fetcher, calls } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) {
        return new Response(
          sourceBody(['abc', 'defgh', 'ijk'], () => {
            sourceCancelled = true
          }),
          { status: 200 }
        )
      }
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        await readAll(init.body)
        return Response.json({ file: fileResource({ state: 'ACTIVE' }) })
      }
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 6,
      deadlineMs: 5000,
      fetcher
    })

    expect(result).toBeNull()
    expect(sourceCancelled).toBe(true)
    expect(calls.some((call) => call.url === FILE_URL || isDelete(call))).toBe(false)
  })

  it('aborts the upload when the body ends short of its stated size', async () => {
    const { fetcher, calls } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc']), { status: 200 })
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        await readAll(init.body)
        return Response.json({ file: fileResource({ state: 'ACTIVE' }) })
      }
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 5000,
      fetcher
    })

    expect(result).toBeNull()
    expect(calls.some((call) => call.url === FILE_URL || isDelete(call))).toBe(false)
  })

  it('deletes the file and returns null when processing fails', async () => {
    const { fetcher, calls } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc', 'defg']), { status: 200 })
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        await readAll(init.body)
        return Response.json({ file: fileResource() })
      }
      if (url === FILE_URL && init.method !== 'DELETE') return Response.json(fileResource({ state: 'FAILED' }))
      if (url === FILE_URL && init.method === 'DELETE') return new Response(null, { status: 200 })
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 5000,
      pollIntervalMs: 1,
      fetcher
    })

    expect(result).toBeNull()
    const deletes = calls.filter(isDelete)
    expect(deletes.map((call) => call.url)).toEqual([FILE_URL])
    expect(deletes[0].init.headers).toEqual({ 'x-goog-api-key': 'test-key' })
  })

  it('deletes the file and returns null when the deadline passes before ACTIVE', async () => {
    const { fetcher, calls } = createFetcher(async (url, init) => {
      if (url === SOURCE_URL) return new Response(sourceBody(['abc', 'defg']), { status: 200 })
      if (url === START_URL) return startResponse()
      if (url === UPLOAD_URL) {
        await readAll(init.body)
        return Response.json({ file: fileResource() })
      }
      if (url === FILE_URL && init.method !== 'DELETE') return Response.json(fileResource({ state: 'PROCESSING' }))
      if (url === FILE_URL && init.method === 'DELETE') return new Response(null, { status: 200 })
      throw new Error(`unexpected request ${url}`)
    })

    const result = await streamToFiles({
      sourceUrl: SOURCE_URL,
      mimeType: 'video/mp4',
      size: 7,
      deadlineMs: 50,
      pollIntervalMs: 5,
      fetcher
    })

    expect(result).toBeNull()
    expect(calls.filter(isDelete).map((call) => call.url)).toEqual([FILE_URL])
  })
})

describe('deleteFile', () => {
  it('sends a DELETE for the file name', async () => {
    const { fetcher, calls } = createFetcher(async () => new Response(null, { status: 200 }))

    await deleteFile(FILE_NAME, fetcher)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(FILE_URL)
    expect(calls[0].init.method).toBe('DELETE')
  })

  it('swallows a rejected request', async () => {
    const { fetcher } = createFetcher(async () => {
      throw new Error('network down')
    })

    await expect(deleteFile(FILE_NAME, fetcher)).resolves.toBeUndefined()
  })

  it('swallows an error status', async () => {
    const { fetcher } = createFetcher(async () => new Response('nope', { status: 500 }))

    await expect(deleteFile(FILE_NAME, fetcher)).resolves.toBeUndefined()
  })
})
