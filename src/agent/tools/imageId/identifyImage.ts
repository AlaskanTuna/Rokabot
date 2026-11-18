/** identify_image: Google Lens match hints for one of the turn's images. Roka herself decides from them. */

import { config } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import { turnImageUrl } from '../../media/turnImages.js'
import { registerSources } from '../../searchSources.js'
import { trySpend } from '../search/turnBudget.js'
import { SEARCH_TEXT } from '../search/types.js'
import { lookupLensImage } from './lens.js'
import { cachedLens, lensAllowed, lensCacheKey, recordLensSearch, storeLens } from './lensLedger.js'
import type { LensKind } from './lensLedger.js'

export interface IdentifyImageParams {
  attachment?: number
}

/** The tool is offered only when it could answer: enabled in config and holding a SerpApi key. */
export function identifyImageAvailable(): boolean {
  return config.imageId.enabled && Boolean(config.imageId.apiKey)
}

/** Plain text when the shared ledger is spent; the tool stays listed and just refuses. */
export const LENS_EXHAUSTED_TEXT = 'Image lookups are used up for now.'

let lastCapWarnDay = ''

function matchLine(title: string, source: string | undefined, id: string | undefined): string {
  const name = source ? `${title} (${source})` : title
  return id ? `[${id}] ${name}` : `- ${name}`
}

type LensMatch = { title: string; link?: string; source?: string }

/**
 * The tool text for one image's matches. Source ids are turn-scoped, so they are registered here on every call,
 * including a cache hit, never stored.
 */
function renderMatches(attachment: number, matches: readonly LensMatch[]): string {
  if (matches.length === 0) return `No reverse-image matches for image ${attachment}.`
  const links = matches.map((match) => match.link).filter((link): link is string => Boolean(link))
  const ids = registerSources(links, 'search')
  const idByUrl = new Map(links.map((link, order) => [link, ids[order] as string]))
  // Matches stay out of the citation footer: most are unrelated pages, and the confirming search_web cites the listing.
  const lines = matches.map((match) =>
    matchLine(match.title, match.source, match.link ? idByUrl.get(match.link) : undefined)
  )
  return [`Unverified reverse-image matches for image ${attachment} — compare them with what you see:`, ...lines].join(
    '\n'
  )
}

export async function identifyImage(
  { attachment = 1 }: IdentifyImageParams,
  fetchImpl: typeof fetch = globalThis.fetch,
  kind: LensKind = 'model'
): Promise<string> {
  const url = Number.isInteger(attachment) ? turnImageUrl(attachment) : undefined
  if (!url) return `There is no image ${attachment} in this message.`
  // A repeat of an image already looked up costs neither a SerpApi call nor turn budget.
  const key = lensCacheKey(url)
  const hit = cachedLens(key)
  if (hit !== undefined) return renderMatches(attachment, JSON.parse(hit) as LensMatch[])
  if (!lensAllowed(kind)) {
    const day = new Date().toISOString().slice(0, 10)
    if (day !== lastCapWarnDay) {
      lastCapWarnDay = day
      logger.warn({ kind }, 'Image lookups used up, refusing')
    }
    return LENS_EXHAUSTED_TEXT
  }
  // One reverse-image search spends one search and the provider call behind it, like a web search.
  if (!trySpend('search')) return SEARCH_TEXT.budgetSpent
  if (!config.imageId.apiKey) return 'Reverse-image lookup is not configured.'
  const lookup = await lookupLensImage(url, {
    apiKey: config.imageId.apiKey,
    timeoutMs: config.imageId.timeoutMs,
    maxMatches: config.imageId.maxMatches,
    fetchImpl
  })
  recordLensSearch(kind)
  if (!lookup.ok) return lookup.reason
  const matches: LensMatch[] = lookup.matches.map(({ title, link, source }) => ({ title, link, source }))
  storeLens(key, JSON.stringify(matches))
  return renderMatches(attachment, matches)
}
