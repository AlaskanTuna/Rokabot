import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'

export interface UploadedFile {
  name: string
  uri: string
  mimeType: string
  durationSec: number | null
}

interface FileResource {
  name?: string
  uri?: string
  mimeType?: string
  state?: string
  videoMetadata?: { videoDuration?: string }
}

const API_BASE = 'https://generativelanguage.googleapis.com'
const POLL_INTERVAL_MS = 1000
const DELETE_TIMEOUT_MS = 10_000

/** Streams `sourceUrl` (size known) into the Files API and waits until it is ACTIVE. Null on any failure; a
 * partially created file is deleted before returning. */
export async function streamToFiles(input: {
  sourceUrl: string
  mimeType: string
  size: number
  deadlineMs: number
  fetcher?: typeof fetch
  pollIntervalMs?: number
}): Promise<UploadedFile | null> {
  const fetcher = input.fetcher ?? fetch
  const pollIntervalMs = input.pollIntervalMs ?? POLL_INTERVAL_MS
  const deadlineAt = Date.now() + input.deadlineMs
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.deadlineMs)
  const { signal } = controller
  let name: string | undefined
  try {
    const source = await fetcher(input.sourceUrl, { signal })
    if (!source.ok || !source.body) return null

    const start = await fetcher(`${API_BASE}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': config.gemini.apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(input.size),
        'X-Goog-Upload-Header-Content-Type': input.mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: 'rokabot-media' } }),
      signal
    })
    const uploadUrl = start.headers.get('x-goog-upload-url')
    if (!start.ok || !uploadUrl) return null

    // The upload URL is a session URL, so the documented protocol sends no API key on this request.
    const upload = await fetcher(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(input.size),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: countedBody(source.body, input.size),
      duplex: 'half',
      signal
    } as RequestInit & { duplex: 'half' })
    if (!upload.ok) throw new Error(`upload refused with status ${upload.status}`)
    const created = ((await upload.json()) as { file?: FileResource }).file
    if (!created?.name) throw new Error('upload returned no file name')
    name = created.name

    let file = created
    while (file.state !== 'ACTIVE') {
      if (file.state === 'FAILED' || Date.now() >= deadlineAt) throw new Error(`${name} did not become ACTIVE`)
      await sleep(pollIntervalMs)
      file = await getFile(name, fetcher, signal)
    }
    if (!file.uri) throw new Error(`${name} is ACTIVE without a uri`)
    return { name, uri: file.uri, mimeType: file.mimeType ?? input.mimeType, durationSec: videoDurationSec(file) }
  } catch {
    if (name) await deleteFile(name, fetcher)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function deleteFile(name: string, fetcher?: typeof fetch): Promise<void> {
  try {
    const response = await (fetcher ?? fetch)(`${API_BASE}/v1beta/${name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': config.gemini.apiKey },
      signal: AbortSignal.timeout(DELETE_TIMEOUT_MS)
    })
    if (!response.ok) logger.warn({ name, status: response.status }, 'Gemini file delete was refused')
  } catch (err) {
    logger.warn({ name, err }, 'Gemini file delete failed')
  }
}

/** Errors once more bytes pass than `size` is stated, and when the source ends before `size`, so a short or
 * long body never finalizes an upload. */
function countedBody(body: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
  let sent = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        sent += chunk.byteLength
        if (sent > size) throw new Error(`source runs past its stated ${size} bytes`)
        controller.enqueue(chunk)
      },
      flush() {
        if (sent !== size) throw new Error(`source ended at ${sent} of ${size} bytes`)
      }
    })
  )
}

async function getFile(name: string, fetcher: typeof fetch, signal: AbortSignal): Promise<FileResource> {
  const response = await fetcher(`${API_BASE}/v1beta/${name}`, {
    headers: { 'x-goog-api-key': config.gemini.apiKey },
    signal
  })
  if (!response.ok) throw new Error(`lookup of ${name} refused with status ${response.status}`)
  return (await response.json()) as FileResource
}

function videoDurationSec(file: FileResource): number | null {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(file.videoMetadata?.videoDuration ?? '')
  return match ? Number(match[1]) : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
