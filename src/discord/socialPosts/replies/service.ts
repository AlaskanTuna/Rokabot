import { config } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import type { SocialPlatform, SocialPostTarget } from '../urls.js'
import { runYtDlp } from '../ytDlp.js'
import { fetchBilibiliReplies } from './bilibili.js'
import { fetchBlueskyReplies } from './bluesky.js'
import { failed } from './common.js'
import { fetchInstagramReplies } from './instagram.js'
import { fetchRedditReplies } from './reddit.js'
import { fetchThreadsReplies } from './threads.js'
import { fetchTikTokReplies } from './tiktok.js'
import type { ReplyFetcher, ReplyLookup } from './types.js'
import { fetchXReplies } from './x.js'
import { fetchYouTubeReplies } from './youtube.js'

export interface ReplyReaderSettings {
  enabled: boolean
  timeoutMs: number
  maxReplies: number
  maxReplyChars: number
  cacheTtlMs: number
  maxCacheEntries: number
  ytDlpPath: string
}

interface ReplyReaderDependencies {
  fetchers?: Partial<Record<SocialPlatform, ReplyFetcher>>
  fetcher?: typeof fetch
  runExtractor?: typeof runYtDlp
  now?: () => number
  warn?: (platform: SocialPlatform, reason: string) => void
  youtubeApiKey?: () => string | undefined
}

const FETCHERS: Record<SocialPlatform, ReplyFetcher> = {
  x: fetchXReplies,
  bluesky: fetchBlueskyReplies,
  youtube: fetchYouTubeReplies,
  tiktok: fetchTikTokReplies,
  reddit: fetchRedditReplies,
  instagram: fetchInstagramReplies,
  bilibili: fetchBilibiliReplies,
  threads: fetchThreadsReplies
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

export class ReplyReader {
  private readonly cache = new Map<string, { lookup: ReplyLookup; expiresAt: number }>()
  private readonly fetchers: Record<SocialPlatform, ReplyFetcher>
  private readonly fetcher: typeof fetch
  private readonly runExtractor: typeof runYtDlp
  private readonly now: () => number
  private readonly warn: (platform: SocialPlatform, reason: string) => void
  private readonly youtubeApiKey: () => string | undefined
  private ytDlpAvailable = true

  constructor(
    private readonly settings: ReplyReaderSettings,
    dependencies: ReplyReaderDependencies = {}
  ) {
    this.fetchers = { ...FETCHERS, ...dependencies.fetchers }
    this.fetcher = dependencies.fetcher ?? fetch
    this.runExtractor = dependencies.runExtractor ?? runYtDlp
    this.now = dependencies.now ?? Date.now
    this.warn =
      dependencies.warn ??
      ((platform, reason) => logger.warn({ platform, reason }, 'Social post replies lookup failed'))
    this.youtubeApiKey = dependencies.youtubeApiKey ?? (() => process.env.YOUTUBE_API_KEY)
  }

  setYtDlpAvailable(available: boolean): void {
    this.ytDlpAvailable = available
  }

  async read(target: SocialPostTarget): Promise<ReplyLookup> {
    if (!this.settings.enabled) return failed(target.platform, 'disabled')
    if (target.platform === 'instagram' && !this.ytDlpAvailable) return this.report(target.platform, 'binary_missing')

    const cached = this.getCached(target.lookupKey)
    if (cached) return cached

    const controller = new AbortController()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ReplyLookup>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
        resolve(failed(target.platform, 'timeout'))
      }, this.settings.timeoutMs)
    })

    try {
      const lookup = await Promise.race([
        this.fetchers[target.platform](target, {
          fetcher: this.fetcher,
          runExtractor: this.runExtractor,
          ytDlpPath: this.settings.ytDlpPath,
          signal: controller.signal,
          maxReplies: this.settings.maxReplies,
          maxReplyChars: this.settings.maxReplyChars,
          youtubeApiKey: this.youtubeApiKey(),
          timeoutMs: this.settings.timeoutMs
        }),
        timeout
      ])
      if (lookup.status === 'failed') return this.report(target.platform, timedOut ? 'timeout' : lookup.reason)
      this.setCached(target.lookupKey, lookup)
      return lookup
    } catch (error) {
      return this.report(target.platform, timedOut || isAbort(error) ? 'timeout' : 'network_error')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private report(platform: SocialPlatform, reason: string): ReplyLookup {
    this.warn(platform, reason)
    return failed(platform, reason)
  }

  private getCached(key: string): ReplyLookup | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.lookup
  }

  private setCached(key: string, lookup: ReplyLookup): void {
    if (this.settings.cacheTtlMs === 0) return
    this.cache.delete(key)
    this.cache.set(key, { lookup, expiresAt: this.now() + this.settings.cacheTtlMs })
    while (this.cache.size > this.settings.maxCacheEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}

export function createReplyReader(settings: ReplyReaderSettings, dependencies?: ReplyReaderDependencies): ReplyReader {
  return new ReplyReader(settings, dependencies)
}

export const replyReader = createReplyReader(config.socialPosts)
