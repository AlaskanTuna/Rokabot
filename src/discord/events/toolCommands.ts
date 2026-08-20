/**
 * Tool command router — dispatches tool slash commands to their respective handler modules.
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import { logger } from '../../utils/logger.js'
import { handleAnime } from './tools/anime.js'
import { handleRemind } from './tools/reminder.js'
import { handleSchedule } from './tools/schedule.js'
import { ERROR_MESSAGES, PLAYFUL_COLOR, buildToolMessage, randomFrom } from './tools/shared.js'

const TOOL_COMMAND_NAMES = new Set(['anime', 'remind'])

/** Create a dispatcher that routes tool slash commands to their respective handlers. */
/** These commands reach Jikan and SQLite, never Gemini, so they take no slot from the model limiter.
 *
 * They used to. `RateLimiter` counts whatever calls `tryConsume`, and this router borrowed the Gemini one as
 * a generic anti-spam guard — which left our own counter believing requests had gone to Google that never
 * had, so the guard refused real turns earlier than Google would have. That mattered more after #167 made a
 * turn reserve `maxLlmCalls` slots: the usable ceiling is `rpm - maxLlmCalls + 1`, and every `/anime` took
 * one of those from a turn that needed it. Nothing is left unguarded by the removal — `jikanThrottle` bounds
 * the Jikan calls at 350 ms apart on its own, and `/remind` writes one local row (#172). */
export function createToolCommandHandler() {
  return async function handleToolCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName

    if (!TOOL_COMMAND_NAMES.has(commandName)) return

    logger.info({ channelId: interaction.channelId, command: commandName }, 'Tool command received')

    try {
      switch (commandName) {
        case 'anime': {
          await interaction.deferReply()
          const payload =
            interaction.options.getSubcommandGroup(false) === 'schedule'
              ? await handleSchedule(interaction)
              : await handleAnime(interaction)
          if (payload) await interaction.editReply(payload)
          break
        }
        case 'remind': {
          const payload = handleRemind(interaction)
          await interaction.reply(payload)
          break
        }
      }
    } catch (error) {
      const errDetail =
        error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
      logger.error({ error: errDetail, channelId: interaction.channelId, command: commandName }, 'Tool command error')

      const errorText = randomFrom(ERROR_MESSAGES)
      const errorPayload = buildToolMessage(errorText, PLAYFUL_COLOR)

      try {
        if (interaction.deferred) {
          await interaction.editReply(errorPayload)
        } else {
          await interaction.reply(errorPayload)
        }
      } catch (replyError) {
        logger.error({ error: replyError, channelId: interaction.channelId }, 'Failed to send tool error reply')
      }
    }
  }
}
