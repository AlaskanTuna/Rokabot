import type { Client, Message } from 'discord.js'
import { DiscordAPIError } from 'discord.js'
import { isMonitored, markActive } from '../../agent/channelMonitor.js'
import { judgeExtraction } from '../../agent/jev/judgments.js'
import { shouldExtract } from '../../agent/memory/candidateGate.js'
import { getActiveClaims } from '../../agent/memory/memoryClaims.js'
import { enqueueAndSchedule } from '../../agent/memory/scheduler.js'
import { maybeExtractFromBuffer } from '../../agent/memoryExtractor.js'
import { addMessage as addToPassiveBuffer, getMessages } from '../../agent/passiveBuffer.js'
import { generateResponse } from '../../agent/roka.js'
import { withSearchCitations } from '../../agent/searchCitations.js'
import { canAffordAttachments } from '../../agent/tokenBudget.js'
import { startTurnEntryWork } from '../../agent/turnContext.js'
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
import {
  extractComponentTexts,
  extractCurrentMessageContent,
  extractMessageContent,
  replaceUserMentions
} from '../messageContent.js'
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

function dispatchClaimExtraction(channelId: string, guildId: string, botUserId: string, askJev = false): void {
  try {
    const messages = [...getMessages(channelId)]
    const userIds = new Set(messages.map((message) => message.userId).filter((userId) => userId !== botUserId))
    const knownClaimKeys = new Set(
      [...userIds].flatMap((userId) => getActiveClaims(guildId, userId).map((claim) => claim.predicate))
    )
    const gate = shouldExtract(messages, knownClaimKeys)

    if (gate.extract) {
      enqueueAndSchedule({
        guildId,
        channelId,
        botUserId,
        messages: messages.map(({ userId, displayName, content }) => ({ userId, displayName, content }))
      })
      return
    }

    if (
      !askJev ||
      config.jev.extraction === 'off' ||
      (gate.reason !== 'known claim keywords only' && gate.reason !== 'no personal signal')
    ) {
      return
    }

    const lines = messages.slice(-6).map(({ displayName, content }) => `[${displayName}]: ${content}`)
    void (async () => {
      const result = await judgeExtraction({ lines })
      if (!result) return

      const admitted = config.jev.extraction === 'on' && result.noul >= config.jev.extractionAdmitThreshold
      logger.info(
        {
          channelId,
          guildId,
          gateReason: gate.reason,
          noul: result.noul,
          admitted,
          latencyMs: Math.round(result.latencyMs),
          inputTokens: result.inputTokens
        },
        'Jev extraction admission'
      )
      if (admitted) {
        enqueueAndSchedule({
          guildId,
          channelId,
          botUserId,
          messages: messages.map(({ userId, displayName, content }) => ({ userId, displayName, content })),
          admittedBy: 'jev'
        })
      }
    })().catch((error: unknown) => {
      logger.warn({ channelId, guildId, error }, 'Jev extraction admission failed')
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
    let turnEntryWork: ReturnType<typeof startTurnEntryWork> | undefined
    if (isMentioned || isNameMention || isReplyCandidate) {
      const currentMessage = extractCurrentMessageContent(message, client.user.id, componentTextsForTrigger)
      turnEntryWork = startTurnEntryWork({
        channelId: message.channelId,
        guildId: message.guildId ?? `dm:${message.channelId}`,
        userId: message.author.id,
        speakerName: message.member?.displayName ?? message.author.displayName,
        message: currentMessage,
        mentionedUserIds: [...(message.mentions.users?.keys() ?? [])].filter((userId) => userId !== client.user?.id)
      })
    }
    let turnEntryWorkHandedOff = false
    const cancelTurnEntryWork = () => {
      if (turnEntryWork && !turnEntryWorkHandedOff) {
        turnEntryWork.cancel()
        turnEntryWork = undefined
      }
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

    if (message.guild && !message.author.bot && isMonitored(message.channelId)) {
      const msgContent = replaceUserMentions(message, client.user?.id)
      if (msgContent) {
        const memberDisplayName = message.member?.displayName ?? message.author.displayName
        addToPassiveBuffer(message.channelId, message.author.id, memberDisplayName, message.author.username, msgContent)
        upsertUserName(message.author.id, message.author.username, memberDisplayName)
        if (config.memory.claimsBackend) {
          // Inside a `message.guild` guard, so guildId is set: a DM turn has no memory tenant to name.
          dispatchClaimExtraction(message.channelId, message.guildId!, client.user.id, true)
        } else {
          maybeExtractFromBuffer(message.channelId, message.guildId!, client.user?.id)
        }
      }
    }

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
      if (handled) {
        cancelTurnEntryWork()
        return
      }
    }

    if (!content && imageAttachments.length === 0) {
      content = '(pinged you without saying anything)'
    }

    logger.debug({ channelId, trigger }, 'Message trigger detected')
    logger.debug({ channelId, content, imageCount: imageAttachments.length }, 'Message content extracted')

    if (isChannelBusy(channelId)) {
      cancelTurnEntryWork()
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      const busyMsg = await message.reply(getRandomBusy())
      setTimeout(() => busyMsg.delete().catch(() => {}), 5000)
      return
    }

    // Check the full call ceiling before reserving so early exits do not hold slots.
    if (!rateLimiter.canAdmitCalls(config.gemini.maxLlmCalls)) {
      cancelTurnEntryWork()
      logger.debug(
        { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
        'Rate limit hit — declining'
      )

      const declineMsg = await message.reply(getRandomDecline())
      setTimeout(() => declineMsg.delete().catch(() => {}), 5000)
      return
    }

    if ('sendTyping' in message.channel) {
      void message.channel.sendTyping().catch(() => {})
    }
    const typingInterval =
      'sendTyping' in message.channel
        ? setInterval(() => {
            ;(message.channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {})
          }, 7000)
        : null

    // Attachment token cost is independent of the byte and call budgets.
    if (imageAttachments.length > 0 && !canAffordAttachments()) {
      cancelTurnEntryWork()
      if (typingInterval) clearInterval(typingInterval)
      logger.debug({ channelId }, 'Per-minute token budget too low for an attachment turn — sending busy message')
      const tokenMsg = await message.reply(getRandomBusy())
      setTimeout(() => tokenMsg.delete().catch(() => {}), 5000)
      return
    }

    // Reserve the call ceiling and attachment bytes immediately before the cleanup scope.
    const callReservation = rateLimiter.reserveCalls(config.gemini.maxLlmCalls)
    if (!callReservation) {
      cancelTurnEntryWork()
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
      cancelTurnEntryWork()
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
      turnEntryWorkHandedOff = true
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
          memory: true,
          mentionedUserIds: [...(message.mentions.users?.keys() ?? [])].filter((userId) => userId !== client.user?.id),
          turnEntryWork,
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

      // Add bot response to passive buffer for richer extraction context
      if (message.guild && client.user && isMonitored(channelId)) {
        const botName = message.guild.members.me?.displayName ?? client.user.displayName
        addToPassiveBuffer(channelId, client.user.id, botName, client.user.username, responseText)
        if (config.memory.claimsBackend) {
          dispatchClaimExtraction(channelId, message.guildId!, client.user.id)
        } else {
          maybeExtractFromBuffer(channelId, message.guildId!, client.user.id)
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
      callReservation.release(modelCallsUsed)
    }
  }
}
