import type { Client, Message } from 'discord.js'
import { DiscordAPIError } from 'discord.js'
import { isMonitored, markActive } from '../../agent/channelMonitor.js'
import { shouldExtract } from '../../agent/memory/candidateGate.js'
import { getActiveClaims } from '../../agent/memory/memoryClaims.js'
import { enqueueAndSchedule } from '../../agent/memory/scheduler.js'
import { maybeExtractFromBuffer } from '../../agent/memoryExtractor.js'
import { addMessage as addToPassiveBuffer, getMessages } from '../../agent/passiveBuffer.js'
import { type ImageAttachment, generateResponse } from '../../agent/roka.js'
import { withSearchCitations } from '../../agent/searchCitations.js'
import { config } from '../../config.js'
import { type ResponseEventInput, recordResponseEvent } from '../../storage/metricsStore.js'
import { upsertUserName } from '../../storage/userNames.js'
import { logger } from '../../utils/logger.js'
import { RateLimiter } from '../../utils/rateLimiter.js'
import { MAX_ATTACHMENTS, isSupportedImage, isSupportedMedia } from '../attachments.js'
import { release, reservationFor, tryReserve } from '../byteBudget.js'
import { isChannelBusy, markBusy, markFree } from '../concurrency.js'
import { shouldReact } from '../emojiReactor.js'
import { isIgnorableDiscordError } from '../errorHandler.js'
import { buildRokaMessage } from '../messageBuilder.js'
import {
  getRandomBusy,
  getRandomDecline,
  getRandomError,
  getRandomPartialAttachment,
  getRandomUnsupportedAttachment,
  splitResponse
} from '../responses.js'
import { handleGachaMention } from './gachaMention.js'

/** Strip the bot's own mention; replace other user mentions with @display-name so names survive into the prompt */
function replaceUserMentions(message: Message, botId: string | undefined): string {
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

interface RawComponent {
  type: number
  content?: string
  components?: RawComponent[]
  label?: string
}

/** Recursively extract text content from Discord message components */
function describeEmbed(embed: Message['embeds'][number]): string | null {
  const parts: string[] = []
  if (embed.author?.name) parts.push(`Author: ${embed.author.name}`)
  if (embed.title) parts.push(`Title: ${embed.title}`)
  if (embed.description) parts.push(embed.description)
  for (const field of embed.fields) {
    parts.push(`${field.name}: ${field.value}`)
  }
  if (embed.footer?.text) parts.push(`Footer: ${embed.footer.text}`)
  // A pasted Tenor or Giphy link arrives as a gifv embed whose only content is embed.video — no title, no
  // description — so this returned null and the message reached her as a bare mention. Named rather than
  // fetched: embed.video.url serves an MP4, and everything bound for the vision slots goes through sharp,
  // which cannot decode one. Showing her the motion needs #100's video intake, not this.
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

function extractComponentTexts(components: Message['components']): string[] {
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

interface ForwardedContent {
  parts: string[]
  images: ImageAttachment[]
}

/**
 * A forwarded message carries its payload in messageSnapshots rather than on the message itself. Shared by both
 * paths so a forward reads the same whether it was sent to her directly or replied to; `imageSlots` is what is
 * left of the shared ceiling, so a forward can never out-bid what the sender attached themselves.
 */
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

    // Read through describeEmbed rather than title+description: a forwarded link keeps its substance in the
    // embed, and the narrower form dropped the author, fields and footer that say where it came from.
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

    // Counted off the candidates, not the ones taken. This marker is not a caption for an image she can
    // already see — its only value is naming one she cannot, so keying it to the taken count dropped it in
    // exactly the case where it carried information, and she answered as though nothing had been forwarded.
    const unseen = fwdCandidates.length - fwdImages.length
    if (fwdCandidates.length > 0) {
      fwdParts.push(unseen > 0 ? `(forwarded image(s), ${unseen} not shown)` : '(forwarded image(s))')
    }

    if (fwdParts.length > 0) parts.push(`[Forwarded: ${fwdParts.join(' | ')}]`)
  }

  return { parts, images }
}

/** Whole-word, case-insensitive match for the bot's name as a trigger keyword */
export const NAME_MENTION_REGEX = /\broka\b/i

function dispatchClaimExtraction(channelId: string, guildId: string): void {
  try {
    const messages = [...getMessages(channelId)]
    const userIds = new Set(messages.map((message) => message.userId))
    const knownClaimKeys = new Set(
      [...userIds].flatMap((userId) => getActiveClaims(guildId, userId).map((claim) => claim.predicate))
    )

    if (!shouldExtract(messages, knownClaimKeys).extract) return

    enqueueAndSchedule({
      guildId,
      channelId,
      messages: messages.map(({ userId, displayName, content }) => ({ userId, displayName, content }))
    })
  } catch (error) {
    logger.warn({ channelId, guildId, error }, 'Claim extraction dispatch failed')
  }
}

/** Create a handler for mention/reply message triggers */
export function createMessageHandler(client: Client, rateLimiter: RateLimiter) {
  return async function handleMessageCreate(message: Message): Promise<void> {
    const handlerStartMs = performance.now()
    if (!client.user) return
    if (message.author.id === client.user.id) return // never react to own messages

    const isBotAuthor = message.author.bot

    // Bots can only trigger via the name keyword — @mention and reply triggers stay humans-only to prevent loops
    const isMentioned = !isBotAuthor && message.mentions.has(client.user.id)
    const componentTextsForTrigger = extractComponentTexts(message.components)
    const triggerScanText = [message.content, ...componentTextsForTrigger].join('\n')
    const isNameMention = NAME_MENTION_REGEX.test(triggerScanText)

    const referencedMessage =
      !isBotAuthor && message.reference?.messageId
        ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
        : null

    const isReplyToBot = referencedMessage?.author?.id === client.user.id

    if (message.guild && !isBotAuthor) {
      const emoji = shouldReact(message.content, message.channelId)
      if (emoji) {
        message.react(emoji).catch(() => {})
      }
    }

    // Activate monitoring before buffering so first @mention is captured
    if (isMentioned || isReplyToBot || isNameMention) {
      markActive(message.channelId)
    }

    if (message.guild && !message.author.bot && isMonitored(message.channelId)) {
      const msgContent = replaceUserMentions(message, client.user?.id)
      if (msgContent) {
        const memberDisplayName = message.member?.displayName ?? message.author.displayName
        addToPassiveBuffer(message.channelId, message.author.id, memberDisplayName, message.author.username, msgContent)
        upsertUserName(message.author.id, message.author.username, memberDisplayName)
        if (config.memory.claimsBackend) {
          dispatchClaimExtraction(message.channelId, message.guildId ?? `dm:${message.channelId}`)
        } else {
          maybeExtractFromBuffer(message.channelId, client.user?.id, message.guildId ?? undefined)
        }
      }
    }

    if (!isMentioned && !isReplyToBot && !isNameMention) return

    const channelId = message.channelId
    const guildId = message.guildId ?? `dm:${channelId}`
    const displayName = message.member?.displayName ?? message.author.displayName
    const username = message.author.username
    const trigger: ResponseEventInput['trigger'] = isMentioned ? 'mention' : isReplyToBot ? 'reply' : 'name_keyword'

    let content = replaceUserMentions(message, client.user?.id)

    const imageAttachments: ImageAttachment[] = message.attachments
      .filter(isSupportedMedia)
      .map((a) => ({ url: a.url, contentType: a.contentType!, size: a.size }))
      .slice(0, MAX_ATTACHMENTS)

    // Everything else this message shows. The replied-to message has always been read this thoroughly; the
    // message actually being sent to her was not, so a shared link's preview text — where the substance of a
    // link preview lives — reached her as nothing at all. Container text was read, but only when there was no
    // message text beside it, so a message carrying both lost its container entirely.
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
      // Name only: stickers may be APNG or Lottie, neither of which is a still image the vision model reads.
      ownParts.push(`(sticker: ${message.stickers.map((sticker) => sticker.name).join(', ')})`)
    }

    // Embed images are genuinely visual, so they compete for the same slots as attachments rather than
    // getting their own budget — the sender's own message fills them before the replied-to one does.
    for (const embed of message.embeds) {
      if (imageAttachments.length >= MAX_ATTACHMENTS) break
      const embedImageUrl = embed.image?.url ?? embed.thumbnail?.url
      if (embedImageUrl) imageAttachments.push({ url: embedImageUrl, contentType: 'image/png' })
    }

    // Forwarding something and asking about it in the same breath is the more natural gesture than replying
    // to it, and it was the one that reached her as a bare mention. Last of the sender's own sources: a
    // forward is someone else's post, so it fills image slots only after what they attached or linked.
    const forwarded = describeForwardedSnapshots(message.messageSnapshots, MAX_ATTACHMENTS - imageAttachments.length)
    ownParts.push(...forwarded.parts)
    imageAttachments.push(...forwarded.images)

    if (ownParts.length > 0) {
      content = content ? `${content}\n${ownParts.join('\n')}` : ownParts.join('\n')
    }
    // Only what this message carried: a forwarded or replied-to file is not what the sender just handed her.
    // Materialised first so the count reads the same off a discord.js Collection or a plain array.
    const ownAttachments = [...message.attachments.values()]
    const unsupportedCount = ownAttachments.length - ownAttachments.filter(isSupportedMedia).length

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

      // Counted off supported-image candidates, not raw attachment count: this marker's only value is
      // naming an image she cannot see, so an unfiltered count asserted a replied-to PDF was an image and
      // she answered as though describing one. #107 settled the same question for the forwarded marker;
      // this line predated that decision. Materialised so the count reads the same off a discord.js
      // Collection or a plain array.
      const refImageCandidates: ImageAttachment[] = [...referencedMessage.attachments.values()]
        .filter(isSupportedImage)
        .map((a) => ({ url: a.url, contentType: a.contentType!, size: a.size }))
      // Her own expression thumbnails are skipped deliberately to save tokens, so a reply to herself takes
      // nothing — the marker names those as unseen rather than claiming she can see them.
      const refImagesTaken = isReplyToBot ? [] : refImageCandidates.slice(0, MAX_ATTACHMENTS - imageAttachments.length)
      const refUnseen = refImageCandidates.length - refImagesTaken.length
      if (refImageCandidates.length > 0) {
        refParts.push(refUnseen > 0 ? `(attached image(s), ${refUnseen} not shown)` : '(attached image(s))')
      }

      if (refParts.length > 0) {
        const refContext = `[Replying to ${refAuthor}: ${refParts.join('\n')}]`
        content = content ? `${refContext}\n${content}` : refContext
      }

      // Skip image extraction from bot's own messages (expression thumbnails waste tokens)
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

    const gachaKeywords = /^(gacha|draw|fortune|omikuji)$/i
    if (gachaKeywords.test(content.trim())) {
      const handled = await handleGachaMention(message)
      if (handled) return
    }

    if (!content && imageAttachments.length === 0) {
      content = '(pinged you without saying anything)'
    }

    logger.debug({ channelId, trigger }, 'Message trigger detected')
    logger.debug({ channelId, content, imageCount: imageAttachments.length }, 'Message content extracted')

    if (isChannelBusy(channelId)) {
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      const busyMsg = await message.reply(getRandomBusy())
      setTimeout(() => busyMsg.delete().catch(() => {}), 5000)
      return
    }

    if (!rateLimiter.tryConsume()) {
      logger.debug(
        { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
        'Rate limit hit — declining'
      )

      const declineMsg = await message.reply(getRandomDecline())
      setTimeout(() => declineMsg.delete().catch(() => {}), 5000)
      return
    }

    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping()
    }
    const typingInterval =
      'sendTyping' in message.channel
        ? setInterval(() => {
            ;(message.channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {})
          }, 7000)
        : null

    // Reserved here rather than earlier so nothing can throw between taking the bytes and the try/finally
    // that hands them back — a reservation that leaks becomes a permanent refusal, not a failed turn.
    const reservedBytes = reservationFor(imageAttachments)
    if (!tryReserve(reservedBytes)) {
      if (typingInterval) clearInterval(typingInterval)
      logger.debug({ channelId, reservedBytes }, 'In-flight attachment budget full — sending busy message')
      const budgetMsg = await message.reply(getRandomBusy())
      setTimeout(() => budgetMsg.delete().catch(() => {}), 5000)
      return
    }

    try {
      // Inside the try, not before it, so the reservation above cannot be stranded by anything between the
      // two — markFree on a channel that was never marked is a no-op delete, so this costs nothing.
      markBusy(channelId)
      const [{ text: responseText, tone, toolsUsed, metrics, droppedAttachments, truncatedAttachments }, sources] =
        await withSearchCitations(() =>
          generateResponse({
            channelId,
            guildId,
            userMessage: content || '(shared an image)',
            displayName,
            username,
            userId: message.author.id,
            imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
          })
        )

      logger.debug({ channelId, tone, responseLength: responseText.length }, 'ADK response received')

      // Same nudge as /ask: she answers either way, and says plainly the file was not one she can open, whether
      // the type was wrong or the bytes never arrived — an oversized clip passes the type check and fails later.
      // Two different things to say, and they are not alternatives: a turn can carry one file she could not
      // open and another she could only take the opening of.
      const notes: string[] = []
      if (unsupportedCount > 0 || droppedAttachments > 0) notes.push(getRandomUnsupportedAttachment())
      if (truncatedAttachments > 0) notes.push(getRandomPartialAttachment())
      const withNudge = notes.length > 0 ? `${responseText}\n\n${notes.join('\n\n')}` : responseText
      const chunks = splitResponse(withNudge)
      logger.debug({ channelId, chunkCount: chunks.length }, 'Response split into chunks')
      await message.reply(buildRokaMessage(chunks[0], tone, toolsUsed, sources))

      for (let i = 1; i < chunks.length; i++) {
        if ('send' in message.channel) {
          await message.channel.send(buildRokaMessage(chunks[i], tone))
        }
      }

      const responseEvent: ResponseEventInput = {
        guildId,
        channelId,
        userId: message.author.id,
        trigger,
        tone,
        toolsUsed,
        e2eMs: Math.max(1, Math.round(performance.now() - handlerStartMs)),
        ...metrics
      }
      logger.info(responseEvent, 'Response completed')
      recordResponseEvent(responseEvent)

      // Add bot response to passive buffer for richer extraction context
      if (message.guild && client.user && isMonitored(channelId)) {
        const botName = message.guild.members.me?.displayName ?? client.user.displayName
        addToPassiveBuffer(channelId, client.user.id, botName, client.user.username, responseText)
        if (config.memory.claimsBackend) {
          dispatchClaimExtraction(channelId, message.guildId ?? `dm:${channelId}`)
        } else {
          maybeExtractFromBuffer(channelId, client.user.id, message.guildId ?? undefined)
        }
      }
    } catch (error) {
      if (isIgnorableDiscordError(error)) {
        logger.warn({ error, channelId, code: (error as DiscordAPIError).code }, 'Discord API error (ignored)')
        return
      }
      const errDetail =
        error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
      logger.error({ error: errDetail, channelId }, 'Error handling message')
      try {
        await message.reply(getRandomError())
      } catch (replyError) {
        if (isIgnorableDiscordError(replyError)) {
          logger.warn({ error: replyError, channelId }, 'Could not send error reply (ignored)')
        } else {
          logger.error({ error: replyError, channelId }, 'Failed to send error reply')
        }
      }
    } finally {
      if (typingInterval) clearInterval(typingInterval)
      markFree(channelId)
      release(reservedBytes)
    }
  }
}
