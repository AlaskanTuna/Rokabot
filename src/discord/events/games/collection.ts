/** Paginated companion collection command handler. */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js'
import { type BuddyData, getBuddyCollection } from '../../../games/buddy.js'
import { RARITY_EMOJI } from '../../../games/data/buddySpecies.js'
import { buddySprite } from './shared.js'

export const COLLECTION_PAGE_SIZE = 5

export function getCollectionPageCount(total: number, pageSize: number = COLLECTION_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function buildCollectionPage(buddies: BuddyData[], page: number, pageSize: number = COLLECTION_PAGE_SIZE) {
  const pageCount = getCollectionPageCount(buddies.length, pageSize)
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1)
  const container = new ContainerBuilder().setAccentColor(0xb0c4de)

  if (buddies.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### Companion Collection\n\nYou do not have any companion spirits yet~ Use `/gacha hatch` to get one!'
      )
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Companion Collection\n-# Page ${currentPage + 1}/${pageCount}`)
    )

    for (const buddy of buddies.slice(currentPage * pageSize, (currentPage + 1) * pageSize)) {
      const rarity = `${RARITY_EMOJI[buddy.rarity]} ${buddy.rarity.toUpperCase()}`
      const hatchedDate = new Date(buddy.hatchedAt).toLocaleDateString('en-GB')
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${buddy.name ?? 'Unknown'}** — ${rarity}\nHatched on ${hatchedDate}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: buddySprite(buddy.species) } }))
      container.addSectionComponents(section)
    }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}

function buildPaginatedCollectionPage(
  buddies: BuddyData[],
  page: number,
  interactionId: string,
  buttonsEnabled: boolean
) {
  const payload = buildCollectionPage(buddies, page)
  const pageCount = getCollectionPageCount(buddies.length)

  if (buttonsEnabled) {
    payload.components[0].addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`collection_prev_${interactionId}`)
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`collection_next_${interactionId}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= pageCount - 1)
      )
    )
  }

  return payload
}

export async function handleBuddyCollection(interaction: ChatInputCommandInteraction) {
  const buddies = getBuddyCollection(interaction.user.id)
  const pageCount = getCollectionPageCount(buddies.length)

  if (pageCount <= 1) return buildCollectionPage(buddies, 0)

  let currentPage = 0
  const reply = await interaction.editReply(buildPaginatedCollectionPage(buddies, currentPage, interaction.id, true))
  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 })

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({ content: "Those buttons aren't for you~", flags: MessageFlags.Ephemeral })
      return
    }

    if (buttonInteraction.customId.startsWith('collection_next') && currentPage < pageCount - 1) {
      currentPage++
    } else if (buttonInteraction.customId.startsWith('collection_prev') && currentPage > 0) {
      currentPage--
    }

    await buttonInteraction.update(buildPaginatedCollectionPage(buddies, currentPage, interaction.id, true))
  })

  collector.on('end', async () => {
    await interaction
      .editReply(buildPaginatedCollectionPage(buddies, currentPage, interaction.id, false))
      .catch(() => {})
  })

  return undefined
}
