import { ComponentType, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { STATS_VIEWS, STATS_WINDOWS, type StatsView, type StatsWindow, buildStatsView } from './views.js'

function isStatsView(value: string | undefined): value is StatsView {
  return value !== undefined && (STATS_VIEWS as readonly string[]).includes(value)
}

function isStatsWindow(value: string | undefined): value is StatsWindow {
  return value !== undefined && (STATS_WINDOWS as readonly string[]).includes(value)
}

function selectionFor(customId: string, value: string | undefined): { view: StatsView; window: StatsWindow } | null {
  const [kind, dimension] = customId.split(':').slice(1)
  if (kind === 'view' && isStatsWindow(dimension) && isStatsView(value)) return { view: value, window: dimension }
  if (kind === 'window' && isStatsView(dimension) && isStatsWindow(value)) return { view: dimension, window: value }
  return null
}

export async function handleStatsCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return

  let view: StatsView = 'overview'
  let window: StatsWindow = '7d'
  await interaction.deferReply()
  const reply = await interaction.editReply(await buildStatsView(interaction.guildId, view, window))
  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120_000 })

  collector.on('collect', async (selectInteraction) => {
    if (selectInteraction.user.id !== interaction.user.id) {
      await selectInteraction.reply({
        content: 'Ara~ these little ledger tabs are for the one who opened them, ne~',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    const selection = selectionFor(selectInteraction.customId, selectInteraction.values[0])
    if (!selection) return
    view = selection.view
    window = selection.window
    await selectInteraction.update(await buildStatsView(interaction.guildId!, selection.view, selection.window))
  })

  collector.on('end', async () => {
    await interaction.editReply(await buildStatsView(interaction.guildId!, view, window, true)).catch(() => {})
  })
}
