import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Embedder } from '../embedder.js'
import { MAX_BODY_BYTES, MAX_TEXTS, createHandler } from '../handler.js'

const MODEL = 'Xenova/multilingual-e5-small@761b726d-q8'

let server: Server | undefined

async function start(embedder: Embedder) {
  const log = vi.fn()
  server = createServer(createHandler({ embedder, model: MODEL, dim: 3, log }))
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, log }
}

function fixedEmbedder(tokenCounts?: number[]): Embedder & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async embed(texts) {
      calls.push(texts)
      return { vectors: texts.map(() => [1, 0, 0]), tokenCounts: tokenCounts ?? texts.map(() => 4) }
    }
  }
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe('embedding sidecar handler', () => {
  it('reports its model and dimension on /health', async () => {
    const { url } = await start(fixedEmbedder())

    const response = await fetch(`${url}/health`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, model: MODEL, dim: 3 })
  })

  it.each([
    ['document', 'passage: '],
    ['query', 'query: ']
  ])('gives %s texts their E5 prefix and returns one vector per text', async (role, prefix) => {
    const embedder = fixedEmbedder()
    const { url } = await start(embedder)

    const response = await post(url, { texts: ['We planned a picnic.', 'Ramen night'], role })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      model: MODEL,
      dim: 3,
      vectors: [
        [1, 0, 0],
        [1, 0, 0]
      ],
      truncated: [false, false]
    })
    expect(embedder.calls).toEqual([[`${prefix}We planned a picnic.`, `${prefix}Ramen night`]])
  })

  it('marks and logs each text past 512 tokens without logging the text', async () => {
    const { url, log } = await start(fixedEmbedder([600, 12]))

    const response = await post(url, { texts: ['a secret, very long summary', 'short'], role: 'document' })

    await expect(response.json()).resolves.toMatchObject({ truncated: [true, false] })
    expect(log).toHaveBeenCalledWith('info', 'Input truncated to the model limit', {
      role: 'document',
      tokens: 600,
      limit: 512
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
  })

  it.each([
    ['a non-JSON body', 'not json', 'body must be JSON'],
    ['a null body', 'null', 'body must be a JSON object'],
    ['a missing role', { texts: ['x'] }, 'role must be query or document'],
    ['an unknown role', { texts: ['x'], role: 'summary' }, 'role must be query or document'],
    ['no texts', { texts: [], role: 'query' }, `texts must be 1 to ${MAX_TEXTS} strings`],
    ['a non-string text', { texts: [42], role: 'query' }, `texts must be 1 to ${MAX_TEXTS} strings`],
    [
      'too many texts',
      { texts: Array(MAX_TEXTS + 1).fill('x'), role: 'query' },
      `texts must be 1 to ${MAX_TEXTS} strings`
    ]
  ])('rejects %s with 400', async (_label, body, error) => {
    const embedder = fixedEmbedder()
    const { url } = await start(embedder)

    const response = await post(url, body)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
    expect(embedder.calls).toEqual([])
  })

  it('rejects a body over the size cap with 413', async () => {
    const { url } = await start(fixedEmbedder())

    const response = await post(url, { texts: ['x'.repeat(MAX_BODY_BYTES)], role: 'document' })

    expect(response.status).toBe(413)
  })

  it('runs one inference at a time', async () => {
    let active = 0
    let peak = 0
    const embedder: Embedder = {
      async embed(texts) {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 20))
        active -= 1
        return { vectors: texts.map(() => [1, 0, 0]), tokenCounts: texts.map(() => 1) }
      }
    }
    const { url } = await start(embedder)

    const replies = await Promise.all([1, 2, 3].map((n) => post(url, { texts: [`text ${n}`], role: 'query' })))

    expect(replies.map(({ status }) => status)).toEqual([200, 200, 200])
    expect(peak).toBe(1)
  })

  it('answers 500 when the model fails, then keeps serving', async () => {
    let fail = true
    const embedder: Embedder = {
      async embed(texts) {
        if (fail) {
          fail = false
          throw new Error('onnx failed')
        }
        return { vectors: texts.map(() => [1, 0, 0]), tokenCounts: texts.map(() => 1) }
      }
    }
    const { url, log } = await start(embedder)

    expect((await post(url, { texts: ['x'], role: 'query' })).status).toBe(500)
    expect((await post(url, { texts: ['x'], role: 'query' })).status).toBe(200)
    expect(log).toHaveBeenCalledWith('error', 'Embedding failed', { error: 'onnx failed' })
  })

  it('answers 500 when the model returns the wrong dimension', async () => {
    const embedder: Embedder = {
      async embed(texts) {
        return { vectors: texts.map(() => [1, 0]), tokenCounts: texts.map(() => 1) }
      }
    }
    const { url } = await start(embedder)

    expect((await post(url, { texts: ['x'], role: 'query' })).status).toBe(500)
  })

  it('answers 404 for anything else', async () => {
    const { url } = await start(fixedEmbedder())

    expect((await fetch(`${url}/embed`)).status).toBe(404)
    expect((await fetch(`${url}/other`, { method: 'POST', body: '{}' })).status).toBe(404)
  })
})
