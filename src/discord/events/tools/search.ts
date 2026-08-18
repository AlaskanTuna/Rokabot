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

/**
 * One small-text line of numbered domain citations, matching the tool-usage footer's visual weight.
 * Citations are dropped whole rather than truncated — half a URL is a broken link, not a shorter one.
 *
 * Targets are wrapped in angle brackets so a URL containing ')' does not close the link early: Wikipedia
 * disambiguation suffixes like /Frieren_(character) are common for this bot's subject matter, and the bare
 * form would render a link to '…/Frieren_(character' with a stray ')' after it. It also keeps the row from
 * expanding into link embeds. The label is the host, which cannot contain the ']' that would break it.
 */
function fitFootnotes(results: ReadonlyArray<{ url: string }>, budget: number): string {
  const cites = results
    .slice(0, MAX_FOOTNOTES)
    .map((result, index) => `${index + 1}. [${sourceHost(result.url)}](<${result.url}>)`)
  while (cites.length > 0) {
    const line = `-# 🔗 ${cites.join('  ·  ')}`
    if (line.length <= budget) return line
    cites.pop()
  }
  return ''
}

function clampToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget <= 1) return ''
  return `${text.slice(0, budget - 1).trimEnd()}…`
}

/**
 * The query is echoed back for context, not for its own sake, so it never takes more than this share of the
 * budget. Discord sets no maxLength on the option, and letting a pasted wall of text bid for the whole
 * TextDisplay would starve the answer and its citations — the two things the user actually asked for.
 */
const QUERY_BUDGET = Math.floor(TEXT_DISPLAY_LIMIT / 4)

export async function handleSearch(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString('query', true)
  const result = await searchWeb({ query })
  // Compared before any clamping, so the sentinel is never truncated into something that fails this check.
  const summary = result.answer && result.answer !== NO_SUMMARY ? result.answer : undefined

  // Every section is user- or provider-controlled and none is bounded at its source, so each is fitted to
  // what the previous ones left: the header names the search, citations are cheap, the answer takes the rest.
  const flavor = randomFrom(FLAVOR.search)
  const head = [flavor, '', `🔍 **${clampToBudget(query, QUERY_BUDGET)}**`]

  const tail: string[] = []
  const footnotes =
    result.results.length > 0 ? fitFootnotes(result.results, TEXT_DISPLAY_LIMIT - head.join('\n').length - 2) : ''
  if (footnotes) tail.push('', footnotes)
  else if (!summary) tail.push('', "Hmm, I couldn't find anything for that~ Maybe try a different query?")

  // Joining n parts adds n-1 newlines; inserting the blank line and the summary adds exactly 2 more.
  const fixed = [...head, ...tail].join('\n')
  const body = summary ? clampToBudget(summary, TEXT_DISPLAY_LIMIT - fixed.length - 2) : ''
  const text = body ? [...head, '', body, ...tail].join('\n') : fixed

  return buildToolMessage(text, CURIOUS_COLOR)
}
