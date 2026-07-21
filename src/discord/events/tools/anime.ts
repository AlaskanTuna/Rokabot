/** Anime search command handler with pagination */

import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js'
import { type SearchAnimeParams, searchAnime } from '../../../agent/tools/searchAnime.js'
import { CURIOUS_COLOR, FLAVOR, buildToolMessage, randomFrom } from './shared.js'

export async function handleAnime(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand()
  const flavor = randomFrom(FLAVOR.anime)

  let query: string | undefined
  let sortBy: SearchAnimeParams['sort_by']
  let type: SearchAnimeParams['type']
  let status: SearchAnimeParams['status']

  if (subcommand === 'search') {
    query = interaction.options.getString('query', true)
  } else {
    // browse
    sortBy = (interaction.options.getString('sort_by') ?? undefined) as SearchAnimeParams['sort_by']
    type = (interaction.options.getString('type') ?? undefined) as SearchAnimeParams['type']
    status = (interaction.options.getString('status') ?? undefined) as SearchAnimeParams['status']
  }

  const result = await searchAnime({ query, limit: 25, sort_by: sortBy, type, status })

  if (result.results.length === 0) {
    const label = query ? `"${query}"` : 'those filters'
    const text = `${flavor}\n\nHmm, I couldn't find anything for ${label}... Maybe try something different?`
    return buildToolMessage(text, CURIOUS_COLOR)
  }

  const pageSize = 5
  const totalPages = Math.ceil(result.results.length / pageSize)

  function buildAnimePage(page: number) {
    const start = page * pageSize
    const end = Math.min(start + pageSize, result.results.length)
    const pageEntries = result.results.slice(start, end)

    const lines = pageEntries.map((anime, i) => {
      const score = anime.score ? `\u2B50 ${anime.score}` : 'No score yet'
      const eps = anime.episodes ? `${anime.episodes} eps` : '? eps'
      let synopsis = anime.synopsis ?? 'No synopsis available.'
      if (synopsis.length > 200) synopsis = synopsis.slice(0, 197) + '...'
      return `${start + i + 1}. **${anime.title}**\n${score} \u2022 ${anime.status} \u2022 ${eps}\n${synopsis}\n[\u2197 MAL](${anime.url})`
    })

    const pageInfo = totalPages > 1 ? ` \u2022 Page ${page + 1}/${totalPages}` : ''
    const footer = `\nShowing ${start + 1}-${end} of ${result.total} results${pageInfo}`
    return `${flavor}\n\n${lines.join('\n\n')}\n${footer}`
  }

  if (totalPages <= 1) {
    return buildToolMessage(buildAnimePage(0), CURIOUS_COLOR)
  }

  // Multi-page — attach pagination buttons with a 60s collector
  let currentPage = 0
  const interactionId = interaction.id

  const buildPageContainer = (page: number, buttonsEnabled: boolean) => {
    const container = new ContainerBuilder()
      .setAccentColor(CURIOUS_COLOR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildAnimePage(page)))
    if (buttonsEnabled) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`anime_prev_${interactionId}`)
            .setLabel('\u25C0 Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId(`anime_next_${interactionId}`)
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

    if (btnInteraction.customId.startsWith('anime_next') && currentPage < totalPages - 1) currentPage++
    else if (btnInteraction.customId.startsWith('anime_prev') && currentPage > 0) currentPage--

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
