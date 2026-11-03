/** Shared container builders and utilities for game command handlers */

import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import { type BuddyData, getSpeciesInfo } from '../../../games/buddy.js'
import { RARITY_EMOJI, SPECIES, STAT_NAMES } from '../../../games/data/buddySpecies.js'

export function buddySprite(speciesId: string): string {
  return SPECIES.find(({ id }) => id === speciesId)?.spriteUrl ?? ''
}

export interface GameContainerOptions {
  accentColor: number
  title: string
  body: string
  footer?: string
}

export function buildGameContainer(options: GameContainerOptions) {
  const container = new ContainerBuilder()
    .setAccentColor(options.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${options.title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(options.body))

  if (options.footer) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${options.footer}`))
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}

/** Build a Components V2 container with a buddy thumbnail in the top-right section. */
export function buildBuddyContainer(options: {
  accentColor: number
  title: string
  body: string
  thumbnailUrl?: string
  footer?: string
}) {
  const container = new ContainerBuilder().setAccentColor(options.accentColor)

  if (options.thumbnailUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${options.title}\n\n${options.body}`))
      .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: options.thumbnailUrl } }))
    container.addSectionComponents(section)
  } else {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${options.title}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(options.body))
  }

  if (options.footer) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${options.footer}`))
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}

/** Build a Components V2 container for timeout notifications sent to the channel. */
export function buildTimeoutContainer(accentColor: number, title: string, body: string) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Build a stat bar: e.g. "CHARM/魅力  ████░░░░░░  4/10" */
export function statBar(value: number, max: number = 10): string {
  const filled = '█'.repeat(value)
  const empty = '░'.repeat(max - value)
  return `${filled}${empty}`
}

/** Format a buddy summary for display. */
export function formatBuddySummary(buddy: BuddyData): string {
  const info = getSpeciesInfo(buddy.species)
  const rarityEmoji = RARITY_EMOJI[buddy.rarity]
  const shinyTag = buddy.shiny ? ' ✨ **SHINY**' : ''
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

  return lines.join('\n')
}
