/** identify_image: Google Lens match hints for one of the turn's images. Roka herself decides from them. */

import { config } from '../../../config.js'
import { turnImageUrl } from '../../media/turnImages.js'
import { registerSources } from '../../searchSources.js'
import { trySpend } from '../search/turnBudget.js'
import { SEARCH_TEXT } from '../search/types.js'
import { lookupLensImage } from './lens.js'

export interface IdentifyImageParams {
  attachment?: number
}

/** The tool is offered only when it could answer: enabled in config and holding a SerpApi key. */
export function identifyImageAvailable(): boolean {
  return config.imageId.enabled && Boolean(config.imageId.apiKey)
}

function matchLine(title: string, source: string | undefined, id: string | undefined): string {
  const name = source ? `${title} (${source})` : title
  return id ? `[${id}] ${name}` : `- ${name}`
}

export async function identifyImage(
  { attachment = 1 }: IdentifyImageParams,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string> {
  const url = Number.isInteger(attachment) ? turnImageUrl(attachment) : undefined
  if (!url) return `There is no image ${attachment} in this message.`
  // One reverse-image search spends one search and the provider call behind it, like a web search.
  if (!trySpend('search')) return SEARCH_TEXT.budgetSpent
  if (!config.imageId.apiKey) return 'Reverse-image lookup is not configured.'
  const lookup = await lookupLensImage(url, {
    apiKey: config.imageId.apiKey,
    timeoutMs: config.imageId.timeoutMs,
    maxMatches: config.imageId.maxMatches,
    fetchImpl
  })
  if (!lookup.ok) return lookup.reason
  if (lookup.matches.length === 0) return `No reverse-image matches for image ${attachment}.`
  const links = lookup.matches.map((match) => match.link).filter((link): link is string => Boolean(link))
  const ids = registerSources(links, 'search')
  const idByUrl = new Map(links.map((link, order) => [link, ids[order] as string]))
  // Matches stay out of the citation footer: most are unrelated pages, and the confirming search_web cites the listing.
  const lines = lookup.matches.map((match) =>
    matchLine(match.title, match.source, match.link ? idByUrl.get(match.link) : undefined)
  )
  return [`Unverified reverse-image matches for image ${attachment} — compare them with what you see:`, ...lines].join(
    '\n'
  )
}
