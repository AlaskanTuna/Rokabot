/**
 * Google Lens over a photo's public URL (a Discord CDN link in the bot) via SerpApi, for identify_image.
 * The bake-off script imports the request builder and response parser from here, so the two never drift.
 */

const SEARCH_URL = 'https://serpapi.com/search.json'

export function lensSearchRequest(imageUrl: string, apiKey: string): { url: string; init: RequestInit } {
  const params = new URLSearchParams({ engine: 'google_lens', url: imageUrl, api_key: apiKey })
  return { url: `${SEARCH_URL}?${params}`, init: { method: 'GET' } }
}

interface RawVisualMatch {
  title?: string
  link?: string
  source?: string
}

function readVisualMatches(json: unknown): RawVisualMatch[] {
  const matches = (json as { visual_matches?: RawVisualMatch[] })?.visual_matches
  return Array.isArray(matches) ? matches : []
}

export interface LensMatch {
  title: string
  link?: string
  source?: string
}

/** The visual matches with a title, capped at maxMatches, in Lens order. */
export function parseLensMatches(json: unknown, maxMatches: number): LensMatch[] {
  const matches: LensMatch[] = []
  for (const match of readVisualMatches(json)) {
    if (matches.length >= maxMatches) break
    if (!match?.title) continue
    const parsed: LensMatch = { title: match.title }
    if (match.link) parsed.link = match.link
    if (match.source) parsed.source = match.source
    matches.push(parsed)
  }
  return matches
}

/** The bake-off's view of a Lens response: named candidates with their source urls, abstaining when empty. */
export function parseLensResponse(json: unknown): {
  candidates: Array<{ name: string; sourceUrls: string[] }>
  abstained: boolean
} {
  const candidates: Array<{ name: string; sourceUrls: string[] }> = []
  for (const match of readVisualMatches(json)) {
    if (match?.title) {
      candidates.push({ name: match.title, sourceUrls: match.link ? [match.link] : [] })
    }
  }
  return { candidates, abstained: candidates.length === 0 }
}

export type LensLookup = { ok: true; matches: LensMatch[] } | { ok: false; reason: string }

export interface LensLookupOptions {
  apiKey: string
  timeoutMs: number
  maxMatches: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** One Lens search over the image url. A failed lookup returns a short reason and never throws into ADK. */
export async function lookupLensImage(url: string, options: LensLookupOptions): Promise<LensLookup> {
  const { apiKey, timeoutMs, maxMatches, signal, fetchImpl = globalThis.fetch } = options
  const { url: requestUrl, init } = lensSearchRequest(url, apiKey)
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetchImpl(requestUrl, { ...init, signal: combined })
  } catch (error) {
    if (signal?.aborted) return { ok: false, reason: 'The reverse-image lookup was aborted.' }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, reason: 'The reverse-image lookup timed out.' }
    }
    return { ok: false, reason: 'The reverse-image lookup failed.' }
  }
  if (!response.ok) return { ok: false, reason: `The reverse-image lookup failed (status ${response.status}).` }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, reason: 'The reverse-image lookup failed.' }
  }
  return { ok: true, matches: parseLensMatches(json, maxMatches) }
}
