/** Weather command handler */

import type { ChatInputCommandInteraction } from 'discord.js'
import { getWeather } from '../../../agent/tools/getWeather.js'
import { CURIOUS_COLOR, FLAVOR, buildToolMessage, randomFrom } from './shared.js'

export async function handleWeather(interaction: ChatInputCommandInteraction) {
  const city = interaction.options.getString('city', true)
  const flavor = randomFrom(FLAVOR.weather)

  const result = await getWeather({ city })
  const locationLabel = result.country ? `${result.city}, ${result.country}` : result.city
  const dayNight = result.isDay ? '\u2600\uFE0F' : '\uD83C\uDF19'

  const text = [
    flavor,
    '',
    `${dayNight} **${locationLabel}**`,
    `${result.condition}`,
    `\uD83C\uDF21\uFE0F ${result.temperature}\u00B0C (feels like ${result.feelsLike}\u00B0C)`,
    `\uD83D\uDCA7 ${result.humidity}% humidity`,
    `\uD83D\uDCA8 ${result.windSpeed} km/h`
  ].join('\n')

  return buildToolMessage(text, CURIOUS_COLOR)
}
