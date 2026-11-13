import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type CacheMode = 'record' | 'replay'
export type ProviderName = 'river' | 'embeddings' | 'typesafe'

export type ProviderCounts = Record<ProviderName, number>

export interface ProviderBudgets {
  river: number
  embeddings: number
  typesafe: number
}

export const DEFAULT_PROVIDER_BUDGETS: Readonly<ProviderBudgets> = {
  river: 600,
  embeddings: 1200,
  typesafe: 1500
}

export class MemsimCacheMissError extends Error {
  readonly provider: ProviderName
  readonly hash: string
  readonly cacheDir: string

  constructor(provider: ProviderName, hash: string, cacheDir: string) {
    super(`Cache miss in replay mode for ${provider}/${hash} (cacheDir: ${cacheDir})`)
    this.name = 'MemsimCacheMissError'
    this.provider = provider
    this.hash = hash
    this.cacheDir = cacheDir
  }
}

export class MemsimBudgetExceededError extends Error {
  readonly provider: ProviderName
  readonly used: number
  readonly budget: number

  constructor(provider: ProviderName, used: number, budget: number) {
    super(`Provider call budget exceeded for ${provider}: ${used} >= ${budget}`)
    this.name = 'MemsimBudgetExceededError'
    this.provider = provider
    this.used = used
    this.budget = budget
  }
}

export interface CachedHttpResponse {
  status: number
  statusText: string
  contentType: string
  body: string
}

interface CacheEnvelope<T> {
  version: 1
  provider: ProviderName
  hash: string
  response: T
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key]
    if (child !== undefined) sorted[key] = canonicalize(child)
  }
  return sorted
}

export function hashRequest(provider: ProviderName, payload: unknown): string {
  const serialized = JSON.stringify(canonicalize({ provider, payload }))
  return createHash('sha256').update(serialized).digest('hex')
}

export class MemsimCache {
  readonly mode: CacheMode
  readonly cacheDir: string
  readonly budgets: ProviderBudgets
  private readonly hits: ProviderCounts = { river: 0, embeddings: 0, typesafe: 0 }
  private readonly liveCalls: ProviderCounts = { river: 0, embeddings: 0, typesafe: 0 }
  private readonly accessedPaths = new Set<string>()
  private writes = 0
  private fatalError: Error | null = null

  constructor(options: { mode: CacheMode; cacheDir: string; budgets?: Partial<ProviderBudgets> }) {
    this.mode = options.mode
    this.cacheDir = options.cacheDir
    this.budgets = { ...DEFAULT_PROVIDER_BUDGETS, ...options.budgets }
  }

  throwIfFatal(): void {
    if (this.fatalError) {
      throw this.fatalError
    }
  }

  private entryPath(provider: ProviderName, hash: string): string {
    return join(this.cacheDir, provider, `${hash}.json`)
  }

  stats(): {
    mode: CacheMode
    hits: ProviderCounts
    liveCalls: ProviderCounts
    totalCalls: ProviderCounts
    writes: number
    budgets: ProviderBudgets
  } {
    return {
      mode: this.mode,
      hits: { ...this.hits },
      liveCalls: { ...this.liveCalls },
      totalCalls: {
        river: this.hits.river + this.liveCalls.river,
        embeddings: this.hits.embeddings + this.liveCalls.embeddings,
        typesafe: this.hits.typesafe + this.liveCalls.typesafe
      },
      writes: this.writes,
      budgets: { ...this.budgets }
    }
  }

  markAccessed(provider: ProviderName, keyPayload: unknown): void {
    const hash = hashRequest(provider, keyPayload)
    this.accessedPaths.add(this.entryPath(provider, hash))
  }

  getAccessedPaths(): Set<string> {
    return new Set(this.accessedPaths)
  }

  mergeAccessedPaths(paths: Iterable<string>): void {
    for (const p of paths) {
      this.accessedPaths.add(p)
    }
  }

  pruneUnused(): number {
    let deleted = 0
    for (const provider of ['river', 'embeddings', 'typesafe'] as const) {
      const dir = join(this.cacheDir, provider)
      if (!existsSync(dir)) continue
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith('.json')) continue
        const fullPath = join(dir, entry)
        if (!this.accessedPaths.has(fullPath)) {
          unlinkSync(fullPath)
          deleted += 1
        }
      }
    }
    return deleted
  }

  async getOrRecord<T>(
    provider: ProviderName,
    keyPayload: unknown,
    liveFn: () => Promise<T>,
    shouldCache: (response: T) => boolean = () => true
  ): Promise<{ value: T; cached: boolean }> {
    const hash = hashRequest(provider, keyPayload)
    const path = this.entryPath(provider, hash)
    this.accessedPaths.add(path)
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheEnvelope<T>
      this.hits[provider] += 1
      return { value: parsed.response, cached: true }
    }

    if (this.mode === 'replay') {
      const err = new MemsimCacheMissError(provider, hash, this.cacheDir)
      this.fatalError ??= err
      throw err
    }

    if (this.liveCalls[provider] >= this.budgets[provider]) {
      const err = new MemsimBudgetExceededError(provider, this.liveCalls[provider], this.budgets[provider])
      this.fatalError ??= err
      throw err
    }

    this.liveCalls[provider] += 1
    const response = await liveFn()
    if (shouldCache(response)) {
      const dir = join(this.cacheDir, provider)
      mkdirSync(dir, { recursive: true })
      const envelope: CacheEnvelope<T> = { version: 1, provider, hash, response }
      const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
      writeFileSync(tmpPath, `${JSON.stringify(envelope)}\n`, 'utf8')
      renameSync(tmpPath, path)
      this.writes += 1
    }
    return { value: response, cached: false }
  }
}

export function normalizeHttpRequestKey(
  input: string | URL | Request,
  init?: RequestInit
): { method: string; url: string; body: unknown } {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  let rawBody = ''
  if (typeof init?.body === 'string') {
    rawBody = init.body
  } else if (init?.body instanceof Uint8Array || init?.body instanceof ArrayBuffer) {
    rawBody = Buffer.from(init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : init.body).toString('utf8')
  }
  let body: unknown = rawBody
  if (rawBody) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      body = rawBody
    }
  }
  return { method, url, body }
}

export function toFetchResponse(cached: CachedHttpResponse): Response {
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers: { 'content-type': cached.contentType }
  })
}
