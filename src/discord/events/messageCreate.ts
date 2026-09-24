import type { Client, Message } from 'discord.js'
import { DiscordAPIError } from 'discord.js'
import { isMonitored, markActive } from '../../agent/channelMonitor.js'
import { recordEpisodeMessage } from '../../agent/memory/episodeTracker.js'
import { generateResponse } from '../../agent/roka.js'
import { withSearchCitations } from '../../agent/searchCitations.js'
import { canAffordAttachments } from '../../agent/tokenBudget.js'
import { config } from '../../config.js'
import { type ResponseEventInput, recordResponseEvent } from '../../storage/metricsStore.js'
import { upsertUserName } from '../../storage/userNames.js'
import { logger } from '../../utils/logger.js'
import { RateLimiter } from '../../utils/rateLimiter.js'
import { release, reservationFor, tryReserve } from '../byteBudget.js'
import { isChannelBusy, markBusy, markFree } from '../concurrency.js'
import { shouldReact } from '../emojiReactor.js'
import { isIgnorableDiscordError } from '../errorHandler.js'
import { buildRokaMessage } from '../messageBuilder.js'
import { extractComponentTexts, extractMessageContent, replaceUserMentions } from '../messageContent.js'
import {
  escapeBackticks,
  getRandomBusy,
  getRandomDecline,
  getRandomError,
  getRandomOversizedAttachment,
  getRandomPartialAttachment,
  getRandomUnsupportedAttachment,
  splitResponse
} from '../responses.js'
import { handleGachaMention } from './gachaMention.js'

/** Whole-word, case-insensitive match for the bot's name as a trigger keyword */
export const NAME_MENTION_REGEX = /\broka\b/i

function recordMonitoredEpisodeMessage(message: Message, botUserId: string): void {
  if (!message.guild || !isMonitored(message.channelId)) return

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

    recordMonitoredEpisodeMessage(message, client.user.id)
    if (!isMentioned && !isReplyToBot && !isNameMention) return

    const channelId = message.channelId
    const guildId = message.guildId ?? `dm:${channelId}`
    const displayName = message.member?.displayName ?? message.author.displayName
    const username = message.author.username
    const trigger: ResponseEventInput['trigger'] = isMentioned ? 'mention' : isReplyToBot ? 'reply' : 'name_keyword'

    let { content, imageAttachments, unsupportedCount } = extractMessageContent(
      message,
      referencedMessage,
      isReplyToBot,
      client.user.id,
      componentTextsForTrigger
    )

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

    // Check the full call ceiling before reserving so early exits do not hold slots.
    if (!rateLimiter.canAdmitCalls(config.gemini.maxLlmCalls)) {
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

    // Attachment token cost is independent of the byte and call budgets.
    if (imageAttachments.length > 0 && !canAffordAttachments()) {
      if (typingInterval) clearInterval(typingInterval)
      logger.debug({ channelId }, 'Per-minute token budget too low for an attachment turn — sending busy message')
      const tokenMsg = await message.reply(getRandomBusy())
      setTimeout(() => tokenMsg.delete().catch(() => {}), 5000)
      return
    }

    // Reserve the call ceiling and attachment bytes immediately before the cleanup scope.
    const callReservation = rateLimiter.reserveCalls(config.gemini.maxLlmCalls)
    if (!callReservation) {
      if (typingInterval) clearInterval(typingInterval)
      logger.debug({ channelId, remainingRpm: rateLimiter.remainingRpm }, 'Lost the race for call slots')
      const rpmMsg = await message.reply(getRandomBusy())
      setTimeout(() => rpmMsg.delete().catch(() => {}), 5000)
      return
    }

    // A thrown turn may have issued an unknown number of calls, so treat the full reservation as spent.
    let modelCallsUsed = config.gemini.maxLlmCalls

    const reservedBytes = reservationFor(imageAttachments)
    if (!tryReserve(reservedBytes)) {
      if (typingInterval) clearInterval(typingInterval)
      // Released here rather than left to the `finally` below, which this path returns above. Nothing was
      // sent to the model, so the turn owes neither the slots nor its daily unit.
      callReservation.release(0)
      logger.debug({ channelId, reservedBytes }, 'In-flight attachment budget full — sending busy message')
      const budgetMsg = await message.reply(getRandomBusy())
      setTimeout(() => budgetMsg.delete().catch(() => {}), 5000)
      return
    }

    try {
      // Inside the try, not before it, so the reservation above cannot be stranded by anything between the
      // two — markFree on a channel that was never marked is a no-op delete, so this costs nothing.
      markBusy(channelId)
      const [
        {
          text: responseText,
          tone,
          toolsUsed,
          metrics,
          droppedAttachments,
          truncatedAttachments,
          refusedAttachments,
          modelCalls
        },
        sources
      ] = await withSearchCitations(() =>
        generateResponse({
          channelId,
          guildId,
          userMessage: content || '(shared an image)',
          displayName,
          username,
          userId: message.author.id,
          mentionedUserIds: [...(message.mentions.users?.keys() ?? [])].filter((userId) => userId !== client.user?.id),
          imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
        })
      )

      // Now that the turn is done, hand back the slots it never used. Reserved at the ceiling, released
      // to the truth.
      modelCallsUsed = modelCalls

      logger.debug({ channelId, tone, responseLength: responseText.length }, 'ADK response received')

      // Keep unsupported, failed, truncated, and refused attachment notes distinct.
      const notes: string[] = []
      if (unsupportedCount > 0 || droppedAttachments > 0) notes.push(getRandomUnsupportedAttachment())
      if (truncatedAttachments > 0) notes.push(getRandomPartialAttachment())
      if (refusedAttachments > 0) notes.push(getRandomOversizedAttachment())
      const withNudge = notes.length > 0 ? `${responseText}\n\n${notes.join('\n\n')}` : responseText
      // Escaped before the split, not after: escaping lengthens the text, so doing it downstream would let a
      // chunk sized against the raw length overrun the TextDisplay budget it was measured for.
      const chunks = splitResponse(escapeBackticks(withNudge))
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
      callReservation.release(modelCallsUsed)
    }
  }
}
