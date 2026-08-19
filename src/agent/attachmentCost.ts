import { GoogleGenAI, type Part } from '@google/genai'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

let client: GoogleGenAI | undefined

/**
 * What Gemini will actually charge for these attachment parts, or undefined if it could not be measured.
 *
 * Size does not bound token cost, and how badly it fails to depends entirely on the type: an image is a flat
 * 1,089 whatever its resolution, audio is 32 a second, video ~91 a second, and a PDF is **560 a page** — so a
 * 17 KB document can cost 28,000 tokens and a 10 MB one can cost far past a single request's whole budget.
 * `countTokens` is the only thing that prices all four without parsing containers, counting pages or probing
 * durations, and it does not draw on the generate quota — verified against a key whose 500 RPD was exhausted
 * and which still answered here normally.
 *
 * It is not free in transfer, though: this sends the same base64 the message will send, so a priced
 * attachment crosses the wire twice — ~4s each way for a 10 MB PDF at the Pi's measured throughput, inside
 * the 20s timeout but real. That is what `needsMeasuring` is for.
 */
export async function measureAttachmentTokens(parts: Part[]): Promise<number | undefined> {
  if (parts.length === 0) return 0
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey })

  try {
    const response = await client.models.countTokens({
      model: config.gemini.model,
      contents: [{ role: 'user', parts }]
    })
    return response.totalTokens ?? undefined
  } catch (error) {
    // Fails open on purpose. A probe that blocked the turn when it could not answer would convert a Gemini
    // hiccup into a total attachment outage — strictly worse than the over-budget turn it exists to prevent,
    // which merely fails one request.
    logger.warn({ error }, 'Could not measure attachment token cost, admitting the turn unmeasured')
    return undefined
  }
}

/** Whether these parts can be priced from what is already known, without spending a round trip. */
export function needsMeasuring(parts: Array<{ inlineData?: { mimeType?: string } }>): boolean {
  // An image costs a flat 1,089 regardless of pixels, so MAX_ATTACHMENTS of them is bounded at ~3,267 and
  // cannot approach any sane ceiling. Only the types whose cost tracks duration or page count need asking.
  //
  // That 1,089 is *this* model's number, and `gemini.model` is configurable. A model that priced images by
  // resolution would not make this stale, it would make it wrong — the skip would wave through the one case
  // it was built to bound. The floor on `gemini.maxAttachmentTokens` derives from the same constant, so the
  // ceiling moves with it; nothing else does.
  return parts.some((part) => !part.inlineData?.mimeType?.startsWith('image/'))
}
