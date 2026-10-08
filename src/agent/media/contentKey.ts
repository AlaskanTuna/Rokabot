import { createHash } from 'node:crypto'

function requireId(name: string, value: string): string {
  if (value.trim() === '') throw new Error(`Media ${name} must not be empty`)
  return value
}

export function youtubeContentKey(videoId: string): string {
  return `youtube:${requireId('video id', videoId)}`
}

export function postContentKey(platform: string, postId: string, mediaIndex: number): string {
  return `${requireId('platform', platform)}:${requireId('post id', postId)}:${mediaIndex}`
}

export function bytesContentKey(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}
