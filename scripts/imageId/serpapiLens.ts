/**
 * SerpApi Google Lens: a Lens search over the photo's public URL (a Discord CDN link in the bake-off and in
 * identify_image). Visual matches are the candidates; no matches means abstain. The request builder and
 * response parser live in the bot's Lens client, so the bake-off and the tool never drift.
 */
import { lensSearchRequest, parseLensResponse } from '../../src/agent/tools/imageId/lens.js'
import type { IdentifyOutput, ImageIdBackend } from './types.js'

export { lensSearchRequest, parseLensResponse }

export const SERPAPI_LENS_NAME = 'serpapiLens'
// Roughly one pay-as-you-go search; SerpApi plans move, so the summary treats this as an estimate.
export const SERPAPI_LENS_COST_USD = 0.01

export function serpapiKey(): string | undefined {
  return process.env.SERPAPI_API_KEY || undefined
}

const lensRuns = new Map<string, Promise<Omit<IdentifyOutput, 'rawCost'>>>()

/** One Lens search per photo URL, shared by the Lens backend and the hybrid's hints, so a run spends one search a photo. */
export function lensMatches(
  publicUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Omit<IdentifyOutput, 'rawCost'>> {
  const cached = lensRuns.get(publicUrl)
  if (cached) return cached
  const run = (async () => {
    const { url, init } = lensSearchRequest(publicUrl, apiKey)
    const response = await fetchImpl(url, init)
    if (!response.ok) return { candidates: [], abstained: true }
    return parseLensResponse(await response.json())
  })()
  lensRuns.set(publicUrl, run)
  return run
}

export function __resetLensCacheForTest(): void {
  lensRuns.clear()
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
      return { ...(await lensMatches(publicUrl, apiKey, fetchImpl)), rawCost: SERPAPI_LENS_COST_USD }
    }
  }
}
