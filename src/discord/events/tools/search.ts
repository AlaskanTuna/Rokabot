/** Web search command handler */

import type { ChatInputCommandInteraction } from 'discord.js'
import { searchWeb } from '../../../agent/tools/searchWeb.js'
import { CURIOUS_COLOR, FLAVOR, TEXT_DISPLAY_LIMIT, buildToolMessage, randomFrom } from './shared.js'

/** searchWeb returns this exact string when the provider gave no synthesised answer. */
const NO_SUMMARY = 'No summary available.'

const MAX_FOOTNOTES = 3

/** Cites the domain rather than the page title: it is far shorter, and it is what signals source authority. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** One small-text line of numbered domain citations, matching the tool-usage footer's visual weight. */
function buildFootnotes(results: ReadonlyArray<{ url: string }>): string {
  const cites = results
    .slice(0, MAX_FOOTNOTES)
    .map((result, index) => `${index + 1}. [${sourceHost(result.url)}](${result.url})`)
  return `-# 🔗 ${cites.join('  ·  ')}`
}

function clampToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget <= 1) return ''
  return `${text.slice(0, budget - 1).trimEnd()}…`
}

export async function handleSearch(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString('query', true)
  const result = await searchWeb({ query })
  // Compared before any clamping, so the sentinel is never truncated into something that fails this check.
  const summary = result.answer && result.answer !== NO_SUMMARY ? result.answer : undefined

  const head = [randomFrom(FLAVOR.search), '', `🔍 **${query}**`]
  const tail: string[] = []
  if (result.results.length > 0) tail.push('', buildFootnotes(result.results))
  else if (!summary) tail.push('', "Hmm, I couldn't find anything for that~ Maybe try a different query?")

  if (!summary) return buildToolMessage([...head, ...tail].join('\n'), CURIOUS_COLOR)

  // The provider's answer is the only unbounded part, so it absorbs whatever the fixed parts leave.
  // Joining n parts adds n-1 newlines; inserting the blank line and the summary adds exactly 2 more.
  const fixedChars = [...head, ...tail].join('\n').length + 2
  const body = clampToBudget(summary, TEXT_DISPLAY_LIMIT - fixedChars)

  return buildToolMessage([...head, '', body, ...tail].join('\n'), CURIOUS_COLOR)
}
