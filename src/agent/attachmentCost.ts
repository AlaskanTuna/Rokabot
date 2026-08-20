import { GoogleGenAI, type Part } from '@google/genai'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

let client: GoogleGenAI | undefined

/**
 * The share of a video's own token estimate that its soundtrack would cost if charged separately.
 *
 * `countTokens` returns the SAME total for a clip with and without its audio stream, while the model
 * demonstrably hears that audio — a black-frames video whose only content was speech was transcribed
 * correctly, so the sound reached the model even though nothing in the picture could have carried it (#153).
 * Measured twice independently on matched clips: 2,133/2,133 and 2,070/2,070 tokens with and without the
 * stream, against 32.1 and 32.05 tokens a second for the same audio priced on its own. Audio is therefore
 * ~31% of a low-resolution video's ~104/second, and the estimate omits all of it.
 *
 * Whether Google BILLS that audio is NOT established. `countTokens` is already known to diverge from billing
 * for time-based media, so its silence here is not evidence the audio is free. Two readings fit the evidence
 * — audio in video is genuinely unbilled and the estimate is right, or it is billed and the estimate is low.
 * This allowance takes the second, because only one of the two fails dangerously: an under-estimate admits a
 * turn that then 429s, which retries into the same wall and spends the minute's budget for every other
 * channel, while an over-estimate merely refuses a long video early.
 *
 * A billing-side measurement — `usageMetadata.promptTokenCount` from one `generateContent` per clip — would
 * replace this constant with a fact and could remove it entirely. It has not been run.
 */
const VIDEO_AUDIO_ALLOWANCE = 0.31

/**
 * What Gemini will charge for these attachment parts, or undefined if it could not be measured. For video
 * this is `countTokens` plus an allowance for the soundtrack it does not price — see `VIDEO_AUDIO_ALLOWANCE`.
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
    if (response.totalTokens === undefined || response.totalTokens === null) return undefined

    // `MAX_ATTACHMENTS` is 1, so when a video is present the whole total is that video's. Applied to silent
    // video too: `countTokens` cannot distinguish one, and finding out means parsing a container per format.
    // Over-charging a silent clip by ~31% errs toward refusing, which is the direction that costs a message
    // rather than the minute.
    const carriesVideo = parts.some((part) => part.inlineData?.mimeType?.startsWith('video/'))
    return carriesVideo ? Math.round(response.totalTokens * (1 + VIDEO_AUDIO_ALLOWANCE)) : response.totalTokens
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
