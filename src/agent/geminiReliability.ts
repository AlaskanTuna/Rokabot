export type FailureKind =
  | 'transient_http'
  | 'network'
  | 'empty_text'
  | 'safety'
  | 'recitation'
  | 'session_corrupt'
  | 'terminal'
  | 'ok'

export interface GeminiFailureResult {
  kind: FailureKind
  retryable: boolean
  deflect: boolean
}

export interface BackoffOptions {
  jitter?: boolean
  maxMs?: number
  random?: () => number
}

export const DEFAULT_MAX_BACKOFF_MS = 12_000

const SAFETY_PATTERN = /SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII/i
const RECITATION_PATTERN = /RECITATION/i
const SESSION_CORRUPT_PATTERN = /function call turn comes immediately after/i
const TERMINAL_PATTERN =
  /400|INVALID_ARGUMENT|UNAUTHENTICATED|UNAUTHORIZED|AUTHENTICATION|PERMISSION_DENIED|FORBIDDEN|401|403/i
const TRANSIENT_HTTP_PATTERN = /429|500|503|RESOURCE_EXHAUSTED|overloaded|quota|rate.limit|UNAVAILABLE/i
const NETWORK_PATTERN = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|abort(?:ed)?|timeout|DEADLINE_EXCEEDED/i

function result(kind: FailureKind): GeminiFailureResult {
  return {
    kind,
    retryable:
      kind === 'transient_http' ||
      kind === 'network' ||
      kind === 'empty_text' ||
      kind === 'recitation' ||
      kind === 'session_corrupt',
    deflect: kind === 'safety' || kind === 'recitation' || kind === 'session_corrupt' || kind === 'terminal'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function classifyMarker(marker: string | undefined): FailureKind | undefined {
  if (!marker) return undefined
  if (SAFETY_PATTERN.test(marker)) return 'safety'
  if (RECITATION_PATTERN.test(marker)) return 'recitation'
  if (SESSION_CORRUPT_PATTERN.test(marker)) return 'session_corrupt'
  if (TERMINAL_PATTERN.test(marker)) return 'terminal'
  if (TRANSIENT_HTTP_PATTERN.test(marker)) return 'transient_http'
  if (NETWORK_PATTERN.test(marker)) return 'network'
  return undefined
}

export function classifyGeminiFailure(input: unknown): GeminiFailureResult {
  if (typeof input === 'string') {
    return result(classifyMarker(input) ?? 'terminal')
  }

  if (!isRecord(input)) return result('terminal')

  const errorCode = stringValue(input.errorCode ?? input.code ?? input.status)
  const finishReason = stringValue(input.finishReason)
  const errorMessage = stringValue(input.errorMessage ?? input.message) ?? ''
  const name = stringValue(input.name) ?? ''

  if (SESSION_CORRUPT_PATTERN.test(`${name} ${errorMessage}`)) return result('session_corrupt')

  const markedKind = classifyMarker(errorCode) ?? classifyMarker(finishReason)
  if (markedKind) return result(markedKind)

  const messageKind = classifyMarker(`${name} ${errorMessage}`)
  if (messageKind) return result(messageKind)

  const isResponse = 'hasText' in input || 'hasFunctionCall' in input || 'finishReason' in input
  if (isResponse && input.hasText !== true && input.hasFunctionCall !== true) return result('empty_text')

  return result(isResponse ? 'ok' : 'terminal')
}

export function computeBackoff(attempt: number, baseMs: number, options: BackoffOptions = {}): number {
  const { jitter = true, maxMs = DEFAULT_MAX_BACKOFF_MS, random = Math.random } = options
  const exponent = Math.max(0, Math.floor(attempt))
  const cappedDelay = Math.min(Math.max(0, baseMs) * 2 ** exponent, Math.max(0, maxMs))

  if (!jitter) return cappedDelay

  const randomValue = Math.min(1, Math.max(0, random()))
  return cappedDelay * (0.5 + randomValue * 0.5)
}
