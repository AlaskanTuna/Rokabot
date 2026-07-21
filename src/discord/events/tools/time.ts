/** Time command handler */

import type { ChatInputCommandInteraction } from 'discord.js'
import { getCurrentTime } from '../../../agent/tools/getCurrentTime.js'
import { CURIOUS_COLOR, FLAVOR, buildToolMessage, randomFrom } from './shared.js'

export function handleTime(interaction: ChatInputCommandInteraction) {
  const location = interaction.options.getString('location', true)
  const format = (interaction.options.getString('format') ?? '24h') as '12h' | '24h'

  const result = getCurrentTime({ location, format })
  const displayName = location.charAt(0).toUpperCase() + location.slice(1)
  const flavor = randomFrom(FLAVOR.time)
  const text = `${flavor}\n\n\uD83D\uDD50 **${displayName}** (${result.timezone})\n${result.time}, ${result.day}, ${result.date}`
  return buildToolMessage(text, CURIOUS_COLOR)
}
