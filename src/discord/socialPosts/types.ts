import type { SocialPlatform, SocialPostTarget } from './urls.js'

export interface SocialPost {
  platform: SocialPlatform
  id: string
  canonicalUrl: string
  target: SocialPostTarget
  authorHandle: string
  authorName: string
  createdAt: string | null
  text: string
  quotedText: string
  quotedAuthorHandle: string
  photoCount: number
  videoCount: number
  imageUrl: string | null
  externalTitle: string
  replyCount: number | null
}

export type SocialPostLookup =
  | { status: 'found'; post: SocialPost }
  | { status: 'failed'; platform: SocialPlatform; reason: string }
  | { status: 'none' }
