import { MODEL_PROFILES, PROVIDER_KEY_ENV, type ProviderId } from '../../src/agent/llm/profiles.js'
import { fail, stringField } from './http.js'
import { envValue } from './secrets.js'

export interface ModelPaths {
  envPath: string
  env: NodeJS.ProcessEnv
  fetch?: typeof fetch
}

type BuiltIn = Exclude<ProviderId, 'openai-compatible'>

const PROVIDERS: readonly ProviderId[] = [...(Object.keys(PROVIDER_KEY_ENV) as BuiltIn[]), 'openai-compatible']
// The bases the bot calls when an entry sets no baseUrl. openai and modelscope match CHAT_COMPLETIONS_BASE_URLS in
// src/agent/llm/chatCompletionsLlm.ts, which loads config.ts and so cannot be imported here; Gemini takes no baseUrl.
export const DEFAULT_BASE_URLS: Readonly<Record<BuiltIn, string>> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  modelscope: 'https://api-inference.modelscope.ai/v1'
}
const KEY_NAME = /^[A-Z][A-Z0-9_]*$/
const TIMEOUT_MS = 10_000
const DETAIL_CHARS = 200

export interface ModelTest {
  ok: boolean
  status: number | null
  latencyMs: number | null
  message: string
  modelListed: boolean | null
}

/** The built-in profiles startup accepts, with the variable each one's key is read from. */
export function modelProfiles() {
  return MODEL_PROFILES.filter((profile) => profile.verified).map((profile) => ({
    provider: profile.provider,
    model: profile.model,
    envVar: profile.provider === 'openai-compatible' ? null : PROVIDER_KEY_ENV[profile.provider],
    capabilities: {
      vision: profile.input.image,
      tools: profile.tools.supported,
      structuredOutput: profile.structuredOutput,
      efforts: profile.thinking.efforts
    },
    price: profile.price
  }))
}

function optionalString(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw fail(400, `${name} must be a string`)
  return value
}

/** One models-list request per provider: it needs no tokens, yet proves the base URL and the key. */
function listRequest(provider: ProviderId, base: string, key: string | undefined) {
  if (provider === 'anthropic') {
    return {
      url: `${base}/v1/models?limit=1000`,
      headers: { 'x-api-key': key ?? '', 'anthropic-version': '2023-06-01' }
    }
  }
  if (provider === 'gemini') return { url: `${base}/models?pageSize=1000`, headers: { 'x-goog-api-key': key ?? '' } }
  return { url: `${base}/models`, headers: key ? { authorization: `Bearer ${key}` } : ({} as Record<string, string>) }
}

/** Whether `model` is in the listed page: null when the body is not a models list or more pages follow. */
function listed(text: string, model: string): boolean | null {
  let body: { data?: unknown; models?: unknown; has_more?: unknown; nextPageToken?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  const items = body?.data ?? body?.models
  if (!Array.isArray(items)) return null
  const ids = items.map((item: { id?: unknown; name?: unknown } | null) => {
    const id = item?.id ?? item?.name
    return typeof id === 'string' ? id.replace(/^models\//, '') : undefined
  })
  if (ids.includes(model)) return true
  return body.has_more === true || typeof body.nextPageToken === 'string' ? null : false
}

function errorText(text: string): string {
  try {
    const body = JSON.parse(text)
    const message = body?.error?.message ?? body?.message ?? body?.error
    return typeof message === 'string' ? message : text
  } catch {
    return text
  }
}

/** A provider's own error text, at most `DETAIL_CHARS` long and with the key masked should the provider echo it. */
function detail(text: string, key: string | undefined): string {
  let flat = errorText(text).replace(/\s+/g, ' ').trim()
  if (key) flat = flat.replaceAll(key, '••••')
  return flat.length > DETAIL_CHARS ? `${flat.slice(0, DETAIL_CHARS - 1)}…` : flat
}

function failure(message: string, status: number | null = null, latencyMs: number | null = null): ModelTest {
  return { ok: false, status, latencyMs, message, modelListed: null }
}

// What the usual network failures mean and what to check, keyed by the error code (or message) fetch reports.
const REASONS: [RegExp, string][] = [
  [/^ECONNREFUSED$/, 'nothing is listening there; start the server or check the port'],
  [/^(ENOTFOUND|EAI_AGAIN)$/, 'the host name does not resolve; check the address'],
  [/^bad port$/, 'Node refuses to call that port; use another one'],
  [/SSL|TLS|CERT/, 'the TLS handshake failed; use http:// for a server without TLS'],
  [/^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)$/, 'the connection timed out; check the address and any firewall'],
  [/^ECONNRESET$/, 'the server closed the connection']
]

function reason(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown; message?: unknown } }).cause
  const text = typeof cause?.code === 'string' ? cause.code : String(cause?.message ?? (error as Error).message)
  const known = REASONS.find(([pattern]) => pattern.test(text))
  return known ? `${known[1]} (${text})` : text.slice(0, DETAIL_CHARS)
}

/** Checks that a model entry can reach its provider with its key, and whether the provider lists the model. */
export async function testModel(paths: ModelPaths, body: Record<string, unknown>): Promise<ModelTest> {
  const provider = body.provider as ProviderId
  if (!PROVIDERS.includes(provider)) throw fail(400, `provider must be one of ${PROVIDERS.join(', ')}`)
  const model = stringField(body, 'model').trim()
  if (!model) throw fail(400, 'model must not be empty')
  const baseUrl = optionalString(body, 'baseUrl')
  const protocol = baseUrl === undefined ? undefined : URL.parse(baseUrl)?.protocol
  if (baseUrl !== undefined && protocol !== 'http:' && protocol !== 'https:') {
    throw fail(400, 'baseUrl must be an http or https URL')
  }
  const apiKeyEnv = optionalString(body, 'apiKeyEnv')
  if (apiKeyEnv !== undefined && !KEY_NAME.test(apiKeyEnv)) throw fail(400, `apiKeyEnv must match ${KEY_NAME.source}`)
  if (provider === 'openai-compatible' && baseUrl === undefined) {
    throw fail(400, 'baseUrl is required for provider openai-compatible')
  }

  const keyEnv = provider === 'openai-compatible' ? apiKeyEnv : PROVIDER_KEY_ENV[provider]
  const key = keyEnv ? envValue(paths, keyEnv) : undefined
  if (keyEnv && !key) return failure(`${keyEnv} is not set in .env.`)
  const builtIn = provider === 'openai-compatible' ? undefined : DEFAULT_BASE_URLS[provider]
  // The bot's Gemini client takes no base URL, so a Gemini entry always reaches Google.
  const base = ((provider === 'gemini' ? builtIn : (baseUrl ?? builtIn)) as string).replace(/\/+$/, '')
  const { url, headers } = listRequest(provider, base, key)
  const started = performance.now()
  let response: Response
  let text: string
  try {
    response = await (paths.fetch ?? fetch)(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    text = await response.text()
  } catch (error) {
    const name = (error as Error).name
    if (name === 'TimeoutError' || name === 'AbortError')
      return failure(`No answer within ${TIMEOUT_MS / 1000} s from ${base}.`)
    return failure(`Could not reach ${base}: ${reason(error)}.`)
  }
  const latencyMs = Math.round(performance.now() - started)
  const { status } = response
  if (!response.ok) {
    const hint =
      status === 401 || status === 403
        ? keyEnv
          ? `check ${keyEnv}`
          : 'it wants a key, so set apiKeyEnv to the variable that holds it'
        : status === 404 || (status >= 300 && status < 400)
          ? `check the base URL, ${base}`
          : detail(text, key)
    return failure(`The server answered ${status}${hint ? `: ${hint}` : ''}.`, status, latencyMs)
  }
  const modelListed = listed(text, model)
  const listing = modelListed === null ? '' : `; ${model} is ${modelListed ? '' : 'not '}listed`
  return { ok: true, status, latencyMs, message: `Connected in ${latencyMs} ms${listing}.`, modelListed }
}
