import { isIP } from 'node:net'

export type SocialPlatform = 'x' | 'bluesky' | 'youtube' | 'tiktok' | 'reddit' | 'instagram' | 'bilibili' | 'threads'

export interface SocialPostTarget {
  platform: SocialPlatform
  id: string
  lookupKey: string
  canonicalUrl: string
  extractorUrl: string
  profile?: string
  startSec?: number
}

const HOSTS: Record<SocialPlatform, string[]> = {
  x: ['x.com', 'twitter.com', 'fxtwitter.com', 'fixupx.com', 'vxtwitter.com', 'fixvx.com'],
  bluesky: ['bsky.app'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  reddit: ['reddit.com', 'redd.it'],
  instagram: ['instagram.com'],
  bilibili: ['bilibili.com'],
  threads: ['threads.com', 'threads.net']
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

function platformForHost(host: string): SocialPlatform | null {
  for (const [platform, domains] of Object.entries(HOSTS) as Array<[SocialPlatform, string[]]>) {
    if (domains.some((domain) => hostMatches(host, domain))) return platform
  }
  return null
}

const BLUESKY_POST_PATH = /^\/profile\/([^/]+)\/post\/([a-z0-9]+)\/?$/i
const TIKTOK_POST_PATH = /^\/@([\w.-]+)\/video\/(\d+)\/?$/i
const REDDIT_SUB_POST_PATH = /^\/r\/[\w-]+\/comments\/([a-z0-9]+)(?:\/[^/]*)?\/?$/i
const THREADS_POST_PATH = /^\/@([\w.]+)\/post\/([\w-]+)(?:\/media)?\/?$/

const SHAPE_X_PATH = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{15,20})\/?$/
const SHAPE_INSTAGRAM_REEL_PATH = /^\/reels?\/([\w-]{11})\/?$/
const SHAPE_INSTAGRAM_POST_PATH = /^\/p\/([\w-]{11})\/?$/
const SHAPE_BILIBILI_PATH = /^\/video\/(BV[\da-zA-Z]{10})\/?$/

function target(platform: SocialPlatform, id: string, canonicalUrl: string, profile?: string): SocialPostTarget {
  return { platform, id, lookupKey: `${platform}:${id}`, canonicalUrl, extractorUrl: canonicalUrl, profile }
}

function matchX(pathname: string, pattern: RegExp): SocialPostTarget | null {
  const match = pathname.match(pattern)
  if (!match) return null
  const [, profile, id] = match
  return target('x', id, `https://x.com/i/status/${id}`, profile)
}

function matchBluesky(pathname: string): SocialPostTarget | null {
  const match = pathname.match(BLUESKY_POST_PATH)
  if (!match) return null
  const [, profile, id] = match
  return target('bluesky', id, `https://bsky.app/profile/${profile}/post/${id}`, profile)
}

function matchTikTok(pathname: string): SocialPostTarget | null {
  const match = pathname.match(TIKTOK_POST_PATH)
  if (!match) return null
  const [, profile, id] = match
  return target('tiktok', id, `https://www.tiktok.com/@${profile}/video/${id}`, profile)
}

function matchThreadsPost(pathname: string): SocialPostTarget | null {
  const match = pathname.match(THREADS_POST_PATH)
  if (!match) return null
  const [, profile, id] = match
  return target('threads', id, `https://www.threads.com/@${profile}/post/${id}`, profile)
}

function bilibiliTarget(id: string): SocialPostTarget {
  const normalizedId = id.startsWith('av') ? id.toLowerCase() : `BV${id.slice(2)}`
  return target('bilibili', normalizedId, `https://www.bilibili.com/video/${normalizedId}`)
}

// Fallback for rapidly changing mirror/fixer domains; rebuilds strictly as first-party URLs and skips generic /watch?v=
function parseByShape(url: URL, host: string): SocialPostTarget | null {
  const { pathname } = url

  const x = matchX(pathname, SHAPE_X_PATH)
  if (x) return x

  const reel = pathname.match(SHAPE_INSTAGRAM_REEL_PATH)?.[1]
  if (reel) return target('instagram', reel, `https://www.instagram.com/reel/${reel}/`)

  if (host.includes('insta')) {
    const post = pathname.match(SHAPE_INSTAGRAM_POST_PATH)?.[1]
    if (post) return target('instagram', post, `https://www.instagram.com/p/${post}/`)
  }

  const tiktok = matchTikTok(pathname)
  if (tiktok) return tiktok

  const reddit = pathname.match(REDDIT_SUB_POST_PATH)?.[1]
  if (reddit) return target('reddit', reddit, `https://www.reddit.com/comments/${reddit}/`)

  const bluesky = matchBluesky(pathname)
  if (bluesky) return bluesky

  const threads = matchThreadsPost(pathname)
  if (threads) return threads

  const bilibili = pathname.match(SHAPE_BILIBILI_PATH)?.[1]
  if (bilibili) return bilibiliTarget(bilibili)

  return null
}

const YOUTUBE_CLOCK_TIME = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/

function youtubeStartSec(url: URL): number | undefined {
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start') ?? url.hash.match(/^#t=(.*)$/)?.[1]
  if (raw === undefined) return undefined
  if (/^\d+$/.test(raw)) return Number(raw)
  const match = raw.match(YOUTUBE_CLOCK_TIME)
  if (!match || match.slice(1).every((part) => part === undefined)) return undefined
  const [, hours = '0', minutes = '0', seconds = '0'] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function parseSocialPostUrl(value: string): SocialPostTarget | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  const authority = value.trim().match(/^https:\/\/([^/?#]+)/i)?.[1]
  if (
    url.protocol !== 'https:' ||
    !authority ||
    authority.includes('@') ||
    authority.includes(':') ||
    isIP(url.hostname.replace(/^\[|\]$/g, ''))
  ) {
    return null
  }

  const host = url.hostname.toLowerCase()
  const platform = platformForHost(host)
  if (!platform) return parseByShape(url, host)

  if (platform === 'x') return matchX(url.pathname, /^\/([\w]+)\/status\/(\d+)(?:\/.*)?$/i)

  if (platform === 'bluesky') return matchBluesky(url.pathname)

  if (platform === 'youtube') {
    const id = hostMatches(host, 'youtu.be')
      ? url.pathname.match(/^\/([\w-]+)\/?$/)?.[1]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/shorts\/([\w-]+)\/?$/)?.[1]
    if (!id || !/^[\w-]+$/.test(id)) return null
    const canonicalUrl = `https://www.youtube.com/watch?v=${id}`
    return { ...target('youtube', id, canonicalUrl), startSec: youtubeStartSec(url) }
  }

  if (platform === 'tiktok') return matchTikTok(url.pathname)

  if (platform === 'reddit') {
    const id = hostMatches(host, 'redd.it')
      ? url.pathname.match(/^\/([a-z0-9]+)\/?$/i)?.[1]
      : (url.pathname.match(REDDIT_SUB_POST_PATH)?.[1] ?? url.pathname.match(/^\/comments\/([a-z0-9]+)\/?$/i)?.[1])
    if (!id) return null
    return target('reddit', id, `https://www.reddit.com/comments/${id}/`)
  }

  if (platform === 'instagram') {
    const match = url.pathname.match(/^\/(?:p|reel)\/([\w-]+)\/?$/i)
    if (!match) return null
    const [, id] = match
    const kind = url.pathname.toLowerCase().startsWith('/reel/') ? 'reel' : 'p'
    return target('instagram', id, `https://www.instagram.com/${kind}/${id}/`)
  }

  if (platform === 'threads') {
    const short = url.pathname.match(/^\/t\/([\w-]+)\/?$/)?.[1]
    if (short) return target('threads', short, `https://www.threads.com/t/${short}`)
    return matchThreadsPost(url.pathname)
  }

  const id = url.pathname.match(/^\/video\/(BV[\da-z]+|av\d+)\/?$/i)?.[1]
  if (!id) return null
  return bilibiliTarget(id)
}

export function findSocialPostTarget(text: string): SocialPostTarget | null {
  const urls = text.match(/https?:\/\/[^\s<>()[\]{}]+/gi) ?? []
  for (const candidate of urls) {
    const cleaned = candidate.replace(/[.,!?;:'"`|]+$/g, '')
    const parsed = parseSocialPostUrl(cleaned)
    if (parsed) return parsed
  }
  return null
}
