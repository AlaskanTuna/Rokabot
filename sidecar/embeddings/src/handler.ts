import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Embedder } from './embedder.js'

export const MAX_TOKENS = 512
// The ONNX arena grows with the batch and never shrinks: on a Pi 5, 4 × 512 tokens peaked at 797 MiB and 16 × 512 was
// OOM-killed at the 1 GiB cap (2026-10-12). The bot sends one text per request.
export const MAX_TEXTS = 4
export const MAX_BODY_BYTES = 1_048_576

const PREFIXES = { query: 'query: ', document: 'passage: ' } as const

type Role = keyof typeof PREFIXES
type Reply = { status: number; body: unknown }

export type Log = (level: 'info' | 'error', message: string, fields?: Record<string, unknown>) => void

export interface HandlerOptions {
  embedder: Embedder
  model: string
  dim: number
  log: Log
}

function parseEmbedRequest(body: unknown): { texts: string[]; role: Role } | string {
  if (typeof body !== 'object' || body === null) return 'body must be a JSON object'
  const { texts, role } = body as Record<string, unknown>
  if (role !== 'query' && role !== 'document') return 'role must be query or document'
  if (
    !Array.isArray(texts) ||
    texts.length === 0 ||
    texts.length > MAX_TEXTS ||
    !texts.every((text) => typeof text === 'string')
  ) {
    return `texts must be 1 to ${MAX_TEXTS} strings`
  }
  return { texts, role }
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    // Keep draining past the cap, so the client gets a 413 instead of a reset connection.
    if (size <= MAX_BODY_BYTES) chunks.push(chunk)
  }
  return size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')
}

export function createHandler(
  options: HandlerOptions
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const { embedder, model, dim, log } = options
  // One inference thread: each request waits for the one before it.
  let previous: Promise<unknown> = Promise.resolve()

  async function embed(texts: string[], role: Role): Promise<Reply> {
    const run = previous.then(() => embedder.embed(texts.map((text) => PREFIXES[role] + text)))
    previous = run.catch(() => undefined)
    const { vectors, tokenCounts } = await run
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== dim)) {
      throw new Error('The model returned an unexpected shape')
    }
    const truncated = tokenCounts.map((count) => count > MAX_TOKENS)
    tokenCounts.forEach((tokens, index) => {
      if (truncated[index]) log('info', 'Input truncated to the model limit', { role, tokens, limit: MAX_TOKENS })
    })
    return { status: 200, body: { model, dim, vectors, truncated } }
  }

  async function route(request: IncomingMessage): Promise<Reply> {
    const path = new URL(request.url ?? '/', 'http://sidecar').pathname
    if (request.method === 'GET' && path === '/health') return { status: 200, body: { ok: true, model, dim } }
    if (request.method !== 'POST' || path !== '/embed') return { status: 404, body: { error: 'not found' } }
    const raw = await readBody(request)
    if (raw === null) return { status: 413, body: { error: `body is over ${MAX_BODY_BYTES} bytes` } }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { status: 400, body: { error: 'body must be JSON' } }
    }
    const input = parseEmbedRequest(parsed)
    if (typeof input === 'string') return { status: 400, body: { error: input } }
    try {
      return await embed(input.texts, input.role)
    } catch (error) {
      log('error', 'Embedding failed', { error: error instanceof Error ? error.message : String(error) })
      return { status: 500, body: { error: 'embedding failed' } }
    }
  }

  return async (request, response) => {
    let reply: Reply
    try {
      reply = await route(request)
    } catch (error) {
      log('error', 'Request failed', { error: error instanceof Error ? error.message : String(error) })
      reply = { status: 400, body: { error: 'bad request' } }
    }
    response.writeHead(reply.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(reply.body))
  }
}
