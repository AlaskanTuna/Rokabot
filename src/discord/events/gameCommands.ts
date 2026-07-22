/**
 * Game command router — dispatches gacha, hangman, and shiritori slash commands
 * to their respective handler modules.
 */

import type { ChatInputCommandInteraction, Client, TextBasedChannel } from 'discord.js'
import { setTimeoutCallback } from '../../games/hangman.js'
import {
  getGame as getShiritoriGame,
  setTimeoutCallback as setShiritoriTimeoutCallback
} from '../../games/shiritori.js'
import { logger } from '../../utils/logger.js'
import { handleBuddyCollection } from './games/collection.js'
import {
  handleBuddyGuide,
  handleBuddyLeaderboard,
  handleBuddyStats,
  handleBuddyView,
  handleHatch,
  handlePet
} from './games/gacha.js'
import { HANGMAN_COLORS, handleHangmanGuess, handleHangmanGuide, handleHangmanStart } from './games/hangman.js'
import { handleLeaderboard } from './games/leaderboard.js'
import { buildTimeoutContainer } from './games/shared.js'
import {
  SHIRITORI_COLORS,
  handleShiritoriEnd,
  handleShiritoriGuide,
  handleShiritoriJoin,
  handleShiritoriPlay,
  handleShiritoriScoresCmd,
  handleShiritoriStart
} from './games/shiritori.js'

const GAME_COMMAND_NAMES = new Set(['gacha', 'hangman', 'shiritori'])

/** Create a dispatcher that routes game slash commands to their respective handlers. */
export function createGameCommandHandler(client?: Client) {
  // Wire up the hangman timeout callback so we can notify the channel
  if (client) {
    setTimeoutCallback((channelId: string, word: string) => {
      const channel = client.channels.cache.get(channelId)
      if (channel && 'send' in channel) {
        const payload = buildTimeoutContainer(
          HANGMAN_COLORS.lose,
          'Hangman',
          `Time's up~ The word was **${word}**. You took too long! \u{1F4A4}`
        )
        ;(channel as Extract<TextBasedChannel, { send: unknown }>)
          .send(payload)
          .catch((err: unknown) => logger.error({ error: err, channelId }, 'Failed to send hangman timeout message'))
      }
    })
  }

  // Wire up the shiritori timeout callback
  if (client) {
    setShiritoriTimeoutCallback((channelId: string, playerName: string) => {
      const g = getShiritoriGame(channelId)
      const channel = client.channels.cache.get(channelId)
      if (g && channel && 'send' in channel) {
        const sendable = channel as Extract<typeof channel, { send: unknown }>
        const remaining = g.currentPlayerOrder
        if (!g.active && remaining.length === 1) {
          const winner = remaining[0]
          const payload = buildTimeoutContainer(
            SHIRITORI_COLORS.info,
            'Shiritori',
            `**${playerName}** took too long... they're out! \u{1F4A4}\n\n**${winner}** wins the game! Congratulations~ \u266A`
          )
          sendable
            .send(payload)
            .catch((err: unknown) =>
              logger.error({ error: err, channelId }, 'Failed to send shiritori timeout message')
            )
        } else {
          const nextPlayer = remaining[g.currentTurnIndex]
          const payload = buildTimeoutContainer(
            SHIRITORI_COLORS.info,
            'Shiritori',
            `**${playerName}** took too long... they're out! \u{1F4A4} Your turn, **${nextPlayer}**!`
          )
          sendable
            .send(payload)
            .catch((err: unknown) =>
              logger.error({ error: err, channelId }, 'Failed to send shiritori timeout message')
            )
        }
      }
    })
  }

  return async function handleGameCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const commandName = interaction.commandName

    if (!GAME_COMMAND_NAMES.has(commandName)) return false

    logger.info({ channelId: interaction.channelId, command: commandName }, 'Game command received')

    try {
      if (commandName === 'gacha') {
        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
          case 'hatch': {
            const payload = handleHatch(interaction)
            await interaction.reply(payload)
            break
          }
          case 'view': {
            const payload = handleBuddyView(interaction)
            await interaction.reply(payload)
            break
          }
          case 'pet': {
            const payload = handlePet(interaction)
            await interaction.reply(payload)
            break
          }
          case 'stats': {
            const payload = handleBuddyStats(interaction)
            await interaction.reply(payload)
            break
          }
          case 'collection': {
            await interaction.deferReply()
            const payload = await handleBuddyCollection(interaction)
            if (payload) await interaction.editReply(payload)
            break
          }
          case 'guide': {
            const payload = handleBuddyGuide()
            await interaction.reply(payload)
            break
          }
          case 'leaderboard': {
            const payload = handleBuddyLeaderboard(interaction)
            await interaction.reply(payload)
            break
          }
        }
      } else if (commandName === 'hangman') {
        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
          case 'start': {
            const payload = handleHangmanStart(interaction)
            await interaction.reply(payload)
            break
          }
          case 'guess': {
            const payload = handleHangmanGuess(interaction)
            await interaction.reply(payload)
            break
          }
          case 'guide': {
            const payload = handleHangmanGuide()
            await interaction.reply(payload)
            break
          }
          case 'leaderboard': {
            const payload = handleLeaderboard('hangman', interaction)
            await interaction.reply(payload)
            break
          }
        }
      } else if (commandName === 'shiritori') {
        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
          case 'start': {
            const payload = handleShiritoriStart(interaction)
            await interaction.reply(payload)
            break
          }
          case 'join': {
            const payload = handleShiritoriJoin(interaction)
            await interaction.reply(payload)
            break
          }
          case 'play': {
            const payload = handleShiritoriPlay(interaction)
            await interaction.reply(payload)
            break
          }
          case 'end': {
            const payload = handleShiritoriEnd(interaction)
            await interaction.reply(payload)
            break
          }
          case 'scores': {
            const payload = handleShiritoriScoresCmd(interaction)
            await interaction.reply(payload)
            break
          }
          case 'guide': {
            const payload = handleShiritoriGuide()
            await interaction.reply(payload)
            break
          }
          case 'leaderboard': {
            const payload = handleLeaderboard('shiritori', interaction)
            await interaction.reply(payload)
            break
          }
        }
      }

      return true
    } catch (error) {
      const errDetail =
        error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
      logger.error({ error: errDetail, channelId: interaction.channelId, command: commandName }, 'Game command error')

      const errorText = 'Nn... something went wrong. Maybe try again later?'

      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: errorText })
        } else if (!interaction.replied) {
          await interaction.reply({ content: errorText })
        }
      } catch (replyError) {
        logger.error({ error: replyError, channelId: interaction.channelId }, 'Failed to send game error reply')
      }

      return true
    }
  }
}
