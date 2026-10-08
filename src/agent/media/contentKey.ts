import { createHash } from 'node:crypto'

function requireId(name: string, value: string): string {
  if (value.trim() === '') throw new Error(`Media ${name} must not be empty`)
  return value
}

/** A watch around a timestamp covers different ground from a watch of the whole video, so it is kept apart. */
export function youtubeContentKey(videoId: string, startSec?: number): string {
  const key = `youtube:${requireId('video id', videoId)}`
  return startSec === undefined ? key : `${key}@${startSec}`
}

export function postContentKey(platform: string, postId: string, mediaIndex: number): string {
  return `${requireId('platform', platform)}:${requireId('post id', postId)}:${mediaIndex}`
}

// The query string on a Discord attachment URL is a signed grant that changes on each fetch; the path does not.
export function discordAttachmentContentKey(url: string): string {
  return `discord:${new URL(url).pathname}`
}

export function bytesContentKey(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}
