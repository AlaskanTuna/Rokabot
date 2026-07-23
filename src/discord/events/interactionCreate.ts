import type { Client, Interaction } from 'discord.js'
import { DiscordAPIError, MessageFlags } from 'discord.js'
import { type ImageAttachment, generateResponse } from '../../agent/roka.js'
import { type ResponseEventInput, recordResponseEvent } from '../../storage/metricsStore.js'
import { logger } from '../../utils/logger.js'
import { RateLimiter } from '../../utils/rateLimiter.js'
import { isChannelBusy, markBusy, markFree } from '../concurrency.js'
import { isIgnorableDiscordError } from '../errorHandler.js'
import { buildRokaMessage } from '../messageBuilder.js'
import { getRandomBusy, getRandomDecline, getRandomError, splitResponse } from '../responses.js'
import { createGameCommandHandler } from './gameCommands.js'
import { handleStatsCommand } from './stats/statsCommand.js'
import { createToolCommandHandler } from './toolCommands.js'

/** Create a handler for all slash command interactions */
export function createInteractionHandler(rateLimiter: RateLimiter, client?: Client) {
  const handleToolCommand = createToolCommandHandler(rateLimiter)
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

    if (interaction.commandName !== 'chat') {
      const handled = await handleGameCommand(interaction)
      if (handled) return
      await handleToolCommand(interaction)
      return
    }

    const message = interaction.options.getString('message', true)
    const attachment = interaction.options.getAttachment('image')
    const channelId = interaction.channelId
    const guildId = interaction.guildId ?? 'global'
    const member = interaction.member
    const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName

    const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
    const imageAttachments: ImageAttachment[] = []
    if (attachment?.contentType && ALLOWED_IMAGE_TYPES.has(attachment.contentType)) {
      imageAttachments.push({ url: attachment.url, contentType: attachment.contentType })
    }

    logger.debug({ channelId, command: 'chat' }, 'Slash command received')
    logger.debug({ channelId, message, hasImage: !!attachment }, 'Slash command details')

    if (isChannelBusy(channelId)) {
      logger.debug({ channelId }, 'Channel busy — sending busy message')
      const busyReply = await interaction.reply({ content: getRandomBusy(), fetchReply: true })
      setTimeout(() => busyReply.delete().catch(() => {}), 5000)
      return
    }

    if (!rateLimiter.tryConsume()) {
      logger.debug(
        { channelId, remainingRpm: rateLimiter.remainingRpm, remainingRpd: rateLimiter.remainingRpd },
        'Rate limit hit — declining'
      )

      const declineReply = await interaction.reply({ content: getRandomDecline(), fetchReply: true })
      setTimeout(() => declineReply.delete().catch(() => {}), 5000)
      return
    }

    await interaction.deferReply()

    markBusy(channelId)
    try {
      const {
        text: responseText,
        tone,
        toolsUsed,
        metrics
      } = await generateResponse({
        channelId,
        guildId,
        userMessage: message,
        displayName,
        username: interaction.user.username,
        userId: interaction.user.id,
        imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
      })

      logger.debug({ channelId, tone, responseLength: responseText.length }, 'ADK response received')

      const chunks = splitResponse(responseText)
      logger.debug({ channelId, chunkCount: chunks.length }, 'Response split into chunks')
      await interaction.editReply(buildRokaMessage(chunks[0], tone, toolsUsed))

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
      logger.error({ error: errDetail, channelId }, 'Error handling /chat command')
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
    }
  }
}
