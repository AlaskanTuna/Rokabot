/** Shared utilities, colors, and flavor text for tool command handlers */

import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import { character } from '../../../character/index.js'

export const PLAYFUL_COLOR = 0xffb3d9
export const CURIOUS_COLOR = 0xb2ebf2

// In-character flavor lines prepended to each tool response
export const FLAVOR = character.lines.tools.flavor

export const ERROR_MESSAGES = character.lines.tools.error

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Wrap text in a colored Components V2 container for consistent tool output styling. */
export function buildToolMessage(text: string, color: number) {
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}
