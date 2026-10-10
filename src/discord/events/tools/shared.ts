/** Shared utilities, colors, and flavor text for tool command handlers */

import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { MessageFlags } from 'discord.js'

export const PLAYFUL_COLOR = 0xffb3d9
export const CURIOUS_COLOR = 0xb2ebf2

// In-character flavor lines prepended to each tool response
export const FLAVOR = {
  anime: ['Ooh, let me look that up! \u266a', 'Anime search time~ fufu~', 'Let me see what I can find~!'],
  schedule: ["Let's see what's airing~", 'Checking the schedule for you! \u266a', "Time to see what's on today~"],
  weather: [
    'Hmm, let me check the weather for you~',
    'I wonder what the weather is like there~',
    "Let's see~ checking the forecast!"
  ],
  search: ['Let me look that up for you~', 'Hmm, good question! Let me check~', "One moment~ I'll search for that!"],
  remind: ["I'll remember for you~", 'Leave it to me! \u266a', "I'll make sure you don't forget~"]
}

export const ERROR_MESSAGES = [
  'Nn... something went wrong. Maybe try again later?',
  "Ah, that didn't work... sorry about that~",
  'Mou, I ran into a little trouble. Give me another chance?'
]

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
