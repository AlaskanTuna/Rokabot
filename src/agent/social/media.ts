import { config } from '../../config.js'
import { MAX_VIDEO_SIZE_BYTES } from '../media/attachmentLimits.js'
import type { MediaAttachment } from '../media/attachments.js'
import { embedVideoContentKey, postContentKey, youtubeContentKey } from '../media/contentKey.js'
import { resolveMediaUrl } from '../media/mediaRules.js'
import type { SocialPost } from './types.js'

// A Bluesky record key is unique only within its account, and anyone can choose one for their own post.
function postIdentity(post: SocialPost): string {
  return post.platform === 'bluesky' ? `${post.target.profile?.toLowerCase()}/${post.id}` : post.id
}

async function resolveWatchableVideo(
  url: string,
  knownBytes: number | null
): Promise<{ url: string; contentType: string; size?: number } | null> {
  // A third-party file URL gets the same public-address, redirect and type checks as any linked file. No
  // extractor headers are sent: a host that needs them fails here and the caller falls back to the picture.
  const resolved = await resolveMediaUrl(url).catch(() => null)
  if (!resolved?.contentType.startsWith('video/')) return null
  if ((resolved.size ?? knownBytes ?? 0) > config.media.maxStreamedUploadBytes) return null
  // Without a stated size it cannot be streamed, and a file this big would be refused inline; keep the picture.
  if (resolved.size === undefined && (knownBytes ?? 0) > MAX_VIDEO_SIZE_BYTES) return null
  return resolved
}

async function playableVideo(post: SocialPost): Promise<MediaAttachment | null> {
  if (!post.video) return null
  const resolved = await resolveWatchableVideo(post.video.url, post.video.bytes)
  if (!resolved) return null

  return {
    ...resolved,
    ...(post.durationSec ? { durationSec: post.durationSec } : {}),
    ...(post.video.hasAudio === false ? { silent: true } : {}),
    origin: 'link',
    sourceAuthorId: null,
    contentKey: postContentKey(post.platform, postIdentity(post), 0)
  }
}

/** What an embed video contributes: the clip to watch, else null and the caller keeps the thumbnail. */
export async function embedVideoMedia(url: string): Promise<MediaAttachment | null> {
  const watched = config.media.watcher === 'gemini'
  if (!watched) return null
  const resolved = await resolveWatchableVideo(url, null)
  if (!resolved) return null
  return { ...resolved, origin: 'link', sourceAuthorId: null, contentKey: embedVideoContentKey(url) }
}

/** What a found post contributes to the turn's one media slot: its video to watch, else its picture. */
export async function socialPostMedia(post: SocialPost): Promise<MediaAttachment | null> {
  const watched = config.media.watcher === 'gemini'
  if (watched && post.platform === 'youtube') {
    return {
      url: post.canonicalUrl,
      contentType: 'video/mp4',
      transport: 'uri',
      ...(post.durationSec ? { durationSec: post.durationSec } : {}),
      ...(post.target.startSec !== undefined ? { startSec: post.target.startSec } : {}),
      origin: 'link',
      sourceAuthorId: null,
      contentKey: youtubeContentKey(post.id, post.target.startSec)
    }
  }
  if (watched) {
    const video = await playableVideo(post)
    if (video) return video
  }
  if (!post.imageUrl) return null
  return resolveMediaUrl(post.imageUrl).catch(() => null)
}
