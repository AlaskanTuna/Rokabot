import type { ImageAttachment } from '../../agent/attachments.js'
import { config } from '../../config.js'
import { resolveMediaUrl } from '../attachments.js'
import type { SocialPost } from './types.js'

/** What a found post contributes to the turn's one media slot: a YouTube video to watch, else its picture. */
export async function socialPostMedia(post: SocialPost): Promise<ImageAttachment | null> {
  if (config.media.watch && post.platform === 'youtube') {
    const durationSec = (post as { durationSec?: number | null }).durationSec
    return {
      url: post.canonicalUrl,
      contentType: 'video/mp4',
      transport: 'uri',
      ...(durationSec ? { durationSec } : {})
    }
  }
  if (!post.imageUrl) return null
  return resolveMediaUrl(post.imageUrl).catch(() => null)
}
