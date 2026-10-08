import { BROWSER_USER_AGENT, type ReplyCandidate, failed, found, takeReplies } from './common.js'
import type { ReplyFetcher } from './types.js'

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

// One pass per layer: decoding `&amp;lt;` must yield `&lt;`, not `<`.
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match
    const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}

function field(entry: string, pattern: RegExp): string {
  return pattern.exec(entry)?.[1] ?? ''
}

// The feed is machine-generated Atom, and only three fields are read, so a bounded pattern is enough.
export function parseRedditComments(feed: string): ReplyCandidate[] {
  const comments: ReplyCandidate[] = []
  for (const [, entry] of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    if (!field(entry, /<id>([^<]*)<\/id>/).startsWith('t1_')) continue
    const author = decodeEntities(field(entry, /<author>\s*<name>([^<]*)<\/name>/)).replace(/^\/u\//, '')
    const html = decodeEntities(field(entry, /<content[^>]*>([\s\S]*?)<\/content>/))
    const text = decodeEntities(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    comments.push({ author, text: text.replace(/\s+/g, ' ').trim(), likes: null })
  }
  return comments
}

export const fetchRedditReplies: ReplyFetcher = async (target, context) => {
  const url = new URL(`https://www.reddit.com/comments/${target.id}/.rss`)
  url.searchParams.set('sort', 'top')
  url.searchParams.set('limit', String(context.maxReplies))
  const response = await context.fetcher(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
    signal: context.signal
  })
  if (!response.ok) return failed('reddit', `http_${response.status}`)

  const feed = await response.text()
  if (!feed.includes('<feed')) return failed('reddit', 'invalid_feed')
  return found('reddit', takeReplies(parseRedditComments(feed), context.maxReplies, context.maxReplyChars), null)
}
