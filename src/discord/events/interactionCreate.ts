import type { Attachment, Client, Interaction } from 'discord.js'
import { DiscordAPIError, MessageFlags } from 'discord.js'
import type { ImageAttachment } from '../../agent/media/attachments.js'
import { MAX_ATTACHMENTS, isSupportedMedia, resolveMediaUrl } from '../../agent/media/mediaRules.js'
import { asksAboutReplies } from '../../agent/replyIntent.js'
import { SOCIAL_POST_FAILURE_MARKER, formatSocialPostLine } from '../../agent/social/format.js'
import { socialPostMedia } from '../../agent/social/media.js'
import { beginSocialPostLookup } from '../../agent/social/service.js'
import { parseSocialPostUrl } from '../../agent/social/urls.js'
import { startTurnEntryWork } from '../../agent/turnContext.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { type CallReservation, RateLimiter } from '../../utils/rateLimiter.js'
import { ASK_ATTACHMENT_SLOTS, attachmentOptionName } from '../commands/askOptions.js'
import { createGameCommandHandler } from '../commands/games/router.js'
import { handleReportCommand } from '../commands/reportHandler.js'
import { handleStatsCommand } from '../commands/stats/statsCommand.js'
import { createToolCommandHandler } from '../commands/tools/router.js'
import { isChannelBusy, markBusy } from '../concurrency.js'
import { isIgnorableDiscordError } from '../errorHandler.js'
import { getRandomBusy, getRandomDecline, getRandomError } from '../responses.js'
import {
  type VanishingReply,
  deliverTurn,
  recordTurnEvent,
  releaseTurn,
  replyToFailedTurn,
  reserveTurnBudget,
  runModelTurn
} from '../turnPipeline.js'

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

    if (interaction.commandName === 'report') {
      try {
        await handleReportCommand(interaction)
      } catch (error) {
        logger.error({ error, channelId: interaction.channelId }, 'Error handling /report command')
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'Something went wrong while filing your report. Please try again.' })
          } else {
            await interaction.reply({
              content: 'Something went wrong while filing your report. Please try again.',
              flags: MessageFlags.Ephemeral
            })
          }
        } catch (replyError) {
          logger.warn({ error: replyError, channelId: interaction.channelId }, 'Failed to send /report error reply')
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
    const linkedUrl = interaction.options.getString('attachment_url')
    const socialPostWork = config.socialPosts.enabled
      ? beginSocialPostLookup([message, linkedUrl ?? ''], Promise.resolve([]))
      : null
    const channelId = interaction.channelId
    // A label for metrics and session identity only. /ask runs memory-free, so this never becomes a
    // memory tenant — the client has no DirectMessages intent, so no message event ever yields one (#207).
    const guildId = interaction.guildId ?? `dm:${channelId}`
    const member = interaction.member
    const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName
    const turnEntryWork = startTurnEntryWork({
      channelId,
      guildId,
      userId: interaction.user.id,
      speakerName: displayName,
      message,
      includeEpisodeRecall: false
    })
    let turnEntryWorkHandedOff = false
    let turnEntryWorkCancelled = false
    const cancelTurnEntryWork = () => {
      if (!turnEntryWorkHandedOff && !turnEntryWorkCancelled) {
        turnEntryWork.cancel()
        turnEntryWorkCancelled = true
      }
    }

    // Truthiness rather than a null check: an unfilled option is absent, and callers spell that both ways.
    const attached = Array.from({ length: ASK_ATTACHMENT_SLOTS }, (_, index) =>
      interaction.options.getAttachment(attachmentOptionName(index))
    ).filter((candidate): candidate is Attachment => Boolean(candidate))

    // Documents ride the existing attachment slots rather than getting their own option: Discord's attachment
    // options accept any file already, so admitting the type is the whole change.
    let imageAttachments: ImageAttachment[] = attached
      .filter(isSupportedMedia)
      .map((supported) => ({ url: supported.url, contentType: supported.contentType as string, size: supported.size }))
    let unsupportedCount = attached.length - imageAttachments.length

    // One budget per turn regardless of where the file came from: a linked file competes for the same
    // MAX_ATTACHMENTS slots as an uploaded one, so the cost of a turn stays one number.
    if (linkedUrl && (!config.socialPosts.enabled || !parseSocialPostUrl(linkedUrl))) {
      const resolved = imageAttachments.length < MAX_ATTACHMENTS ? await resolveMediaUrl(linkedUrl) : null
      if (resolved) imageAttachments.push(resolved)
      else unsupportedCount += 1
    }

    logger.debug({ channelId, command: 'ask' }, 'Slash command received')
    logger.debug({ channelId, message, imageCount: imageAttachments.length, unsupportedCount }, 'Slash command details')

    const vanish = () => setTimeout(() => interaction.deleteReply().catch(() => {}), 5000)
    const sayBeforeDefer: VanishingReply = async (text) => {
      await interaction.reply({ content: text })
      vanish()
    }
    const sayAfterDefer: VanishingReply = async (text) => {
      await interaction.editReply({ content: text })
      vanish()
    }

    if (isChannelBusy(channelId)) {
      cancelTurnEntryWork()
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      await sayBeforeDefer(getRandomBusy())
      return
    }

    // Taken before the first await below rather than when generation starts: deferring the reply and the post
    // lookup take time, and a second /ask in that window would find the channel free and run beside this one.
    markBusy(channelId)
    let callReservation: CallReservation | undefined
    let reservedBytes = 0
    // Assume the whole reservation was spent unless the turn comes back and says otherwise: a turn that
    // throws has already made an unknown number of calls, and over-holding costs a minute where
    // under-holding costs the quota.
    let modelCallsUsed = config.gemini.maxLlmCalls
    try {
      // Advisory, and deliberately not the reservation. A turn may issue up to `maxLlmCalls` model calls, so
      // that is what has to be available — but holding it from here would keep the slots through `deferReply`
      // and the post lookup. Asked here to decline cheaply, taken below (#167).
      if (!rateLimiter.canAdmitCalls(config.gemini.maxLlmCalls)) {
        cancelTurnEntryWork()
        logger.debug(
          { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
          'Rate limit hit — declining'
        )

        await sayBeforeDefer(getRandomDecline())
        return
      }

      await interaction.deferReply()

      let userMessage = message
      const socialPostResult = socialPostWork ? await socialPostWork : { status: 'none' as const }
      if (socialPostResult.status === 'found') {
        userMessage = `${userMessage}\n${formatSocialPostLine(socialPostResult.post, config.socialPosts.maxTextChars)}`
        if (imageAttachments.length < MAX_ATTACHMENTS) {
          const imageAttachment = await socialPostMedia(socialPostResult.post)
          if (imageAttachment) imageAttachments.push(imageAttachment)
        }
      } else if (socialPostResult.status === 'failed') {
        userMessage = `${userMessage}\n${SOCIAL_POST_FAILURE_MARKER}`
      }

      const budget = reserveTurnBudget({
        channelId,
        attachments: imageAttachments,
        rateLimiter,
        onDeclined: cancelTurnEntryWork
      })
      if (!budget) {
        await sayAfterDefer(getRandomBusy())
        return
      }
      const { skippedAttachments } = budget
      imageAttachments = budget.attachments
      callReservation = budget.callReservation
      reservedBytes = budget.reservedBytes

      turnEntryWorkHandedOff = true
      const turn = await runModelTurn({
        channelId,
        guildId,
        userMessage,
        displayName,
        username: interaction.user.username,
        userId: interaction.user.id,
        memory: false,
        asksAboutReplies: asksAboutReplies(message),
        turnEntryWork,
        skippedAttachments,
        imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
      })

      // Now that the turn is done, hand back the slots it never used. Reserved at the ceiling, released
      // to the truth.
      modelCallsUsed = turn.modelCalls

      logger.debug({ channelId, tone: turn.tone, responseLength: turn.text.length }, 'ADK response received')

      await deliverTurn(
        { turn, socialPostResult, unsupported: unsupportedCount, skipped: skippedAttachments },
        channelId,
        {
          sendFirst: (payload) => interaction.editReply(payload),
          sendRest: (payload) => interaction.followUp(payload)
        }
      )

      recordTurnEvent({ guildId, channelId, userId: interaction.user.id, trigger: 'slash' }, turn, handlerStartMs)
    } catch (error) {
      await replyToFailedTurn(error, {
        channelId,
        label: 'Error handling /ask command',
        send: (text) => {
          if (interaction.deferred || interaction.replied) return interaction.editReply({ content: text })
          return interaction.reply({ content: text, flags: MessageFlags.Ephemeral })
        }
      })
    } finally {
      releaseTurn({ channelId, reservedBytes, callReservation, modelCallsUsed })
    }
  }
}
