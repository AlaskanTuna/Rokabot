export type ExtractionErrorClassification = 'transient' | 'permanent'

const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'ERR_HTTP2_STREAM_CANCEL',
  'ERR_SOCKET_CLOSED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
])
const ABORT_CODES = new Set(['ERR_ABORTED', 'UND_ERR_ABORTED'])
const SHUTDOWN_SENSITIVE_NAMES = new Set(['AbortError', 'APIUserAbortError', 'APITimeoutError', 'TimeoutError'])

export function classifyExtractionError(
  error: unknown,
  options: { shuttingDown?: boolean } = {}
): ExtractionErrorClassification {
  const causes: unknown[] = []
  const seen = new Set<unknown>()
  let current = error

  while (current && !seen.has(current)) {
    seen.add(current)
    causes.push(current)
    current = typeof current === 'object' ? (current as { cause?: unknown }).cause : undefined
  }

  for (const cause of causes) {
    if (typeof cause !== 'object' || cause === null) continue
    const record = cause as { status?: unknown; statusCode?: unknown; code?: unknown }
    const status = typeof record.status === 'number' ? record.status : record.statusCode
    if (typeof status === 'number' && TRANSIENT_HTTP_STATUSES.has(status)) return 'transient'
    if (typeof record.code === 'string' && TRANSIENT_NETWORK_CODES.has(record.code)) return 'transient'
    if (!options.shuttingDown && typeof record.code === 'string' && ABORT_CODES.has(record.code)) return 'transient'
  }

  for (const cause of causes) {
    if (!(cause instanceof Error)) continue
    if (/^fetch failed$/i.test(cause.message)) return 'transient'
    if (cause.name === 'APIConnectionError') return 'transient'
    if (!options.shuttingDown && SHUTDOWN_SENSITIVE_NAMES.has(cause.name)) return 'transient'
  }

  return 'permanent'
}
