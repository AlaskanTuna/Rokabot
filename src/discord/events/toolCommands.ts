/**
 * Tool command router — dispatches tool slash commands to their respective handler modules.
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import { logger } from '../../utils/logger.js'
import { RateLimiter } from '../../utils/rateLimiter.js'
import { getRandomDecline } from '../responses.js'
import { handleAnime } from './tools/anime.js'
import { handleFlipCoin, handleRollDice } from './tools/dice.js'
import { handleRemind } from './tools/reminder.js'
import { handleSchedule } from './tools/schedule.js'
import { handleSearch } from './tools/search.js'
import { ERROR_MESSAGES, PLAYFUL_COLOR, buildToolMessage, randomFrom } from './tools/shared.js'
import { handleTime } from './tools/time.js'
import { handleWeather } from './tools/weather.js'

const TOOL_COMMAND_NAMES = new Set([
  'roll_dice',
  'flip_coin',
  'time',
  'anime',
  'schedule',
  'weather',
  'search',
  'remind'
])

/** Create a dispatcher that routes tool slash commands to their respective handlers. */
export function createToolCommandHandler(rateLimiter: RateLimiter) {
  return async function handleToolCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const commandName = interaction.commandName

    if (!TOOL_COMMAND_NAMES.has(commandName)) return

    logger.info({ channelId: interaction.channelId, command: commandName }, 'Tool command received')

    if (!rateLimiter.tryConsume()) {
      logger.debug({ channelId: interaction.channelId }, 'Rate limit hit for tool command')
      await interaction.reply({ content: getRandomDecline() })
      return
    }

    try {
      switch (commandName) {
        case 'roll_dice': {
          const payload = handleRollDice(interaction)
          await interaction.reply(payload)
          break
        }
        case 'flip_coin': {
          const payload = handleFlipCoin()
          await interaction.reply(payload)
          break
        }
        case 'time': {
          const payload = handleTime(interaction)
          await interaction.reply(payload)
          break
        }
        case 'anime': {
          await interaction.deferReply()
          const payload = await handleAnime(interaction)
          if (payload) await interaction.editReply(payload)
          break
        }
        case 'schedule': {
          await interaction.deferReply()
          const payload = await handleSchedule(interaction)
          if (payload) await interaction.editReply(payload)
          break
        }
        case 'weather': {
          await interaction.deferReply()
          const payload = await handleWeather(interaction)
          await interaction.editReply(payload)
          break
        }
        case 'search': {
          await interaction.deferReply()
          const payload = await handleSearch(interaction)
          await interaction.editReply(payload)
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
