import type { Attachment, Message } from 'discord.js'
import type { ImageAttachment } from '../agent/attachments.js'
import { MAX_ATTACHMENTS, isSupportedMedia } from './attachments.js'
import type { SocialPostTarget } from './socialPosts/urls.js'
import { findSocialPostTarget } from './socialPosts/urls.js'

export function replaceUserMentions(message: Message, botId: string | undefined): string {
  return message.content
    .replace(/<@!?(\d+)>/g, (_match, id: string) => {
      if (id === botId) return ''
      const name = message.mentions.members?.get(id)?.displayName ?? message.mentions.users?.get(id)?.username
      return name ? `@${name}` : ''
    })
    .trim()
}

const TEXT_DISPLAY = 10
const SECTION = 9
const CONTAINER = 17
const THUMBNAIL = 11
const MEDIA_GALLERY = 12
const FILE = 13

interface UnfurledMedia {
  url?: string
  content_type?: string
  size?: number
}

interface RawComponent {
  type: number
  content?: string
  components?: RawComponent[]
  label?: string
  media?: UnfurledMedia
  items?: Array<{ media?: UnfurledMedia }>
  file?: UnfurledMedia
  size?: number
}

function describeEmbed(embed: Message['embeds'][number]): string | null {
  const parts: string[] = []
  if (embed.author?.name) parts.push(`Author: ${embed.author.name}`)
  if (embed.title) parts.push(`Title: ${embed.title}`)
  if (embed.description) parts.push(embed.description)
  for (const field of embed.fields) {
    parts.push(`${field.name}: ${field.value}`)
  }
  if (embed.footer?.text) parts.push(`Footer: ${embed.footer.text}`)
  // Embedded video stays textual until video intake can process it.
  if (embed.video) parts.push(embed.data.type === 'gifv' ? 'animated GIF' : 'video')
  return parts.length > 0 ? `[Embed: ${parts.join(' | ')}]` : null
}

export interface SocialPostPresentation {
  target: SocialPostTarget
  line: string
  imageAttachment?: ImageAttachment
}

function embedMatchesSocialPost(
  embed: Message['embeds'][number],
  socialPost: SocialPostPresentation | undefined
): boolean {
  if (!socialPost) return false
  const texts = [embed.url, embed.description, ...embed.fields.map((field) => field.value)].filter(
    (value): value is string => Boolean(value)
  )
  return texts.some((text) => findSocialPostTarget(text)?.lookupKey === socialPost.target.lookupKey)
}

function describePoll(poll: NonNullable<Message['poll']>): string | null {
  const parts: string[] = []
  if (poll.question.text) parts.push(`Poll: ${poll.question.text}`)
  for (const answer of poll.answers.values()) {
    if (answer.text) parts.push(`- ${answer.text}`)
  }
  return parts.length > 0 ? `[${parts.join(' | ')}]` : null
}

export function extractComponentTexts(components: Message['components']): string[] {
  const texts: string[] = []

  function walk(items: RawComponent[]) {
    for (const item of items) {
      if (item.type === TEXT_DISPLAY && typeof item.content === 'string') {
        texts.push(item.content)
      }
      if (item.type === CONTAINER || item.type === SECTION) {
        if (item.components) walk(item.components)
      }
      if (item.label) {
        texts.push(item.label)
      }
      if (item.components && item.type !== CONTAINER && item.type !== SECTION) {
        walk(item.components)
      }
    }
  }

  const raw = components.map((c) => c.toJSON()) as unknown as RawComponent[]
  walk(raw)

  return texts
}

function extractComponentMedia(components: Message['components']): { media: ImageAttachment[]; unreadable: number } {
  const media: ImageAttachment[] = []
  let unreadable = 0

  const take = (item: UnfurledMedia | undefined, statedSize?: number) => {
    if (!item?.url) return
    const contentType = item.content_type?.split(';')[0].trim().toLowerCase()
    if (!contentType || !isSupportedMedia({ contentType })) {
      unreadable += 1
      return
    }
    media.push({ url: item.url, contentType, size: item.size ?? statedSize })
  }

  function walk(items: RawComponent[]) {
    for (const item of items) {
      if (item.type === THUMBNAIL) take(item.media)
      if (item.type === MEDIA_GALLERY) for (const entry of item.items ?? []) take(entry.media)
      if (item.type === FILE) take(item.file, item.size)
      if (item.components) walk(item.components)
    }
  }

  walk(components.map((c) => c.toJSON()) as unknown as RawComponent[])
  return { media, unreadable }
}

interface ForwardedContent {
  parts: string[]
  images: ImageAttachment[]
  hasSocialPost: boolean
}

function toMediaAttachment(attachment: Attachment): ImageAttachment {
  const { url, contentType, size, duration } = attachment
  return { url, contentType: contentType!, size, ...(duration ? { durationSec: duration } : {}) }
}

type MediaSource = Required<Pick<ImageAttachment, 'origin' | 'sourceMessageId' | 'sourceAuthorId'>>

// Only watched media (audio and video) is remembered, so only it carries where it came from.
function fromSource(source: MediaSource): (attachment: ImageAttachment) => ImageAttachment {
  return (attachment) =>
    attachment.contentType.startsWith('audio/') || attachment.contentType.startsWith('video/')
      ? { ...attachment, ...source }
      : attachment
}

type MediaKind = 'image' | 'video' | 'audio clip' | 'document'

const MEDIA_KIND_ORDER: MediaKind[] = ['image', 'video', 'audio clip', 'document']

function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio clip'
  return 'document'
}

function mediaMarker(prefix: 'forwarded' | 'attached', candidates: ImageAttachment[], taken: number): string[] {
  const counts = new Map<MediaKind, { total: number; taken: number }>()

  candidates.forEach((candidate, index) => {
    const kind = mediaKind(candidate.contentType)
    const count = counts.get(kind) ?? { total: 0, taken: 0 }
    count.total += 1
    if (index < taken) count.taken += 1
    counts.set(kind, count)
  })

  return MEDIA_KIND_ORDER.flatMap((kind) => {
    const count = counts.get(kind)
    if (!count) return []
    const unseen = count.total - count.taken
    return [unseen > 0 ? `(${prefix} ${kind}(s), ${unseen} not shown)` : `(${prefix} ${kind}(s))`]
  })
}

function describeForwardedSnapshots(
  snapshots: Message['messageSnapshots'],
  imageSlots: number,
  forwardedIn: string,
  socialPost?: SocialPostPresentation
): ForwardedContent {
  const parts: string[] = []
  const images: ImageAttachment[] = []
  let hasSocialPost = false

  for (const snapshot of snapshots.values()) {
    const fwdParts: string[] = []

    const fwdContent = snapshot.content?.trim()
    if (fwdContent) fwdParts.push(fwdContent)

    if (snapshot.components && snapshot.components.length > 0) {
      const compTexts = extractComponentTexts(snapshot.components)
      if (compTexts.length > 0) fwdParts.push(compTexts.join(' | '))
    }

    // Forwarded links can carry their source context in embed fields beyond the title and description.
    for (const embed of snapshot.embeds ?? []) {
      if (embedMatchesSocialPost(embed, socialPost)) {
        if (!hasSocialPost) fwdParts.push(socialPost!.line)
        hasSocialPost = true
        continue
      }
      const described = describeEmbed(embed)
      if (described) fwdParts.push(described)
    }

    const fwdAttachments = snapshot.attachments ? [...snapshot.attachments.values()] : []
    const fwdCandidates = fwdAttachments
      .filter(isSupportedMedia)
      .map(toMediaAttachment)
      .map(fromSource({ origin: 'forward', sourceMessageId: forwardedIn, sourceAuthorId: null }))
    const fwdImages = fwdCandidates.slice(0, imageSlots - images.length)
    images.push(...fwdImages)

    fwdParts.push(...mediaMarker('forwarded', fwdCandidates, fwdImages.length))

    if (fwdParts.length > 0) parts.push(`[Forwarded: ${fwdParts.join(' | ')}]`)
  }

  return { parts, images, hasSocialPost }
}

export interface ExtractedMessageContent {
  content: string
  imageAttachments: ImageAttachment[]
  unsupportedCount: number
}

export function extractMessageContent(
  message: Message,
  referencedMessage: Message | null,
  isReplyToBot: boolean,
  botId: string | undefined,
  componentTextsForTrigger: string[],
  socialPost?: SocialPostPresentation
): ExtractedMessageContent {
  let content = replaceUserMentions(message, botId)

  const ownSource = fromSource({ origin: 'upload', sourceMessageId: message.id, sourceAuthorId: message.author.id })
  const imageAttachments: ImageAttachment[] = message.attachments
    .filter(isSupportedMedia)
    .map(toMediaAttachment)
    .map(ownSource)
    .slice(0, MAX_ATTACHMENTS)

  const componentMedia = extractComponentMedia(message.components)
  imageAttachments.push(...componentMedia.media.map(ownSource).slice(0, MAX_ATTACHMENTS - imageAttachments.length))

  const ownParts: string[] = []
  if (componentTextsForTrigger.length > 0) ownParts.push(`[Container: ${componentTextsForTrigger.join(' | ')}]`)
  let socialPostIncluded = false
  for (const embed of message.embeds) {
    if (embedMatchesSocialPost(embed, socialPost)) {
      if (!socialPostIncluded) ownParts.push(socialPost!.line)
      socialPostIncluded = true
      continue
    }
    const described = describeEmbed(embed)
    if (described) ownParts.push(described)
  }
  if (message.poll) {
    const described = describePoll(message.poll)
    if (described) ownParts.push(described)
  }
  if (message.stickers.size > 0) {
    // Stickers may be animated formats the vision model cannot read.
    ownParts.push(`(sticker: ${message.stickers.map((sticker) => sticker.name).join(', ')})`)
  }

  const ownEmbedImages: ImageAttachment[] = []
  for (const embed of message.embeds) {
    if (embedMatchesSocialPost(embed, socialPost)) continue
    const embedImageUrl = embed.image?.url ?? embed.thumbnail?.url
    if (embedImageUrl) ownEmbedImages.push({ url: embedImageUrl, contentType: 'image/png' })
  }

  const forwarded = describeForwardedSnapshots(
    message.messageSnapshots,
    MAX_ATTACHMENTS - imageAttachments.length,
    message.id,
    socialPost
  )
  ownParts.push(...forwarded.parts)
  imageAttachments.push(...forwarded.images)
  socialPostIncluded ||= forwarded.hasSocialPost

  if (ownParts.length > 0) {
    content = content ? `${content}\n${ownParts.join('\n')}` : ownParts.join('\n')
  }
  const ownAttachments = [...message.attachments.values()]
  const unsupportedCount =
    ownAttachments.length - ownAttachments.filter(isSupportedMedia).length + componentMedia.unreadable
  const referencedEmbedImages: ImageAttachment[] = []

  if (referencedMessage) {
    const refAuthor = referencedMessage.member?.displayName ?? referencedMessage.author.displayName
    const refContent = referencedMessage.content?.trim()

    const refParts: string[] = []
    if (refContent) refParts.push(refContent)

    for (const embed of referencedMessage.embeds) {
      if (embedMatchesSocialPost(embed, socialPost)) {
        if (!socialPostIncluded) refParts.push(socialPost!.line)
        socialPostIncluded = true
        continue
      }
      const described = describeEmbed(embed)
      if (described) refParts.push(described)
    }

    if (referencedMessage.poll) {
      const described = describePoll(referencedMessage.poll)
      if (described) refParts.push(described)
    }

    const forwardedRef = describeForwardedSnapshots(
      referencedMessage.messageSnapshots,
      MAX_ATTACHMENTS - imageAttachments.length,
      referencedMessage.id,
      socialPost
    )
    refParts.push(...forwardedRef.parts)
    imageAttachments.push(...forwardedRef.images)
    socialPostIncluded ||= forwardedRef.hasSocialPost

    if (referencedMessage.components.length > 0) {
      const componentTexts = extractComponentTexts(referencedMessage.components)
      if (componentTexts.length > 0) {
        refParts.push(`[Container: ${componentTexts.join(' | ')}]`)
      }
    }

    if (referencedMessage.stickers.size > 0) {
      const stickerNames = referencedMessage.stickers.map((s) => s.name).join(', ')
      refParts.push(`(sticker: ${stickerNames})`)
    }

    const refAttachments = [...referencedMessage.attachments.values()]
    const refMediaCandidates: ImageAttachment[] = refAttachments
      .filter(isSupportedMedia)
      .map(toMediaAttachment)
      .map(
        fromSource({
          origin: 'reply',
          sourceMessageId: referencedMessage.id,
          sourceAuthorId: referencedMessage.author.id
        })
      )
    const refMediaTaken = isReplyToBot ? [] : refMediaCandidates.slice(0, MAX_ATTACHMENTS - imageAttachments.length)
    refParts.push(...mediaMarker('attached', refMediaCandidates, refMediaTaken.length))
    const unsupportedRefCount = refAttachments.length - refAttachments.filter(isSupportedMedia).length
    if (unsupportedRefCount > 0) refParts.push("(attached file(s) of a type that can't be opened)")

    if (refParts.length > 0) {
      const refContext = `[Replying to ${refAuthor}: ${refParts.join('\n')}]`
      content = content ? `${refContext}\n${content}` : refContext
    }

    if (!isReplyToBot) {
      imageAttachments.push(...refMediaTaken)

      for (const embed of referencedMessage.embeds) {
        if (embedMatchesSocialPost(embed, socialPost)) continue
        const embedImageUrl = embed.image?.url ?? embed.thumbnail?.url
        if (embedImageUrl) referencedEmbedImages.push({ url: embedImageUrl, contentType: 'image/png' })
      }
    }
  }

  imageAttachments.push(...ownEmbedImages.slice(0, MAX_ATTACHMENTS - imageAttachments.length))
  imageAttachments.push(...referencedEmbedImages.slice(0, MAX_ATTACHMENTS - imageAttachments.length))

  if (socialPost && !socialPostIncluded) content = content ? `${content}\n${socialPost.line}` : socialPost.line
  if (socialPost?.imageAttachment && imageAttachments.length < MAX_ATTACHMENTS) {
    imageAttachments.push(socialPost.imageAttachment)
  }

  return { content, imageAttachments, unsupportedCount }
}

export function extractCurrentMessageContent(
  message: Message,
  botId: string | undefined,
  componentTextsForTrigger: string[]
): string {
  return extractMessageContent(message, null, false, botId, componentTextsForTrigger).content
}
