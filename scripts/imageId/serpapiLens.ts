/**
 * SerpApi Google Lens: a Lens search over the photo's public URL (a Discord CDN link in the bake-off and in
 * identify_image). Visual matches are the candidates; no matches means abstain.
 */
import type { IdentifyOutput, ImageCandidate, ImageIdBackend } from './types.js'

export const SERPAPI_LENS_NAME = 'serpapiLens'
// Roughly one pay-as-you-go search; SerpApi plans move, so the summary treats this as an estimate.
export const SERPAPI_LENS_COST_USD = 0.01

const SEARCH_URL = 'https://serpapi.com/search.json'

export function lensSearchRequest(imageUrl: string, apiKey: string): { url: string; init: RequestInit } {
  const params = new URLSearchParams({ engine: 'google_lens', url: imageUrl, api_key: apiKey })
  return { url: `${SEARCH_URL}?${params}`, init: { method: 'GET' } }
}

export function parseLensResponse(json: unknown): Omit<IdentifyOutput, 'rawCost'> {
  const matches = (json as { visual_matches?: { title?: string; link?: string; source?: string }[] })?.visual_matches
  const candidates: ImageCandidate[] = []
  for (const match of matches ?? []) {
    if (match?.title) {
      candidates.push({
        name: match.title,
        sourceUrls: match.link ? [match.link] : []
      })
    }
  }
  return { candidates, abstained: candidates.length === 0 }
}

export function serpapiKey(): string | undefined {
  return process.env.SERPAPI_API_KEY || undefined
}

export function createSerpapiLensBackend(
  fetchImpl: typeof fetch = globalThis.fetch,
  apiKey: string | undefined = serpapiKey()
): ImageIdBackend {
  if (!apiKey) throw new Error('SERPAPI_API_KEY is not set')
  return {
    name: SERPAPI_LENS_NAME,
    // SerpApi's Lens engine searches a public image URL and takes no bytes, as identify_image would pass a Discord CDN link.
    async identify(_imageBytes: Buffer, _mime: string, publicUrl?: string): Promise<IdentifyOutput> {
      if (!publicUrl) throw new Error('serpapiLens needs a url for this photo in labels.json')
      const { url, init } = lensSearchRequest(publicUrl, apiKey)
      const response = await fetchImpl(url, init)
      if (!response.ok) return { candidates: [], abstained: true, rawCost: SERPAPI_LENS_COST_USD }
      return { ...parseLensResponse(await response.json()), rawCost: SERPAPI_LENS_COST_USD }
    }
  }
}
