import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { resolvesToPublicAddress } from '../attachments.js'
import { parseBlueskyThread, parseFxTwitterResponse, parseYouTubeOEmbed, parseYtDlpMetadata } from './parsers.js'
import type { SocialPost, SocialPostLookup } from './types.js'
import { type SocialPlatform, type SocialPostTarget, findSocialPostTarget } from './urls.js'
import { isYtDlpAvailable, runYtDlp } from './ytDlp.js'

export interface SocialPostSettings {
  enabled: boolean
  maxLookupsPerTurn: number
  timeoutMs: number
  maxTextChars: number
  cacheTtlMs: number
  maxCacheEntries: number
  ytDlpPath: string
}

interface SocialPostViewerDependencies {
  fetcher?: typeof fetch
  runExtractor?: typeof runYtDlp
  now?: () => number
  warn?: (platform: SocialPlatform, reason: string) => void
}

function failure(platform: SocialPlatform, reason: string): SocialPostLookup {
  return { status: 'failed', platform, reason }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isYtDlpPlatform(platform: SocialPlatform): boolean {
  return platform !== 'x' && platform !== 'bluesky'
}

const MAX_BLUESKY_PDS_CACHE_ENTRIES = 256

export class SocialPostViewer {
  private readonly cache = new Map<string, { post: SocialPost; expiresAt: number }>()
  private readonly blueskyPdsCache = new Map<string, string>()
  private ytDlpAvailable = true
  private readonly fetcher: typeof fetch
  private readonly runExtractor: typeof runYtDlp
  private readonly now: () => number
  private readonly warn: (platform: SocialPlatform, reason: string) => void

  constructor(
    private readonly settings: SocialPostSettings,
    dependencies: SocialPostViewerDependencies = {}
  ) {
    this.fetcher = dependencies.fetcher ?? fetch
    this.runExtractor = dependencies.runExtractor ?? runYtDlp
    this.now = dependencies.now ?? Date.now
    this.warn =
      dependencies.warn ?? ((platform, reason) => logger.warn({ platform, reason }, 'Social post lookup failed'))
  }

  setYtDlpAvailable(available: boolean): void {
    this.ytDlpAvailable = available
  }

  isEnabled(): boolean {
    return this.settings.enabled
  }

  async lookup(target: SocialPostTarget): Promise<SocialPostLookup> {
    if (!this.settings.enabled) return { status: 'none' }
    if (isYtDlpPlatform(target.platform) && !this.ytDlpAvailable) {
      return failure(target.platform, 'binary_missing')
    }

    const cached = this.getCached(target.lookupKey)
    if (cached) return { status: 'found', post: cached }

    const controller = new AbortController()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<SocialPostLookup>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
        resolve(failure(target.platform, 'timeout'))
      }, this.settings.timeoutMs)
    })

    try {
      const result = await Promise.race([this.lookupUncached(target, controller.signal), timeout])
      if (result.status === 'found') this.setCached(target.lookupKey, result.post)
      if (result.status === 'failed') return this.reportFailure(result.platform, timedOut ? 'timeout' : result.reason)
      return result
    } catch (error) {
      return this.reportFailure(target.platform, timedOut || isAbort(error) ? 'timeout' : 'network_error')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private reportFailure(platform: SocialPlatform, reason: string): SocialPostLookup {
    this.warn(platform, reason)
    return failure(platform, reason)
  }

  private getCached(key: string): SocialPost | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.post
  }

  private setCached(key: string, post: SocialPost): void {
    if (this.settings.cacheTtlMs === 0) return
    this.cache.delete(key)
    this.cache.set(key, { post, expiresAt: this.now() + this.settings.cacheTtlMs })
    while (this.cache.size > this.settings.maxCacheEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private getCachedBlueskyPds(did: string): string | null {
    const endpoint = this.blueskyPdsCache.get(did)
    if (!endpoint) return null
    this.blueskyPdsCache.delete(did)
    this.blueskyPdsCache.set(did, endpoint)
    return endpoint
  }

  private setCachedBlueskyPds(did: string, endpoint: string): void {
    this.blueskyPdsCache.delete(did)
    this.blueskyPdsCache.set(did, endpoint)
    while (this.blueskyPdsCache.size > MAX_BLUESKY_PDS_CACHE_ENTRIES) {
      const oldest = this.blueskyPdsCache.keys().next().value
      if (oldest === undefined) break
      this.blueskyPdsCache.delete(oldest)
    }
  }

  private async resolveBlueskyPds(did: string, signal: AbortSignal): Promise<string | null> {
    const cached = this.getCachedBlueskyPds(did)
    if (cached) return cached

    let response: Response
    try {
      response = await this.fetcher(`https://plc.directory/${did}`, { signal })
    } catch {
      return null
    }
    if (!response.ok) return null

    let document: unknown
    try {
      document = await response.json()
    } catch {
      return null
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) return null

    const services = (document as { service?: unknown }).service
    if (!Array.isArray(services)) return null
    const pds = services.find(
      (service) =>
        service !== null &&
        typeof service === 'object' &&
        !Array.isArray(service) &&
        typeof (service as { id?: unknown }).id === 'string' &&
        (service as { id: string }).id.endsWith('#atproto_pds') &&
        (service as { type?: unknown }).type === 'AtprotoPersonalDataServer'
    ) as { serviceEndpoint?: unknown } | undefined
    if (!pds || typeof pds.serviceEndpoint !== 'string') return null

    let endpoint: URL
    try {
      endpoint = new URL(pds.serviceEndpoint)
    } catch {
      return null
    }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return null
    }
    if (!(await resolvesToPublicAddress(endpoint.hostname))) return null

    const normalized = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`
    this.setCachedBlueskyPds(did, normalized)
    return normalized
  }

  private async lookupUncached(target: SocialPostTarget, signal: AbortSignal): Promise<SocialPostLookup> {
    if (target.platform === 'x') {
      const response = await this.fetcher(`https://api.fxtwitter.com/status/${target.id}`, { signal })
      if (!response.ok) return failure('x', `http_${response.status}`)
      const payload = await response.json()
      return { status: 'found', post: parseFxTwitterResponse(payload, target, this.settings.maxTextChars) }
    }

    if (target.platform === 'bluesky') {
      let did = target.profile ?? ''
      if (!did.startsWith('did:')) {
        const identityUrl = new URL('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle')
        identityUrl.searchParams.set('handle', did)
        const identity = await this.fetcher(identityUrl, { signal })
        if (!identity.ok) return failure('bluesky', `http_${identity.status}`)
        did = String(((await identity.json()) as { did?: unknown }).did ?? '')
      }
      if (!/^did:[a-z]+:[a-z0-9.:-]+$/i.test(did)) return failure('bluesky', 'invalid_did')

      const threadUrl = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread')
      threadUrl.searchParams.set('uri', `at://${did}/app.bsky.feed.post/${target.id}`)
      threadUrl.searchParams.set('depth', '0')
      threadUrl.searchParams.set('parentHeight', '0')
      const response = await this.fetcher(threadUrl, { signal })
      if (!response.ok) return failure('bluesky', `http_${response.status}`)
      const parsed = parseBlueskyThread(await response.json(), target, this.settings.maxTextChars)
      if (!parsed) return failure('bluesky', 'missing_post')
      const blob = parsed.blueskyBlob
      if (blob?.did.startsWith('did:plc:')) {
        const endpoint = await this.resolveBlueskyPds(blob.did, signal)
        if (endpoint) {
          parsed.post.video = {
            url: `${endpoint}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(blob.did)}&cid=${encodeURIComponent(blob.cid)}`,
            bytes: blob.bytes,
            headers: null,
            hasAudio: null
          }
        }
      }
      return { status: 'found', post: parsed.post }
    }

    const result = await this.runExtractor(this.settings.ytDlpPath, target.extractorUrl, this.settings.timeoutMs)
    if ('reason' in result) {
      if (target.platform !== 'youtube' || signal.aborted) return failure(target.platform, result.reason)
      // YouTube walls repeated requests from one home IP behind a bot check that oEmbed does not have.
      const oembedUrl = new URL('https://www.youtube.com/oembed')
      oembedUrl.searchParams.set('url', target.canonicalUrl)
      oembedUrl.searchParams.set('format', 'json')
      const response = await this.fetcher(oembedUrl, { signal })
      const post = response.ok ? parseYouTubeOEmbed(await response.json(), target, this.settings.maxTextChars) : null
      return post ? { status: 'found', post } : failure('youtube', result.reason)
    }
    return { status: 'found', post: parseYtDlpMetadata(result.metadata, target, this.settings.maxTextChars) }
  }
}

export function createSocialPostViewer(
  settings: SocialPostSettings,
  dependencies?: SocialPostViewerDependencies
): SocialPostViewer {
  return new SocialPostViewer(settings, dependencies)
}

export function socialPostTexts(message: {
  content?: string
  embeds?: Array<{ url?: string | null; description?: string | null; fields?: Array<{ value?: string }> }>
}): string[] {
  const texts = [message.content ?? '']
  for (const embed of message.embeds ?? []) {
    texts.push(embed.url ?? '', embed.description ?? '', ...(embed.fields ?? []).map((field) => field.value ?? ''))
  }
  return texts
}

export function socialPostSnapshotTexts(message: { messageSnapshots?: { values(): Iterable<unknown> } }): string[] {
  const texts: string[] = []
  for (const snapshot of message.messageSnapshots?.values() ?? []) {
    if (!snapshot || typeof snapshot !== 'object') continue
    const forwarded = snapshot as {
      content?: string
      embeds?: Array<{ url?: string | null; description?: string | null; fields?: Array<{ value?: string }> }>
    }
    texts.push(...socialPostTexts(forwarded))
  }
  return texts
}

export function beginSocialPostLookup(
  currentTexts: string[],
  laterTexts: Promise<string[]>,
  viewer: SocialPostViewer = socialPostViewer
): Promise<SocialPostLookup> {
  if (!viewer.isEnabled()) return Promise.resolve({ status: 'none' })
  const target = currentTexts.map(findSocialPostTarget).find((candidate) => candidate !== null)
  if (target) return viewer.lookup(target)
  return laterTexts.then((texts) => {
    const fallbackTarget = texts.map(findSocialPostTarget).find((candidate) => candidate !== null)
    return fallbackTarget ? viewer.lookup(fallbackTarget) : { status: 'none' as const }
  })
}

const socialPostViewer = createSocialPostViewer(config.socialPosts)
let startupCheckStarted = false

export async function initializeSocialPosts(): Promise<void> {
  if (startupCheckStarted) return
  startupCheckStarted = true
  if (!config.socialPosts.enabled) return

  const available = await isYtDlpAvailable(config.socialPosts.ytDlpPath)
  socialPostViewer.setYtDlpAvailable(available)
  if (!available) logger.warn({ platform: 'yt-dlp', reason: 'binary_missing' }, 'Social video extractors disabled')
}

export { socialPostViewer }
