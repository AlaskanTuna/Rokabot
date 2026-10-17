import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY_BYTES = 1024 * 1024

export interface ErrorBody {
  file: string | null
  path: string | null
  message: string
}

/** A failure the API reports as `{ error: { file, path, message } }` plus any `extra` fields. */
export class StudioError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(body.message)
  }
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): StudioError {
  return new StudioError(status, { file: null, path: null, message }, extra)
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res
    .writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    })
    .end(JSON.stringify(body))
}

/** Hashing both sides first keeps the comparison constant-time whatever the length of the given token. */
export function sameToken(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== 'string') return false
  const digest = (text: string) => createHash('sha256').update(text).digest()
  return timingSafeEqual(digest(given), digest(token))
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size <= MAX_BODY_BYTES) chunks.push(chunk)
  }
  if (size > MAX_BODY_BYTES) throw fail(413, `the request body is over ${MAX_BODY_BYTES} bytes`)
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw fail(400, 'the request body is not valid JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw fail(400, 'the request body must be a JSON object')
  return body as Record<string, unknown>
}

export function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name]
  if (typeof value !== 'string') throw fail(400, `${name} must be a string`)
  return value
}
