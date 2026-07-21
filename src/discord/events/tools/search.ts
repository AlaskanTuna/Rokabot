/** Web search command handler */

import type { ChatInputCommandInteraction } from 'discord.js'
import { searchWeb } from '../../../agent/tools/searchWeb.js'
import { CURIOUS_COLOR, FLAVOR, buildToolMessage, randomFrom } from './shared.js'

export async function handleSearch(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString('query', true)
  const flavor = randomFrom(FLAVOR.search)
  const result = await searchWeb({ query })
  const lines = [flavor, '', `\uD83D\uDD0D **${query}**`]
  if (result.answer && result.answer !== 'No summary available.') {
    lines.push('', result.answer)
  }
  if (result.results.length > 0) {
    lines.push('')
    for (const r of result.results.slice(0, 3)) {
      lines.push(`[\u2197 ${r.title}](${r.url})`)
    }
  } else if (!result.answer || result.answer === 'No summary available.') {
    lines.push('', "Hmm, I couldn't find anything for that~ Maybe try a different query?")
  }
  return buildToolMessage(lines.join('\n'), CURIOUS_COLOR)
}
