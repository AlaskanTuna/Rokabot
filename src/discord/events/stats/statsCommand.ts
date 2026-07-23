import { ComponentType, DiscordAPIError, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, RepliableInteraction } from 'discord.js'
import { logger } from '../../../utils/logger.js'
import { isIgnorableDiscordError } from '../../errorHandler.js'
import { getRandomError } from '../../responses.js'
import { STATS_VIEWS, type StatsView, buildStatsView } from './views.js'

function isStatsView(value: string | undefined): value is StatsView {
  return value !== undefined && (STATS_VIEWS as readonly string[]).includes(value)
}

function selectionFor(customId: string, value: string | undefined): StatsView | null {
  return customId === 'stats:view' && isStatsView(value) ? value : null
}

function logStatsError(error: unknown, guildId: string | null, message: string) {
  if (isIgnorableDiscordError(error)) {
    logger.warn({ error, guildId, code: (error as DiscordAPIError).code }, 'Discord API error (ignored)')
    return
  }
  const errDetail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
  logger.error({ error: errDetail, guildId }, message)
}

async function sendStatsError(interaction: RepliableInteraction, guildId: string | null) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: getRandomError() })
    } else {
      await interaction.reply({ content: getRandomError(), flags: MessageFlags.Ephemeral })
    }
  } catch (replyError) {
    logStatsError(replyError, guildId, 'Failed to send /stats error reply')
  }
}

export async function handleStatsCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    try {
      await interaction.reply({
        content: 'Ara~ stats are for the shop floor, not letters, ne~',
        flags: MessageFlags.Ephemeral
      })
    } catch (error) {
      logStatsError(error, null, 'Error declining /stats in DMs')
    }
    return
  }

  let view: StatsView = 'overview'
  const guild = interaction.guild
  if (!guild) {
    await sendStatsError(interaction, interaction.guildId)
    return
  }
  try {
    await interaction.deferReply()
    const reply = await interaction.editReply(await buildStatsView(interaction.guildId, guild, view))
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000
    })

    collector.on('collect', async (selectInteraction) => {
      try {
        if (selectInteraction.user.id !== interaction.user.id) {
          await selectInteraction.reply({
            content: 'Ara~ these little ledger tabs are for the one who opened them, ne~',
            flags: MessageFlags.Ephemeral
          })
          return
        }

        const selection = selectionFor(selectInteraction.customId, selectInteraction.values[0])
        if (!selection) return
        view = selection
        await selectInteraction.update(await buildStatsView(interaction.guildId!, guild, selection))
      } catch (error) {
        logStatsError(error, interaction.guildId, 'Error updating /stats view')
        await sendStatsError(selectInteraction, interaction.guildId)
      }
    })

    collector.on('end', async () => {
      try {
        await interaction.editReply(await buildStatsView(interaction.guildId!, guild, view, true))
      } catch (error) {
        logStatsError(error, interaction.guildId, 'Error closing /stats view')
      }
    })
  } catch (error) {
    logStatsError(error, interaction.guildId, 'Error handling /stats command')
    await sendStatsError(interaction, interaction.guildId)
  }
}
