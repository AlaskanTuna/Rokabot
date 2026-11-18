/**
 * Google Cloud Vision web detection: best-guess labels and web entities are the candidates,
 * pages with matching images are the sources. Abstains when no matching images exist.
 */
import type { IdentifyOutput, ImageCandidate, ImageIdBackend } from './types.js'

export const CLOUD_VISION_NAME = 'cloudVision'
// Web detection at list price, $1.50 per 1,000 images.
export const CLOUD_VISION_COST_USD = 0.0015

const ANNOTATE_URL = 'https://vision.googleapis.com/v1/images:annotate'

interface WebDetection {
  bestGuessLabels?: { label: string }[]
  webEntities?: { description?: string; score?: number }[]
  fullMatchingImages?: { url?: string }[]
  partialMatchingImages?: { url?: string }[]
  pagesWithMatchingImages?: { url?: string; pageTitle?: string }[]
}

/** The exact HTTP request the backend sends, exported for tests. */
export function cloudVisionRequest(imageBytes: Buffer, apiKey: string): { url: string; init: RequestInit } {
  return {
    url: `${ANNOTATE_URL}?key=${apiKey}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBytes.toString('base64') },
            features: [{ type: 'WEB_DETECTION', maxResults: 10 }]
          }
        ]
      })
    }
  }
}

export function parseCloudVisionResponse(json: unknown): Omit<IdentifyOutput, 'rawCost'> {
  const detection = (json as { responses?: [{ webDetection?: WebDetection }] })?.responses?.[0]?.webDetection
  const sources = [
    ...(detection?.fullMatchingImages ?? []),
    ...(detection?.partialMatchingImages ?? []),
    ...(detection?.pagesWithMatchingImages ?? [])
  ]
    .map((entry) => entry.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
  if (sources.length === 0) return { candidates: [], abstained: true }
  const candidates: ImageCandidate[] = []
  for (const label of detection?.bestGuessLabels ?? []) {
    if (label.label) candidates.push({ name: label.label, sourceUrls: sources })
  }
  for (const entity of detection?.webEntities ?? []) {
    if (entity.description) {
      candidates.push({ name: entity.description, confidence: entity.score, sourceUrls: sources })
    }
  }
  return { candidates, abstained: candidates.length === 0 }
}

export function cloudVisionKey(): string | undefined {
  return process.env.GOOGLE_CLOUD_VISION_API_KEY || undefined
}

export function createCloudVisionBackend(
  fetchImpl: typeof fetch = globalThis.fetch,
  apiKey: string | undefined = cloudVisionKey()
): ImageIdBackend {
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY is not set')
  return {
    name: CLOUD_VISION_NAME,
    async identify(imageBytes: Buffer): Promise<IdentifyOutput> {
      const { url, init } = cloudVisionRequest(imageBytes, apiKey)
      const response = await fetchImpl(url, init)
      if (!response.ok) return { candidates: [], abstained: true, rawCost: CLOUD_VISION_COST_USD }
      return { ...parseCloudVisionResponse(await response.json()), rawCost: CLOUD_VISION_COST_USD }
    }
  }
}
