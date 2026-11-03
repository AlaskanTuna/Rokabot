import type { Client, Message } from 'discord.js'
import type { MediaAttachment } from '../../agent/media/attachments.js'
import { MAX_ATTACHMENTS } from '../../agent/media/mediaRules.js'
import { isMonitored, markActive } from '../../agent/memory/channelMonitor.js'
import { recordEpisodeMessage } from '../../agent/memory/episodeTracker.js'
import { resolveMemoryScope } from '../../agent/memory/memoryScope.js'
import { asksAboutReplies } from '../../agent/replyIntent.js'
import { SOCIAL_POST_FAILURE_MARKER, formatSocialPostLine } from '../../agent/social/format.js'
import { embedVideoMedia, socialPostMedia } from '../../agent/social/media.js'
import { beginSocialPostLookup, socialPostSnapshotTexts, socialPostTexts } from '../../agent/social/service.js'
import { findSocialPostTarget } from '../../agent/social/urls.js'
import { startTurnEntryWork } from '../../agent/turnContext.js'
import { character } from '../../character/index.js'
import { config } from '../../config.js'
import type { ResponseEventInput } from '../../storage/metricsStore.js'
import { upsertUserName } from '../../storage/userNames.js'
import { logger } from '../../utils/logger.js'
import { type CallReservation, RateLimiter } from '../../utils/rateLimiter.js'
import { isChannelBusy, markBusy } from '../concurrency.js'
import { shouldReact } from '../emojiReactor.js'
import { openedPostCitation } from '../messageBuilder.js'
import {
  type SocialPostPresentation,
  collectEmbedVideoUrls,
  extractComponentTexts,
  extractCurrentMessageContent,
  extractMessageContent,
  replaceUserMentions
} from '../messageContent.js'
import { getRandomBusy, getRandomDecline } from '../responses.js'
import {
  type VanishingReply,
  deliverTurn,
  recordTurnEvent,
  releaseTurn,
  replyToFailedTurn,
  reserveTurnBudget,
  runModelTurn
} from '../turnPipeline.js'
import { handleGachaMention } from './gachaMention.js'

/** Whole-word, case-insensitive match for the bot's name as a trigger keyword */
export const NAME_MENTION_REGEX = character.nameTrigger

function recordMonitoredEpisodeMessage(message: Message, botUserId: string): void {
  if (!message.guild || !isMonitored(message.channelId) || config.memory.privacy === 'off') return

  try {
    const content = replaceUserMentions(message, botUserId)
    if (!content) return

    const displayName = message.member?.displayName ?? message.author.displayName
    recordEpisodeMessage({
      guildId: message.guildId!,
      channelId: message.channelId,
      message: {
        messageId: message.id,
        userId: message.author.id,
        displayName,
        content,
        timestamp: message.createdTimestamp,
        isBot: message.author.bot
      }
    })
    if (!message.author.bot) upsertUserName(message.author.id, message.author.username, displayName)
  } catch (error) {
    logger.warn({ channelId: message.channelId, error }, 'Passive memory episode tracking failed')
  }
}

/** Discord adds a link's embed just after the message and patches this cached object in place. */
async function waitForLateEmbeds(message: Message): Promise<void> {
  const deadline = performance.now() + config.media.embedWaitMs
  while (message.embeds.length === 0 && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/** Create a handler for mention/reply message triggers */
export function createMessageHandler(client: Client, rateLimiter: RateLimiter) {
  return async function handleMessageCreate(message: Message): Promise<void> {
    const handlerStartMs = performance.now()
    if (!client.user) return
    if (message.author.id === client.user.id) {
      recordMonitoredEpisodeMessage(message, client.user.id)
      return
    }

    const isBotAuthor = message.author.bot

    // Bots can only trigger via the name keyword — @mention and reply triggers stay humans-only to prevent loops
    const isMentioned = !isBotAuthor && message.mentions.has(client.user.id)
    const componentTextsForTrigger = extractComponentTexts(message.components)
    const triggerScanText = [message.content, ...componentTextsForTrigger].join('\n')
    const isNameMention = NAME_MENTION_REGEX.test(triggerScanText)

    const replyKnownNotBot =
      !isBotAuthor &&
      message.reference?.messageId &&
      message.mentions.repliedUser &&
      message.mentions.repliedUser.id !== client.user.id
    const replyFetch =
      !isBotAuthor && message.reference?.messageId
        ? message.channel.messages.fetch(message.reference.messageId).catch(() => null)
        : Promise.resolve(null)
    const isReplyCandidate = !isBotAuthor && Boolean(message.reference?.messageId) && !replyKnownNotBot
    const currentSocialTexts = socialPostTexts(message)
    const forwardedSocialTexts = socialPostSnapshotTexts(message)
    const hasSocialPostUrl = [...currentSocialTexts, ...forwardedSocialTexts].some((text) => findSocialPostTarget(text))
    const socialPostWork =
      config.socialPosts.enabled &&
      (isMentioned || isNameMention || isReplyCandidate) &&
      (hasSocialPostUrl || Boolean(message.reference?.messageId))
        ? beginSocialPostLookup(
            currentSocialTexts,
            replyFetch.then((referencedMessage) => [
              ...(referencedMessage ? socialPostTexts(referencedMessage) : []),
              ...(referencedMessage && referencedMessage.author?.id === client.user?.id
                ? [openedPostCitation(extractComponentTexts(referencedMessage.components)) ?? '']
                : []),
              ...socialPostSnapshotTexts(message),
              ...(referencedMessage ? socialPostSnapshotTexts(referencedMessage) : [])
            ])
          )
        : null
    let turnEntryWork: ReturnType<typeof startTurnEntryWork> | undefined
    if (isMentioned || isNameMention || isReplyCandidate) {
      const currentMessage = extractCurrentMessageContent(message, client.user.id, componentTextsForTrigger)
      // Resolved once per turn: the entry judgment and the episode recall below share this turn's scope.
      const memoryScope = resolveMemoryScope(true, config.memory.privacy)
      turnEntryWork = startTurnEntryWork({
        channelId: message.channelId,
        guildId: message.guildId ?? `dm:${message.channelId}`,
        userId: message.author.id,
        speakerName: message.member?.displayName ?? message.author.displayName,
        message: currentMessage,
        lookupQuery: replaceUserMentions(message, client.user.id),
        mentionedUserIds: [...(message.mentions.users?.keys() ?? [])].filter((userId) => userId !== client.user?.id),
        memoryScope,
        includeEpisodeRecall: Boolean(message.guildId) && memoryScope === 'full'
      })
    }
    let turnEntryWorkHandedOff = false
    const cancelTurnEntryWork = () => {
      if (turnEntryWork && !turnEntryWorkHandedOff) {
        turnEntryWork.cancel()
        turnEntryWork = undefined
      }
    }

    const say: VanishingReply = async (text) => {
      const sent = await message.reply(text)
      setTimeout(() => sent.delete().catch(() => {}), 5000)
    }

    const referencedMessage = await replyFetch

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

    recordMonitoredEpisodeMessage(message, client.user.id)

    if (!isMentioned && !isReplyToBot && !isNameMention) {
      cancelTurnEntryWork()
      return
    }

    const channelId = message.channelId
    // A metrics and session identity, not a memory tenant. The client has no DirectMessages intent, so
    // this fallback is never reached in production; it stands so a message carrying no guild is still
    // labelled distinctly rather than filed under the real guild (#207).
    const guildId = message.guildId ?? `dm:${channelId}`
    const displayName = message.member?.displayName ?? message.author.displayName
    const username = message.author.username
    const trigger: ResponseEventInput['trigger'] = isMentioned ? 'mention' : isReplyToBot ? 'reply' : 'name_keyword'

    let { content, mediaAttachments, unsupportedCount } = extractMessageContent(
      message,
      referencedMessage,
      isReplyToBot,
      client.user.id,
      componentTextsForTrigger
    )

    const gachaKeywords = /^(gacha|draw|fortune|omikuji)$/i
    if (gachaKeywords.test(content.trim())) {
      const handled = await handleGachaMention(message)
      if (handled) {
        cancelTurnEntryWork()
        return
      }
    }

    if (!content && mediaAttachments.length === 0) {
      content = '(pinged you without saying anything)'
    }

    logger.debug({ channelId, trigger }, 'Message trigger detected')
    logger.debug({ channelId, content, imageCount: mediaAttachments.length }, 'Message content extracted')

    if (isChannelBusy(channelId)) {
      cancelTurnEntryWork()
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      await say(getRandomBusy())
      return
    }

    // Taken before the first await below rather than when generation starts: the post lookup can take
    // seconds, and a second message in that window would find the channel free and run beside this one.
    markBusy(channelId)
    let typingInterval: ReturnType<typeof setInterval> | null = null
    let callReservation: CallReservation | undefined
    let reservedBytes = 0
    // A thrown turn may have issued an unknown number of calls, so treat the full reservation as spent.
    let modelCallsUsed = config.gemini.maxLlmCalls
    try {
      // Check the full call ceiling before reserving so early exits do not hold slots.
      if (!rateLimiter.canAdmitCalls(config.gemini.maxLlmCalls)) {
        cancelTurnEntryWork()
        logger.debug(
          { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
          'Rate limit hit — declining'
        )

        await say(getRandomDecline())
        return
      }

      if ('sendTyping' in message.channel) {
        void message.channel.sendTyping().catch(() => {})
      }
      typingInterval =
        'sendTyping' in message.channel
          ? setInterval(() => {
              ;(message.channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {})
            }, 7000)
          : null

      const socialPostResult = socialPostWork ? await socialPostWork : { status: 'none' as const }
      let socialPresentation: SocialPostPresentation | undefined
      if (socialPostResult.status === 'found') {
        const presentation = {
          target: socialPostResult.post.target,
          line: formatSocialPostLine(socialPostResult.post, config.socialPosts.maxTextChars)
        }
        let enriched = extractMessageContent(
          message,
          referencedMessage,
          isReplyToBot,
          client.user.id,
          componentTextsForTrigger,
          presentation
        )
        if (enriched.mediaAttachments.length < MAX_ATTACHMENTS) {
          const mediaAttachment = await socialPostMedia(socialPostResult.post)
          if (mediaAttachment) {
            enriched = extractMessageContent(
              message,
              referencedMessage,
              isReplyToBot,
              client.user.id,
              componentTextsForTrigger,
              { ...presentation, mediaAttachment }
            )
            socialPresentation = { ...presentation, mediaAttachment }
          } else {
            socialPresentation = presentation
          }
        } else {
          socialPresentation = presentation
        }
        content = enriched.content
        mediaAttachments = enriched.mediaAttachments
        unsupportedCount = enriched.unsupportedCount
      } else if (socialPostResult.status === 'failed') {
        content = content ? `${content}\n${SOCIAL_POST_FAILURE_MARKER}` : SOCIAL_POST_FAILURE_MARKER
      }

      // A playable video in an embed, from Discord's proxy only. Skipped when the turn already carries timed media
      // (an upload or the post's own video wins the one timed slot) and when the post's own video won.
      const hasTimedMedia = mediaAttachments.some(
        (attachment) => attachment.contentType.startsWith('video/') || attachment.contentType.startsWith('audio/')
      )
      const socialVideoWon =
        socialPresentation?.mediaAttachment &&
        (socialPresentation.mediaAttachment.contentType.startsWith('video/') ||
          socialPresentation.mediaAttachment.transport === 'uri')
      const lookupFailed = socialPostResult.status === 'failed'
      const withFailureMarker = (text: string) =>
        lookupFailed && !text.includes(SOCIAL_POST_FAILURE_MARKER)
          ? text
            ? `${text}\n${SOCIAL_POST_FAILURE_MARKER}`
            : SOCIAL_POST_FAILURE_MARKER
          : text
      if (!hasTimedMedia && !socialVideoWon && mediaAttachments.length < MAX_ATTACHMENTS) {
        // A message with no link pays no wait, so the typing acknowledgement keeps its order for it.
        // Suppressed embeds and wrapped-only links never produce one either.
        const embedsSuppressed = message.flags?.has('SuppressEmbeds') ?? false
        const unwrappedContent = (message.content ?? '').replace(/<https?:\/\/[^<>\s]+>/g, '')
        const embedsMayArrive =
          message.embeds.length === 0 && !embedsSuppressed && /https?:\/\//i.test(unwrappedContent)
        if (embedsMayArrive) await waitForLateEmbeds(message)
        let embedVideo: MediaAttachment | null = null
        let embedVideoUrl: string | undefined
        for (const url of collectEmbedVideoUrls(message, referencedMessage, isReplyToBot)) {
          embedVideo = await embedVideoMedia(url)
          if (embedVideo) {
            embedVideoUrl = url
            break
          }
        }
        if (embedVideo || (embedsMayArrive && message.embeds.length > 0)) {
          const reExtracted = extractMessageContent(
            message,
            referencedMessage,
            isReplyToBot,
            client.user.id,
            componentTextsForTrigger,
            socialPresentation,
            embedVideoUrl ? new Set([embedVideoUrl]) : undefined
          )
          content = withFailureMarker(reExtracted.content)
          // The re-extract drops the watched thumbnail, then the video keeps its own slot.
          if (embedVideo) {
            reExtracted.mediaAttachments = [...reExtracted.mediaAttachments.slice(0, MAX_ATTACHMENTS - 1), embedVideo]
          }
          mediaAttachments = reExtracted.mediaAttachments.slice(0, MAX_ATTACHMENTS)
          unsupportedCount = reExtracted.unsupportedCount
        }
      }

      const budget = reserveTurnBudget({
        channelId,
        attachments: mediaAttachments,
        rateLimiter,
        onDeclined: cancelTurnEntryWork
      })
      if (!budget) {
        await say(getRandomBusy())
        return
      }
      const { skippedAttachments } = budget
      mediaAttachments = budget.attachments
      callReservation = budget.callReservation
      reservedBytes = budget.reservedBytes

      turnEntryWorkHandedOff = true
      const turn = await runModelTurn({
        channelId,
        guildId,
        userMessage: content || '(shared an image)',
        displayName,
        username,
        userId: message.author.id,
        messageId: message.id,
        memory: true,
        asksAboutReplies: asksAboutReplies(message.content),
        mentionedUserIds: [...(message.mentions.users?.keys() ?? [])].filter((userId) => userId !== client.user?.id),
        turnEntryWork,
        skippedAttachments,
        mediaAttachments: mediaAttachments.length > 0 ? mediaAttachments : undefined
      })

      // Now that the turn is done, hand back the slots it never used. Reserved at the ceiling, released
      // to the truth.
      modelCallsUsed = turn.modelCalls

      logger.debug({ channelId, tone: turn.tone, responseLength: turn.text.length }, 'ADK response received')

      const channel = message.channel
      await deliverTurn(
        { turn, socialPostResult, unsupported: unsupportedCount, skipped: skippedAttachments },
        channelId,
        {
          sendFirst: (payload) => message.reply(payload),
          sendRest: 'send' in channel ? (payload) => channel.send(payload) : undefined
        }
      )

      recordTurnEvent({ guildId, channelId, userId: message.author.id, trigger }, turn, handlerStartMs)
    } catch (error) {
      await replyToFailedTurn(error, {
        channelId,
        label: 'Error handling message',
        send: (text) => message.reply(text)
      })
    } finally {
      if (typingInterval) clearInterval(typingInterval)
      releaseTurn({ channelId, reservedBytes, callReservation, modelCallsUsed })
    }
  }
}
