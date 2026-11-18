/**
 * SerpApi Google Lens: the photo is uploaded first (500 KB cap, so it is downscaled with sharp),
 * then identified through a Lens search over the uploaded image. Visual matches are the
 * candidates; no matches means abstain.
 */
import sharp from 'sharp'
import type { IdentifyOutput, ImageCandidate, ImageIdBackend } from './types.js'

export const SERPAPI_LENS_NAME = 'serpapiLens'
// Roughly one pay-as-you-go search; SerpApi plans move, so the summary treats this as an estimate.
export const SERPAPI_LENS_COST_USD = 0.01
export const SERPAPI_LENS_MAX_BYTES = 500 * 1024

const SEARCH_URL = 'https://serpapi.com/search.json'

/**
 * Shrink the photo until it fits the upload cap. Only reached when the bot's own processor
 * still leaves an image over the limit, so it runs rarely.
 */
export async function downscaleForLens(imageBytes: Buffer): Promise<Buffer> {
  let bytes = imageBytes
  for (let scale = 0.8; bytes.length > SERPAPI_LENS_MAX_BYTES && scale > 0.1; scale -= 0.2) {
    const metadata = await sharp(bytes).metadata()
    const width = Math.max(1, Math.floor((metadata.width ?? 1024) * scale))
    bytes = await sharp(bytes).resize({ width }).jpeg({ quality: 80 }).toBuffer()
  }
  return bytes
}

/**
 * Upload photo bytes for a Lens search and return the image URL to search over.
 *
 * SerpApi has no documented raw-bytes upload endpoint for Google Lens that this repo could
 * verify without a live key, so this posts multipart bytes to the Lens endpoint and reads the
 * `image_url` it answers with. If that shape is wrong, replace this function only.
 */
export async function uploadImageBytesForLens(
  fetchImpl: typeof fetch,
  apiKey: string,
  imageBytes: Buffer,
  mime: string
): Promise<string> {
  const form = new FormData()
  form.append('engine', 'google_lens')
  form.append('api_key', apiKey)
  form.append('image', new Blob([new Uint8Array(imageBytes)], { type: mime }), 'photo.jpg')
  const response = await fetchImpl(SEARCH_URL, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Lens upload failed with status ${response.status}`)
  const json = (await response.json()) as { image_url?: string }
  if (!json.image_url) throw new Error('Lens upload answered without an image_url')
  return json.image_url
}

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
    async identify(imageBytes: Buffer, mime: string): Promise<IdentifyOutput> {
      const fitted = await downscaleForLens(imageBytes)
      const imageUrl = await uploadImageBytesForLens(fetchImpl, apiKey, fitted, mime)
      const { url, init } = lensSearchRequest(imageUrl, apiKey)
      const response = await fetchImpl(url, init)
      if (!response.ok) return { candidates: [], abstained: true, rawCost: SERPAPI_LENS_COST_USD }
      return { ...parseLensResponse(await response.json()), rawCost: SERPAPI_LENS_COST_USD }
    }
  }
}
