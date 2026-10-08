import { SOCIAL_POST_UNTRUSTED_DATA_LABEL } from '../../agent/promptSafety.js'
import type { SocialPost } from './types.js'

export const SOCIAL_POST_FAILURE_MARKER = '(the linked post could not be opened)'

export const PLATFORM_NAMES = {
  x: 'X',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  instagram: 'Instagram',
  bilibili: 'Bilibili'
} as const

export function quoted(value: string, maxLength: number): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replaceAll('"', '”')
    .trim()
    .slice(0, maxLength)
}

function author(post: SocialPost): string {
  const handle = post.authorHandle ? `@${quoted(post.authorHandle, 64)}` : ''
  const name = post.authorName ? ` (${quoted(post.authorName, 80)})` : ''
  return `${PLATFORM_NAMES[post.platform]}${handle ? ` ${handle}` : ''}${name}`
}

// The count alone: naming read_replies here made her fetch replies on turns that only asked about the post.
function replies(count: number | null): string[] {
  if (count === null) return []
  if (count === 0) return ['no replies']
  return [`${count} ${count === 1 ? 'reply' : 'replies'}`]
}

export function formatSocialPostLine(post: SocialPost, maxTextChars: number): string {
  const text = quoted(post.text, maxTextChars)
  const quotedText = quoted(post.quotedText, Math.max(0, maxTextChars - text.length))
  const details = [`${author(post)}${post.createdAt ? `, ${post.createdAt}` : ''}: "${text || 'no text'}"`]

  if (quotedText) {
    const quotedBy = post.quotedAuthorHandle ? ` @${quoted(post.quotedAuthorHandle, 64)}` : ''
    details.push(`quoting${quotedBy}: "${quotedText}"`)
  }
  const media: string[] = []
  if (post.photoCount > 0) media.push(`${post.photoCount} ${post.photoCount === 1 ? 'photo' : 'photos'}`)
  if (post.videoCount > 0) media.push(`${post.videoCount} ${post.videoCount === 1 ? 'video' : 'videos'}`)
  if (media.length > 0) details.push(media.join(', '))
  if (post.externalTitle) details.push(`link card: ${quoted(post.externalTitle, 120)}`)
  details.push(`url: ${post.canonicalUrl}`, ...replies(post.replyCount))

  return `${SOCIAL_POST_UNTRUSTED_DATA_LABEL}\n[Linked post — ${details.join(' | ')}]`
}
