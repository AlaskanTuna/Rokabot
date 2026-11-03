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
import { config } from '../../config.js'
import { getBuddy, getBuddyCount } from '../../games/buddy.js'
import { RARITY_COLORS } from '../../games/data/buddySpecies.js'
import { logger } from '../../utils/logger.js'
import { buddySprite, formatBuddySummary } from '../commands/games/shared.js'

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

    const sprite = buddySprite(buddy.species)
    const body = formatBuddySummary(buddy)
    const hatchedDate = new Date(buddy.hatchedAt).toLocaleDateString('en-GB', { timeZone: config.timezone })

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${buddy.name}\n\n${body}`))
      .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: sprite } }))

    const container = new ContainerBuilder()
      .setAccentColor(RARITY_COLORS[buddy.rarity])
      .addSectionComponents(section)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Companion 1 of ${getBuddyCount(userId)} | Hatched on ${hatchedDate}`)
      )

    await message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
    })
    return true
  } catch (error) {
    const errDetail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
    logger.error({ error: errDetail, channelId: message.channelId }, 'Error handling buddy mention')
    return false
  }
}
