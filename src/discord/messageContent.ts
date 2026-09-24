import type { Message } from 'discord.js'
import type { ImageAttachment } from '../agent/attachments.js'
import { MAX_ATTACHMENTS, isSupportedImage, isSupportedMedia } from './attachments.js'

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
}

function describeForwardedSnapshots(snapshots: Message['messageSnapshots'], imageSlots: number): ForwardedContent {
  const parts: string[] = []
  const images: ImageAttachment[] = []

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
      const described = describeEmbed(embed)
      if (described) fwdParts.push(described)
    }

    const fwdAttachments = snapshot.attachments ? [...snapshot.attachments.values()] : []
    const fwdCandidates = fwdAttachments
      .filter(isSupportedImage)
      .map((a) => ({ url: a.url, contentType: a.contentType!, size: a.size }))
    const fwdImages = fwdCandidates.slice(0, imageSlots - images.length)
    images.push(...fwdImages)

    const unseen = fwdCandidates.length - fwdImages.length
    if (fwdCandidates.length > 0) {
      fwdParts.push(unseen > 0 ? `(forwarded image(s), ${unseen} not shown)` : '(forwarded image(s))')
    }

    if (fwdParts.length > 0) parts.push(`[Forwarded: ${fwdParts.join(' | ')}]`)
  }

  return { parts, images }
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
  componentTextsForTrigger: string[]
): ExtractedMessageContent {
  let content = replaceUserMentions(message, botId)

  const imageAttachments: ImageAttachment[] = message.attachments
    .filter(isSupportedMedia)
    .map((a) => ({ url: a.url, contentType: a.contentType!, size: a.size }))
    .slice(0, MAX_ATTACHMENTS)

  const componentMedia = extractComponentMedia(message.components)
  imageAttachments.push(...componentMedia.media.slice(0, MAX_ATTACHMENTS - imageAttachments.length))

  const ownParts: string[] = []
  if (componentTextsForTrigger.length > 0) ownParts.push(`[Container: ${componentTextsForTrigger.join(' | ')}]`)
  for (const embed of message.embeds) {
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

  for (const embed of message.embeds) {
    if (imageAttachments.length >= MAX_ATTACHMENTS) break
    const embedImageUrl = embed.image?.url ?? embed.thumbnail?.url
    if (embedImageUrl) imageAttachments.push({ url: embedImageUrl, contentType: 'image/png' })
  }

  const forwarded = describeForwardedSnapshots(message.messageSnapshots, MAX_ATTACHMENTS - imageAttachments.length)
  ownParts.push(...forwarded.parts)
  imageAttachments.push(...forwarded.images)

  if (ownParts.length > 0) {
    content = content ? `${content}\n${ownParts.join('\n')}` : ownParts.join('\n')
  }
  const ownAttachments = [...message.attachments.values()]
  const unsupportedCount =
    ownAttachments.length - ownAttachments.filter(isSupportedMedia).length + componentMedia.unreadable

  if (referencedMessage) {
    const refAuthor = referencedMessage.member?.displayName ?? referencedMessage.author.displayName
    const refContent = referencedMessage.content?.trim()

    const refParts: string[] = []
    if (refContent) refParts.push(refContent)

    for (const embed of referencedMessage.embeds) {
      const described = describeEmbed(embed)
      if (described) refParts.push(described)
    }

    if (referencedMessage.poll) {
      const described = describePoll(referencedMessage.poll)
      if (described) refParts.push(described)
    }

    const forwardedRef = describeForwardedSnapshots(
      referencedMessage.messageSnapshots,
      MAX_ATTACHMENTS - imageAttachments.length
    )
    refParts.push(...forwardedRef.parts)
    imageAttachments.push(...forwardedRef.images)

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

    const refImageCandidates: ImageAttachment[] = [...referencedMessage.attachments.values()]
      .filter(isSupportedImage)
      .map((a) => ({ url: a.url, contentType: a.contentType!, size: a.size }))
    const refImagesTaken = isReplyToBot ? [] : refImageCandidates.slice(0, MAX_ATTACHMENTS - imageAttachments.length)
    const refUnseen = refImageCandidates.length - refImagesTaken.length
    if (refImageCandidates.length > 0) {
      refParts.push(refUnseen > 0 ? `(attached image(s), ${refUnseen} not shown)` : '(attached image(s))')
    }

    if (refParts.length > 0) {
      const refContext = `[Replying to ${refAuthor}: ${refParts.join('\n')}]`
      content = content ? `${refContext}\n${content}` : refContext
    }

    if (!isReplyToBot) {
      imageAttachments.push(...refImagesTaken)

      if (imageAttachments.length < MAX_ATTACHMENTS) {
        for (const embed of referencedMessage.embeds) {
          if (imageAttachments.length >= MAX_ATTACHMENTS) break
          const embedImageUrl = embed.image?.url ?? embed.thumbnail?.url
          if (embedImageUrl) {
            imageAttachments.push({ url: embedImageUrl, contentType: 'image/png' })
          }
        }
      }
    }
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
