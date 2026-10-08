import type { ImageAttachment } from '../../agent/attachments.js'
import { postContentKey, youtubeContentKey } from '../../agent/media/contentKey.js'
import { config } from '../../config.js'
import { resolveMediaUrl } from '../attachments.js'
import type { SocialPost } from './types.js'

// A Bluesky record key is unique only within its account, and anyone can choose one for their own post.
function postIdentity(post: SocialPost): string {
  return post.platform === 'bluesky' ? `${post.target.profile?.toLowerCase()}/${post.id}` : post.id
}

async function playableVideo(post: SocialPost): Promise<ImageAttachment | null> {
  if (!post.video) return null
  // A third-party file URL gets the same public-address, redirect and type checks as any linked file. No
  // extractor headers are sent: a host that needs them fails here and the post falls back to its picture.
  const resolved = await resolveMediaUrl(post.video.url).catch(() => null)
  if (!resolved?.contentType.startsWith('video/')) return null
  if ((resolved.size ?? post.video.bytes ?? 0) > config.media.maxStreamedUploadBytes) return null

  return {
    ...resolved,
    ...(post.durationSec ? { durationSec: post.durationSec } : {}),
    ...(post.video.hasAudio === false ? { silent: true } : {}),
    origin: 'link',
    sourceAuthorId: null,
    contentKey: postContentKey(post.platform, postIdentity(post), 0)
  }
}

/** What a found post contributes to the turn's one media slot: its video to watch, else its picture. */
export async function socialPostMedia(post: SocialPost): Promise<ImageAttachment | null> {
  if (config.media.watch && post.platform === 'youtube') {
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
  if (config.media.watch) {
    const video = await playableVideo(post)
    if (video) return video
  }
  if (!post.imageUrl) return null
  return resolveMediaUrl(post.imageUrl).catch(() => null)
}
