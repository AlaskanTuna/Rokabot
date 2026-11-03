/** Shared container builders and utilities for game command handlers */

import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import { SPECIES } from '../../../games/data/buddySpecies.js'

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
