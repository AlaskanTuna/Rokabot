/**
 * Handle buddy pet view triggered via @mention keywords.
 * Shows the user's companion spirit or tells them to hatch one.
 */

import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import type { Message } from 'discord.js'
import { MessageFlags } from 'discord.js'
import { getBuddy, getBuddyCount, getSpeciesInfo } from '../../games/buddy.js'
import { RARITY_COLORS, RARITY_EMOJI, STAT_NAMES } from '../../games/data/buddySpecies.js'
import { logger } from '../../utils/logger.js'
import { buddySprite } from './games/shared.js'

function statBar(value: number, max: number = 10): string {
  const filled = '\u2588'.repeat(value)
  const empty = '\u2591'.repeat(max - value)
  return `${filled}${empty}`
}

/** Handle a gacha/buddy mention. Returns true if handled. */
export async function handleGachaMention(message: Message): Promise<boolean> {
  const userId = message.author.id

  try {
    const buddy = getBuddy(userId)

    if (!buddy) {
      await message.reply({
        content: "You don't have a companion spirit yet~ Use `/gacha hatch` to get one!"
      })
      return true
    }

    const info = getSpeciesInfo(buddy.species)
    const rarityEmoji = RARITY_EMOJI[buddy.rarity]
    const sprite = buddySprite(buddy.species)
    const shinyTag = buddy.shiny ? ' \u2728 **SHINY**' : ''
    const hatDisplay = buddy.hat !== 'none' ? ` | Hat: ${buddy.hat}` : ''

    const lines = [
      `${info?.emoji ?? ''} **${buddy.name ?? 'Unknown'}** ${rarityEmoji} ${buddy.rarity.toUpperCase()}${shinyTag}`,
      `*${info?.name ?? buddy.species}*${hatDisplay} | Eyes: ${buddy.eyes}`,
      ''
    ]

    if (buddy.personality) {
      lines.push(`> ${buddy.personality}`, '')
    }

    for (const { key, display } of STAT_NAMES) {
      const val = buddy.stats[key] ?? 0
      lines.push(`${display}  ${statBar(val)}  **${val}**/10`)
    }

    const body = lines.join('\n')

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${buddy.name}\n\n${body}`))
      .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: sprite.url } }))

    const container = new ContainerBuilder()
      .setAccentColor(RARITY_COLORS[buddy.rarity])
      .addSectionComponents(section)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Companion 1 of ${getBuddyCount(userId)} | Hatched on ${new Date(buddy.hatchedAt).toLocaleDateString('en-GB')}`
        )
      )

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2,
      files: [sprite.file]
    })
    return true
  } catch (error) {
    const errDetail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
    logger.error({ error: errDetail, channelId: message.channelId }, 'Error handling buddy mention')
    return false
  }
}
