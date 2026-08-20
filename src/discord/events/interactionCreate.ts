import type { Attachment, Client, Interaction } from 'discord.js'
import { DiscordAPIError, MessageFlags } from 'discord.js'
import { type ImageAttachment, generateResponse } from '../../agent/roka.js'
import { withSearchCitations } from '../../agent/searchCitations.js'
import { canAffordAttachments } from '../../agent/tokenBudget.js'
import { config } from '../../config.js'
import { type ResponseEventInput, recordResponseEvent } from '../../storage/metricsStore.js'
import { logger } from '../../utils/logger.js'
import { RateLimiter } from '../../utils/rateLimiter.js'
import { MAX_ATTACHMENTS, attachmentOptionName, isSupportedMedia, resolveMediaUrl } from '../attachments.js'
import { release, reservationFor, tryReserve } from '../byteBudget.js'
import { isChannelBusy, markBusy, markFree } from '../concurrency.js'
import { isIgnorableDiscordError } from '../errorHandler.js'
import { buildRokaMessage } from '../messageBuilder.js'
import {
  getRandomBusy,
  getRandomDecline,
  getRandomError,
  getRandomOversizedAttachment,
  getRandomPartialAttachment,
  getRandomUnsupportedAttachment,
  splitResponse
} from '../responses.js'
import { createGameCommandHandler } from './gameCommands.js'
import { handleStatsCommand } from './stats/statsCommand.js'
import { createToolCommandHandler } from './toolCommands.js'

/** Create a handler for all slash command interactions */
export function createInteractionHandler(rateLimiter: RateLimiter, client?: Client) {
  const handleToolCommand = createToolCommandHandler()
  const handleGameCommand = createGameCommandHandler(client)

  return async function handleInteractionCreate(interaction: Interaction): Promise<void> {
    const handlerStartMs = performance.now()
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'stats') {
      try {
        await handleStatsCommand(interaction)
      } catch (error) {
        if (isIgnorableDiscordError(error)) {
          logger.warn(
            { error, channelId: interaction.channelId, code: (error as DiscordAPIError).code },
            'Discord API error (ignored)'
          )
          return
        }
        const errDetail =
          error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
        logger.error({ error: errDetail, channelId: interaction.channelId }, 'Error handling /stats command')
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: getRandomError() })
          } else {
            await interaction.reply({ content: getRandomError(), flags: MessageFlags.Ephemeral })
          }
        } catch (replyError) {
          if (isIgnorableDiscordError(replyError)) {
            logger.warn(
              { error: replyError, channelId: interaction.channelId },
              'Could not send stats error reply (ignored)'
            )
          } else {
            logger.error({ error: replyError, channelId: interaction.channelId }, 'Failed to send stats error reply')
          }
        }
      }
      return
    }

    if (interaction.commandName !== 'ask') {
      const handled = await handleGameCommand(interaction)
      if (handled) return
      await handleToolCommand(interaction)
      return
    }

    const message = interaction.options.getString('question', true)
    // Truthiness rather than a null check: an unfilled option is absent, and callers spell that both ways.
    const attached = Array.from({ length: MAX_ATTACHMENTS }, (_, index) =>
      interaction.options.getAttachment(attachmentOptionName(index))
    ).filter((candidate): candidate is Attachment => Boolean(candidate))
    const channelId = interaction.channelId
    const guildId = interaction.guildId ?? `dm:${channelId}`
    const member = interaction.member
    const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName

    // Documents ride the existing attachment slots rather than getting their own option: Discord's attachment
    // options accept any file already, so admitting the type is the whole change.
    const imageAttachments: ImageAttachment[] = attached
      .filter(isSupportedMedia)
      .map((supported) => ({ url: supported.url, contentType: supported.contentType as string, size: supported.size }))
    let unsupportedCount = attached.length - imageAttachments.length

    // One budget per turn regardless of where the file came from: a linked file competes for the same
    // MAX_ATTACHMENTS slots as an uploaded one, so the cost of a turn stays one number.
    const linkedUrl = interaction.options.getString('attachment_url')
    if (linkedUrl) {
      const resolved = imageAttachments.length < MAX_ATTACHMENTS ? await resolveMediaUrl(linkedUrl) : null
      if (resolved) imageAttachments.push(resolved)
      else unsupportedCount += 1
    }

    logger.debug({ channelId, command: 'ask' }, 'Slash command received')
    logger.debug({ channelId, message, imageCount: imageAttachments.length, unsupportedCount }, 'Slash command details')

    if (isChannelBusy(channelId)) {
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      await interaction.reply({ content: getRandomBusy() })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
      return
    }

    // Advisory, and deliberately not the reservation. A turn may issue up to `maxLlmCalls` model calls, so
    // that is what has to be available — but holding it from here would strand the slots on every early
    // return and on a `deferReply` that throws. Asked here to decline cheaply, taken below where a `finally`
    // can hand it back (#167).
    if (!rateLimiter.canAdmitCalls(config.gemini.maxLlmCalls)) {
      logger.debug(
        { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
        'Rate limit hit — declining'
      )

      await interaction.reply({ content: getRandomDecline() })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
      return
    }

    await interaction.deferReply()

    // Bytes are not the only thing an attachment spends, and the two do not track each other: an 89-page PDF
    // is 35 KB of the byte budget and 49,841 tokens of the minute's. `rateLimit.rpm` bounds how many turns
    // happen, which bounded spend adequately while every turn cost about the same; it does not bound this.
    // Asked before the reservation below so a declined turn has taken nothing it must hand back.
    if (imageAttachments.length > 0 && !canAffordAttachments()) {
      logger.debug({ channelId }, 'Per-minute token budget too low for an attachment turn — sending busy message')
      await interaction.editReply({ content: getRandomBusy() })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
      return
    }

    // Reserved here rather than earlier so nothing can throw between taking the bytes and the try/finally
    // that hands them back — a reservation that leaks becomes a permanent refusal, not a failed turn.
    // Taken here for the same reason the bytes are, and handed back in the same `finally`. Reserving the
    // ceiling rather than one slot is the point: the minute is spent in REQUESTS and a turn issues up to
    // `maxLlmCalls` of them, so admitting on one slot let 15 turns become up to 60 requests (#167).
    const callReservation = rateLimiter.reserveCalls(config.gemini.maxLlmCalls)
    if (!callReservation) {
      logger.debug({ channelId, remainingRpm: rateLimiter.remainingRpm }, 'Lost the race for call slots')
      await interaction.editReply({ content: getRandomBusy() })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
      return
    }

    // Assume the whole reservation was spent unless the turn comes back and says otherwise: a turn that
    // throws has already made an unknown number of calls, and over-holding costs a minute where
    // under-holding costs the quota.
    let modelCallsUsed = config.gemini.maxLlmCalls

    const reservedBytes = reservationFor(imageAttachments)
    if (!tryReserve(reservedBytes)) {
      logger.debug({ channelId, reservedBytes }, 'In-flight attachment budget full — sending busy message')
      await interaction.editReply({ content: getRandomBusy() })
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
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
          userMessage: message,
          displayName,
          username: interaction.user.username,
          userId: interaction.user.id,
          imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
        })
      )

      // Now that the turn is done, hand back the slots it never used. Reserved at the ceiling, released
      // to the truth.
      modelCallsUsed = modelCalls

      logger.debug({ channelId, tone, responseLength: responseText.length }, 'ADK response received')

      // She answers the question either way; the nudge only tells them the file was not something she can open.
      // droppedAttachments covers the other way that fails: a type she takes, but bytes she could not — an
      // oversized clip is admitted here and refused at the download, and silence there reads as her ignoring it.
      // Two different things to say, and they are not alternatives: a turn can carry one file she could not
      // open and another she could only take the opening of.
      const notes: string[] = []
      if (unsupportedCount > 0 || droppedAttachments > 0) notes.push(getRandomUnsupportedAttachment())
      if (truncatedAttachments > 0) notes.push(getRandomPartialAttachment())
      if (refusedAttachments > 0) notes.push(getRandomOversizedAttachment())
      const withNudge = notes.length > 0 ? `${responseText}\n\n${notes.join('\n\n')}` : responseText
      const chunks = splitResponse(withNudge)
      logger.debug({ channelId, chunkCount: chunks.length }, 'Response split into chunks')
      await interaction.editReply(buildRokaMessage(chunks[0], tone, toolsUsed, sources))

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(buildRokaMessage(chunks[i], tone))
      }

      const responseEvent: ResponseEventInput = {
        guildId,
        channelId,
        userId: interaction.user.id,
        trigger: 'slash',
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
      logger.error({ error: errDetail, channelId }, 'Error handling /ask command')
      try {
        await interaction.editReply({ content: getRandomError() })
      } catch (replyError) {
        if (isIgnorableDiscordError(replyError)) {
          logger.warn({ error: replyError, channelId }, 'Could not send error reply (ignored)')
        } else {
          logger.error({ error: replyError, channelId }, 'Failed to send error reply')
        }
      }
    } finally {
      markFree(channelId)
      release(reservedBytes)
      callReservation.release(modelCallsUsed)
    }
  }
}
