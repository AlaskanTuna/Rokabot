import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'
import yaml from 'js-yaml'
import { fetch as undiciFetch } from 'undici'
import {
  type CacheMode,
  type CachedHttpResponse,
  type MemsimCache,
  normalizeHttpRequestKey,
  toFetchResponse
} from './cache.js'

export const RIVER_BASE_URL = 'http://127.0.0.1:8317/v1'
export const RIVER_MODEL = 'deepseek-v4.1-flash-river'
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2'
export const GEMINI_EMBEDDING_DIM = 768
export const GEMINI_EMBEDDING_FINGERPRINT = 'gemini:gemini-embedding-2:768:gemini-task-prefix'
const MIN_EMBEDDING_GAP_MS = 4200

const realDateNow = Date.now.bind(Date)
const realFetch = globalThis.fetch.bind(globalThis)

export type StoreMode = 'legacy' | 'dual' | 'item'
export type PrivacyMode = 'relaxed' | 'balanced' | 'strict' | 'off'

export interface SimEnvOptions {
  dbPath: string
  mode: CacheMode
  store: StoreMode
  privacy: PrivacyMode
  maxActiveClaimsPerUser?: number
  claimRetentionDays?: number
  transientClaimRetentionDays?: number
  stableClaimRetentionDays?: number
  deadClaimRetentionDays?: number
  episodeRetentionDays?: number
  mediaRetentionDays?: number
}

function isQuotaError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(text)
}

function sleepReal(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CachedFloat32Embedding {
  format: 'f32_b64'
  b64: string
}

function encodeFloat32Base64(values: number[]): CachedFloat32Embedding {
  const f32 = Float32Array.from(values)
  const b64 = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64')
  return { format: 'f32_b64', b64 }
}

function decodeFloat32Base64(cached: CachedFloat32Embedding | number[]): number[] {
  if (Array.isArray(cached)) {
    return Array.from(Float32Array.from(cached))
  }
  const buf = Buffer.from(cached.b64, 'base64')
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
  return Array.from(f32)
}

export class PacedGeminiEmbeddingClient {
  private readonly cache: MemsimCache
  private readonly keys: Array<{ name: 'GRAPHIFY_GEMINI_API_KEY' | 'DEV_GEMINI_API_KEY'; value: string }>
  private activeKeyIndex = 0
  private readonly lastCallAtMs = new Map<string, number>()
  private tail: Promise<void> = Promise.resolve()
  private inFlight = 0
  private readonly idleWaiters: Array<() => void> = []

  constructor(cache: MemsimCache) {
    this.cache = cache
    const candidates: Array<{ name: 'GRAPHIFY_GEMINI_API_KEY' | 'DEV_GEMINI_API_KEY'; value: string }> = []
    if (process.env.GRAPHIFY_GEMINI_API_KEY?.trim()) {
      candidates.push({ name: 'GRAPHIFY_GEMINI_API_KEY', value: process.env.GRAPHIFY_GEMINI_API_KEY.trim() })
    }
    if (process.env.DEV_GEMINI_API_KEY?.trim()) {
      candidates.push({ name: 'DEV_GEMINI_API_KEY', value: process.env.DEV_GEMINI_API_KEY.trim() })
    }
    this.keys = candidates
  }

  private async paceKey(keyName: string): Promise<void> {
    const prev = this.lastCallAtMs.get(keyName) ?? 0
    const elapsed = realDateNow() - prev
    if (elapsed < MIN_EMBEDDING_GAP_MS) {
      await sleepReal(MIN_EMBEDDING_GAP_MS - elapsed)
    }
    this.lastCallAtMs.set(keyName, realDateNow())
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlight > 0) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve))
    }
  }

  async embed(
    text: string,
    role: 'document' | 'query',
    signal?: AbortSignal
  ): Promise<{ values: number[]; modelId: string; dim: number; fingerprint: string }> {
    this.inFlight += 1
    try {
      const requestPayload = {
        model: GEMINI_EMBEDDING_MODEL,
        dim: GEMINI_EMBEDDING_DIM,
        role,
        text
      }

      const { value } = await this.cache.getOrRecord<CachedFloat32Embedding | number[]>(
        'embeddings',
        requestPayload,
        async () => {
          if (this.keys.length === 0) {
            throw new Error('Missing GRAPHIFY_GEMINI_API_KEY and DEV_GEMINI_API_KEY for live Gemini embedding call')
          }
          const runAttempt = async (): Promise<CachedFloat32Embedding> => {
            const contents = role === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`
            let lastError: unknown
            for (let offset = 0; offset < this.keys.length; offset += 1) {
              const idx = (this.activeKeyIndex + offset) % this.keys.length
              const entry = this.keys[idx]!
              await this.paceKey(entry.name)
              try {
                const sdk = new GoogleGenAI({ apiKey: entry.value })
                const response = await sdk.models.embedContent({
                  model: GEMINI_EMBEDDING_MODEL,
                  contents,
                  config: {
                    outputDimensionality: GEMINI_EMBEDDING_DIM,
                    httpOptions: { timeout: 15_000 },
                    ...(signal ? { abortSignal: signal } : {})
                  }
                })
                const values = response.embeddings?.[0]?.values
                if (!values || values.length !== GEMINI_EMBEDDING_DIM || values.some((v) => !Number.isFinite(v))) {
                  throw new Error('Gemini returned an invalid embedding vector')
                }
                // Stay on the key that answered; the next key is only a fallback after a quota error.
                this.activeKeyIndex = idx
                return encodeFloat32Base64(values)
              } catch (error) {
                lastError = error
                if (isQuotaError(error) && offset + 1 < this.keys.length) {
                  continue
                }
                if (!isQuotaError(error)) throw error
              }
            }
            throw lastError instanceof Error ? lastError : new Error(String(lastError))
          }

          const next = this.tail.then(runAttempt, runAttempt)
          this.tail = next.then(
            () => undefined,
            () => undefined
          )
          return next
        }
      )

      return {
        values: decodeFloat32Base64(value),
        modelId: GEMINI_EMBEDDING_MODEL,
        dim: GEMINI_EMBEDDING_DIM,
        fingerprint: GEMINI_EMBEDDING_FINGERPRINT
      }
    } finally {
      this.inFlight -= 1
      if (this.inFlight === 0) {
        while (this.idleWaiters.length > 0) this.idleWaiters.shift()?.()
      }
    }
  }
}

export function prepareSimConfigEnv(options: SimEnvOptions): { configDir: string; cleanup: () => void } {
  process.env.GEMINI_API_KEY = 'memsim-sentinel-not-a-key'
  // getLocalHour() reads the wall clock, not the simulated Date.now, and the Jev turn request carries its
  // time_of_day. Pin it to the hour the committed and seeded caches were recorded in (late night), so a
  // replay hits the cache whatever time it runs.
  process.env.ROKABOT_HARNESS_LIVE = '1'
  process.env.ROKABOT_FIXED_HOUR = '4'
  process.env.DOTENV_CONFIG_PATH = resolve('tests/vitest-empty.env')
  // Replay needs no keys, so a replay (the CI eval test included) never loads a secret from .env.
  if (options.mode === 'record' && existsSync('.env')) {
    const parsed = dotenv.parse(readFileSync('.env', 'utf8'))
    for (const key of [
      'TYPESAFE_API_KEY',
      'GRAPHIFY_GEMINI_API_KEY',
      'DEV_GEMINI_API_KEY',
      'CLIPROXY_TOKEN'
    ] as const) {
      if (!process.env[key]?.trim() && parsed[key]?.trim()) {
        process.env[key] = parsed[key]
      }
    }
  }

  const baseConfig = yaml.load(readFileSync('config.yml', 'utf8')) as Record<string, unknown>
  const configDir = mkdtempSync(join(tmpdir(), 'roka-memsim-cfg-'))
  mkdirSync(configDir, { recursive: true })
  const configPath = join(configDir, 'config.yml')

  const hasCliproxy = Boolean(process.env.CLIPROXY_TOKEN?.trim())

  if (options.mode === 'replay' && !process.env.TYPESAFE_API_KEY?.trim()) {
    process.env.TYPESAFE_API_KEY = 'memsim-replay-dummy'
  }

  const baseMemory = (baseConfig.memory as Record<string, unknown> | undefined) ?? {}
  const baseEmbeddings = (baseConfig.embeddings as Record<string, unknown> | undefined) ?? {}

  const simConfig = {
    ...baseConfig,
    llm: {
      main: 'riverDeepseek',
      fallback: null,
      models: {
        riverDeepseek: {
          provider: 'openai-compatible',
          model: RIVER_MODEL,
          baseUrl: RIVER_BASE_URL,
          ...(hasCliproxy ? { apiKeyEnv: 'CLIPROXY_TOKEN' } : {}),
          timeoutMs: 30_000,
          capabilities: {
            tools: true,
            parallelToolCalls: true,
            vision: false,
            structuredOutput: 'json_object',
            maxTokensParam: 'max_tokens',
            contextWindow: 131_072,
            maxOutputTokens: 4096
          }
        }
      }
    },
    media: {
      ...((baseConfig.media as Record<string, unknown> | undefined) ?? {}),
      watcher: 'off'
    },
    embeddings: {
      ...baseEmbeddings,
      provider: 'gemini',
      model: GEMINI_EMBEDDING_MODEL,
      timeoutMs: 15_000,
      backfillGapMs: 0
    },
    memory: {
      ...baseMemory,
      store: options.store,
      privacy: options.privacy,
      ...(options.maxActiveClaimsPerUser === undefined
        ? {}
        : { maxActiveClaimsPerUser: options.maxActiveClaimsPerUser }),
      ...(options.claimRetentionDays === undefined ? {} : { claimRetentionDays: options.claimRetentionDays }),
      ...(options.transientClaimRetentionDays === undefined
        ? {}
        : { transientClaimRetentionDays: options.transientClaimRetentionDays }),
      ...(options.stableClaimRetentionDays === undefined
        ? {}
        : { stableClaimRetentionDays: options.stableClaimRetentionDays }),
      ...(options.deadClaimRetentionDays === undefined
        ? {}
        : { deadClaimRetentionDays: options.deadClaimRetentionDays }),
      ...(options.episodeRetentionDays === undefined ? {} : { episodeRetentionDays: options.episodeRetentionDays }),
      ...(options.mediaRetentionDays === undefined ? {} : { mediaRetentionDays: options.mediaRetentionDays }),
      extractionSampleRate: 0
    },
    logging: { level: 'silent' }
  }

  writeFileSync(configPath, yaml.dump(simConfig), 'utf8')
  process.env.ROKABOT_CONFIG_PATH = configPath
  process.env.ROKABOT_DB_PATH = options.dbPath
  process.env.MEMORY_STORE = options.store
  process.env.MEMORY_PRIVACY = options.privacy
  if (!process.env.DISCORD_TOKEN) process.env.DISCORD_TOKEN = 'memsim-discord-token'
  if (!process.env.DISCORD_CLIENT_ID) process.env.DISCORD_CLIENT_ID = 'memsim-client-id'

  return {
    configDir,
    cleanup: () => {
      rmSync(configDir, { recursive: true, force: true })
    }
  }
}

export function createCachedHttpFetch(cache: MemsimCache, provider: 'river' | 'typesafe'): typeof fetch {
  return async (input, init) => {
    const key = normalizeHttpRequestKey(input, init)
    if (provider === 'river' && !key.url.startsWith(RIVER_BASE_URL)) {
      if (cache.mode === 'replay') {
        throw new Error(`Unexpected external fetch in replay mode: ${key.method} ${key.url}`)
      }
      return realFetch(input, init)
    }

    const { value } = await cache.getOrRecord<CachedHttpResponse>(
      provider,
      key,
      async () => {
        const res =
          provider === 'typesafe'
            ? ((await undiciFetch(
                input as Parameters<typeof undiciFetch>[0],
                init as Parameters<typeof undiciFetch>[1]
              )) as unknown as Response)
            : await realFetch(input, init)
        const body = await res.text()
        const contentType = res.headers.get('content-type') ?? 'application/json'
        return {
          status: res.status,
          statusText: res.statusText,
          contentType,
          body
        }
      },
      (response) => response.status >= 200 && response.status < 300
    )

    return toFetchResponse(value)
  }
}

export async function installSimModelRoutes(cache: MemsimCache): Promise<{ restore: () => Promise<void> }> {
  const { __setEmbeddingClientForTest } = await import('../../../src/agent/memory/embeddings/client.js')
  const { __setJevFetchForTest, resetJevClientForTest } = await import('../../../src/agent/jev/client.js')

  const previousFetch = globalThis.fetch
  globalThis.fetch = createCachedHttpFetch(cache, 'river')
  __setJevFetchForTest(createCachedHttpFetch(cache, 'typesafe'))
  __setEmbeddingClientForTest(new PacedGeminiEmbeddingClient(cache))

  return {
    restore: async () => {
      globalThis.fetch = previousFetch
      __setEmbeddingClientForTest(undefined)
      __setJevFetchForTest(undefined)
      await resetJevClientForTest()
    }
  }
}

export async function callRiverChatCompletion(options: {
  cache: MemsimCache
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  responseFormatJson?: boolean
}): Promise<string> {
  const token = process.env.CLIPROXY_TOKEN?.trim()
  const url = `${RIVER_BASE_URL}/chat/completions`
  const body = {
    model: RIVER_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.responseFormatJson ? { response_format: { type: 'json_object' } } : {})
  }

  const cachedFetch = createCachedHttpFetch(options.cache, 'river')
  const response = await cachedFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(`River request failed: ${response.status} ${response.statusText}: ${await response.text()}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('River response missing choices[0].message.content')
  }
  return content
}
