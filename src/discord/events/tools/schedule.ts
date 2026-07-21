/** Anime schedule command handler with pagination */

import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js'
import { getAnimeSchedule } from '../../../agent/tools/getAnimeSchedule.js'
import { CURIOUS_COLOR, FLAVOR, buildToolMessage, randomFrom } from './shared.js'

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function formatTimezoneList(tz: Record<string, string>): string {
  return Object.entries(tz)
    .map(([zone, time]) => `${time} ${zone}`)
    .join(' | ')
}

function formatTimezoneShort(tz: Record<string, string>): string {
  const preferred = ['EST', 'GMT']
  const parts: string[] = []
  for (const key of preferred) {
    if (tz[key]) parts.push(`${tz[key]} ${key}`)
  }
  if (parts.length === 0) {
    const entries = Object.entries(tz).slice(0, 2)
    return entries.map(([zone, time]) => `${time} ${zone}`).join(' | ')
  }
  return parts.join(' | ')
}

export async function handleSchedule(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand()
  const flavor = randomFrom(FLAVOR.schedule)

  let anime: string | undefined
  let scope: 'day' | 'week' | 'season' = 'day'
  let sortBy: 'score' | 'popularity' | 'members' | 'title' | undefined

  if (subcommand === 'search') {
    anime = interaction.options.getString('anime', true)
  } else {
    // browse
    scope = (interaction.options.getString('scope') ?? 'day') as 'day' | 'week' | 'season'
    sortBy = (interaction.options.getString('sort_by') ?? undefined) as typeof sortBy
  }

  const result = await getAnimeSchedule({ scope, sort_by: sortBy, limit: 25, anime })

  if (result.entries.length === 0) {
    const text = `${flavor}\n\nHmm, nothing found for that~ Maybe try something else?`
    return buildToolMessage(text, CURIOUS_COLOR)
  }

  // Specific anime lookup
  if (anime) {
    const entry = result.entries[0]
    const eps = entry.episodes ? `${entry.episodes} eps` : '? eps'
    const score = entry.score ? `\u2B50 ${entry.score}` : 'No score yet'
    const broadcastLine =
      entry.broadcastDay && entry.broadcastTime
        ? `\uD83D\uDCC5 ${capitalize(entry.broadcastDay)} at ${entry.broadcastTime} JST`
        : '\uD83D\uDCC5 Broadcast TBA'
    const tzLine = entry.broadcastTimezones ? `\uD83D\uDD50 ${formatTimezoneList(entry.broadcastTimezones)}` : ''
    const seasonLine = entry.season && entry.year ? `\uD83C\uDF38 ${capitalize(entry.season)} ${entry.year}` : ''

    const lines = [
      `${flavor}`,
      '',
      `\uD83D\uDD0D **${entry.title}**`,
      `\uD83D\uDCFA ${entry.type} \u2022 ${eps} \u2022 ${score} \u2022 ${entry.status}`,
      broadcastLine,
      ...(tzLine ? [tzLine] : []),
      ...(seasonLine ? [seasonLine] : []),
      `[\u2197 MAL](${entry.url})`
    ]

    return buildToolMessage(lines.join('\n'), CURIOUS_COLOR)
  }

  const sortLabel = sortBy ? `sorted by ${sortBy}` : 'sorted by score'
  const header = `\uD83D\uDCC5 **${result.label}** (${sortLabel})`
  const pageSize = 5
  const totalPages = Math.ceil(result.entries.length / pageSize)
  const interactionId = interaction.id

  function buildPage(page: number) {
    const start = page * pageSize
    const end = Math.min(start + pageSize, result.entries.length)
    const pageEntries = result.entries.slice(start, end)

    const lines = pageEntries.map((entry, i) => {
      const score = entry.score ? `\u2B50 ${entry.score}` : ''
      const broadcastPart =
        entry.broadcastDay && entry.broadcastTime
          ? `${capitalize(entry.broadcastDay)} at ${entry.broadcastTime} JST`
          : 'Broadcast TBA'
      const tzShort = entry.broadcastTimezones ? ` (${formatTimezoneShort(entry.broadcastTimezones)})` : ''
      return `${start + i + 1}. **${entry.title}** ${score}\n   ${broadcastPart}${tzShort}`
    })

    const pageInfo = totalPages > 1 ? ` \u2022 Page ${page + 1}/${totalPages}` : ''
    const footer = `\nShowing ${start + 1}-${end} of ${result.total} results${pageInfo}`
    return `${flavor}\n\n${header}\n\n${lines.join('\n')}\n${footer}`
  }

  if (totalPages <= 1) {
    return buildToolMessage(buildPage(0), CURIOUS_COLOR)
  }

  let currentPage = 0

  const buildPageContainer = (page: number, buttonsEnabled: boolean) => {
    const container = new ContainerBuilder()
      .setAccentColor(CURIOUS_COLOR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildPage(page)))
    if (buttonsEnabled) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`sched_prev_${interactionId}`)
            .setLabel('\u25C0 Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId(`sched_next_${interactionId}`)
            .setLabel('Next \u25B6')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1)
        )
      )
    }
    return container
  }

  const reply = await interaction.editReply({
    components: [buildPageContainer(currentPage, true)],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  })

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000
  })

  collector.on('collect', async (btnInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      await btnInteraction.reply({ content: "Those buttons aren't for you~", flags: MessageFlags.Ephemeral })
      return
    }

    if (btnInteraction.customId.startsWith('sched_next') && currentPage < totalPages - 1) {
      currentPage++
    } else if (btnInteraction.customId.startsWith('sched_prev') && currentPage > 0) {
      currentPage--
    }

    await btnInteraction.update({
      components: [buildPageContainer(currentPage, true)],
      flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
    })
  })

  collector.on('end', async () => {
    await interaction
      .editReply({
        components: [buildPageContainer(currentPage, false)],
        flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
      })
      .catch(() => {})
  })

  return undefined as unknown as ReturnType<typeof buildToolMessage>
}
