import type { SocialPost } from './types.js'
import type { SocialPostTarget } from './urls.js'

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function compact(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function capped(value: unknown, maxTextChars: number): string {
  return compact(string(value)).slice(0, maxTextChars)
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null
}

function date(value: unknown): string | null {
  const input = string(value)
  const parsed = /^\d{8}$/.test(input)
    ? new Date(`${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}T00:00:00Z`)
    : new Date(input)
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10)
}

function imageUrl(value: unknown): string | null {
  const url = string(value)
  return /^https:\/\//i.test(url) ? url : null
}

function base(target: SocialPostTarget): SocialPost {
  return {
    platform: target.platform,
    id: target.id,
    canonicalUrl: target.canonicalUrl,
    target,
    authorHandle: '',
    authorName: '',
    createdAt: null,
    text: '',
    quotedText: '',
    quotedAuthorHandle: '',
    photoCount: 0,
    videoCount: 0,
    imageUrl: null,
    externalTitle: '',
    replyCount: null,
    durationSec: null,
    video: null
  }
}

export function parseFxTwitterResponse(payload: unknown, target: SocialPostTarget, maxTextChars: number): SocialPost {
  const tweet = object(object(payload).tweet)
  const author = object(tweet.author)
  const media = object(tweet.media)
  const photos = array(media.photos)
  const videos = array(media.videos)
  const firstPhoto = object(photos[0])
  const firstVideo = object(videos[0])
  const quote = object(tweet.quote)
  const quoteAuthor = object(quote.author)
  const post = base(target)
  post.authorHandle = string(author.screen_name)
  post.authorName = string(author.name)
  post.createdAt = date(tweet.created_at)
  post.text = capped(tweet.text, maxTextChars)
  post.quotedText = capped(quote.text, maxTextChars)
  post.quotedAuthorHandle = string(quoteAuthor.screen_name)
  post.photoCount = photos.length
  post.videoCount = videos.length
  post.imageUrl = imageUrl(firstPhoto.url) ?? imageUrl(firstVideo.thumbnail_url)
  post.replyCount = nonNegativeInteger(tweet.replies)
  return post
}

function blueskyQuote(embed: JsonObject): { text: string; author: string } {
  const recordView = object(embed.record)
  const record = object(recordView.record)
  const value = object(record.value)
  const author = object(record.author)
  return { text: string(value.text), author: string(author.handle) }
}

export function parseBlueskyThread(
  payload: unknown,
  target: SocialPostTarget,
  maxTextChars: number
): SocialPost | null {
  const thread = object(object(payload).thread)
  const postView = object(thread.post)
  const record = object(postView.record)
  if (!Object.keys(postView).length || !Object.keys(record).length) return null

  const author = object(postView.author)
  const embed = object(postView.embed)
  const media = embed.$type === 'app.bsky.embed.recordWithMedia#view' ? object(embed.media) : embed
  const images = array(media.images)
  const videos = media.$type === 'app.bsky.embed.video#view' ? [media] : []
  const external = object(media.external)
  const firstImage = object(images[0])
  const quote = blueskyQuote(embed)
  const post = base(target)
  post.authorHandle = string(author.handle)
  post.authorName = string(author.displayName)
  post.createdAt = date(record.createdAt)
  post.text = capped(record.text, maxTextChars)
  post.quotedText = capped(quote.text, maxTextChars)
  post.quotedAuthorHandle = quote.author
  post.photoCount = images.length
  post.videoCount = videos.length
  post.externalTitle = string(external.title)
  post.imageUrl = imageUrl(firstImage.fullsize) ?? imageUrl(videos[0]?.thumbnail) ?? imageUrl(external.thumb)
  post.replyCount = nonNegativeInteger(postView.replyCount)
  return post
}

export function parseYouTubeOEmbed(
  payload: unknown,
  target: SocialPostTarget,
  maxTextChars: number
): SocialPost | null {
  const data = object(payload)
  const title = capped(data.title, maxTextChars)
  if (!title) return null
  const post = base(target)
  post.authorHandle = string(data.author_url).match(/\/@([^/?#]+)/)?.[1] ?? ''
  post.authorName = string(data.author_name)
  post.text = title
  post.imageUrl = imageUrl(data.thumbnail_url)
  post.videoCount = 1
  return post
}

export function parseYtDlpMetadata(payload: unknown, target: SocialPostTarget, maxTextChars: number): SocialPost {
  const data = object(payload)
  const post = base(target)
  const title = compact(string(data.title))
  const description = compact(string(data.description))
  // channel_id is a subreddit or a YouTube channel key and a numeric uploader_id is a TikTok account number, so
  // neither names the account the way a reader would.
  const uploaderId = string(data.uploader_id).replace(/^@/, '')
  post.authorHandle = (/^\d+$/.test(uploaderId) ? '' : uploaderId) || string(data.uploader)
  post.authorName = string(data.uploader) || string(data.channel) || string(data.channel_id)
  post.createdAt = date(data.upload_date)
  post.text = [title, description].filter(Boolean).join(' — ').slice(0, maxTextChars)
  post.imageUrl = imageUrl(data.thumbnail)
  post.photoCount = target.platform === 'instagram' ? 1 : 0
  post.videoCount = typeof data.duration === 'number' ? 1 : 0
  post.replyCount = nonNegativeInteger(data.comment_count)
  return post
}
