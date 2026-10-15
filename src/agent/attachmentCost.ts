import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, type Part } from '@google/genai'
import sharp from 'sharp'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { IMAGE_TYPES } from './llm/anthropicLlm.js'

let client: GoogleGenAI | undefined
let anthropic: Anthropic | undefined

/** Anthropic's published image cost; Chat Completions vision models land near it for the ≤1024 px images sent here. */
const PIXELS_PER_IMAGE_TOKEN = 750
const UNREADABLE_IMAGE_TOKENS = Math.ceil((1024 * 1024) / PIXELS_PER_IMAGE_TOKEN)
/** A page's text plus its rendered image: an estimate, not a measurement. */
const PDF_PAGE_TOKENS = 1500
const CHARS_PER_TOKEN = 4
const UNSENT_MEDIA_MARKER = '(an attachment this model cannot take)'

/**
 * What Gemini will charge for these attachment parts, or undefined if it could not be measured.
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
/**
 * Video is NOT adjusted upward, and the reason is measured rather than assumed.
 *
 * `countTokens` does under-price a video's soundtrack — sometimes to nothing at all, and how much is a
 * property of the (video, audio) pair rather than of the audio (#153). But it over-prices the video itself by
 * far more, so the total already runs above the bill. Four matched clips, `countTokens` against
 * `usageMetadata.promptTokenCount`:
 *
 *     black frames + audio   2070 -> 1768   1.17x     black frames, silent   2070 -> 1268   1.63x
 *     854x480 24fps + audio  2133 -> 1828   1.17x     854x480, silent        2061 -> 1328   1.55x
 *
 * Billing is the clean side: audio bills 500 tokens for 20 seconds beside BOTH videos, ~25/second, matching
 * the same audio priced alone. The erratic side is the estimator.
 *
 * THE MARGIN IS BORROWED, NOT INHERENT. `roka.ts` sets `MEDIA_RESOLUTION_LOW` on any request carrying video,
 * so the biller charges ~65 tokens/second while `countTokens` — which cannot be given a media resolution on
 * the Developer API — prices at ~103. Both terms are linear in duration, so the ratio holds at any length.
 * Remove that setting, or let a future part shape stop matching `requestCarriesVideo`, and billing rises
 * toward the default resolution while this estimate does not move: the guard would flip from over- to
 * under-estimating with nothing here changing. What fails if that happens is `pins low media resolution for
 * video, which is what keeps the cost estimate above the bill`, in roka.test.ts — the check lives with the
 * setting, because only that file can observe it. The test below pins this module's half only: that the probe
 * cannot ask for a resolution even if it wanted to.
 */
export async function measureAttachmentTokens(
  parts: Part[],
  target: 'main' | 'gemini' = 'main'
): Promise<number | undefined> {
  if (parts.length === 0) return 0
  const counter = target === 'gemini' ? 'gemini' : config.llm.main.profile.tokenCounter
  try {
    if (counter === 'anthropic') return await countWithAnthropic(parts)
    if (counter === 'estimate') return await estimateTokens(parts)
    client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey })
    const response = await client.models.countTokens({
      model: target === 'main' ? config.llm.main.model : config.gemini.model,
      contents: [{ role: 'user', parts }]
    })
    return response.totalTokens ?? undefined
  } catch (error) {
    // Fails open on purpose. A probe that blocked the turn when it could not answer would convert a provider
    // hiccup into a total attachment outage — strictly worse than the over-budget turn it exists to prevent,
    // which merely fails one request.
    logger.warn({ error }, 'Could not measure attachment token cost, admitting the turn unmeasured')
    return undefined
  }
}

function anthropicBlock(part: Part): Anthropic.ContentBlockParam {
  const mimeType = part.inlineData?.mimeType ?? ''
  const data = part.inlineData?.data ?? ''
  if (IMAGE_TYPES.has(mimeType)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: mimeType as Anthropic.Base64ImageSource['media_type'], data }
    }
  }
  if (mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  return { type: 'text', text: part.text ?? UNSENT_MEDIA_MARKER }
}

async function countWithAnthropic(parts: Part[]): Promise<number> {
  const { apiKey, model, timeoutMs } = config.llm.main
  anthropic ??= new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs })
  const response = await anthropic.messages.countTokens({
    model,
    messages: [{ role: 'user', content: parts.map(anthropicBlock) }]
  })
  return response.input_tokens
}

async function imageTokens(bytes: Buffer): Promise<number> {
  try {
    const { width, height } = await sharp(bytes).metadata()
    return width && height ? Math.ceil((width * height) / PIXELS_PER_IMAGE_TOKEN) : UNREADABLE_IMAGE_TOKENS
  } catch {
    return UNREADABLE_IMAGE_TOKENS
  }
}

function pdfPages(bytes: Buffer): number {
  const text = bytes.toString('latin1')
  // Page objects can hide in compressed object streams, so the page tree's /Count stands in for them. Outlines
  // also carry a /Count, which can only overstate the cost.
  const pageObjects = text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map(([, count]) => Number(count))
  return Math.max(1, pageObjects, ...counts)
}

async function estimateTokens(parts: Part[]): Promise<number | undefined> {
  const { input } = config.llm.main.profile
  let total = 0
  for (const part of parts) {
    const mimeType = part.inlineData?.mimeType ?? ''
    const data = part.inlineData?.data
    if (part.text !== undefined) total += Math.ceil(part.text.length / CHARS_PER_TOKEN)
    else if (!data) continue
    else if (mimeType.startsWith('image/')) total += await imageTokens(Buffer.from(data, 'base64'))
    else if (mimeType === 'application/pdf') total += pdfPages(Buffer.from(data, 'base64')) * PDF_PAGE_TOKENS
    // Duration is not known here, so a profile that would hear or watch the file gets no estimate, not a wrong one.
    else if ((mimeType.startsWith('audio/') && input.audio) || (mimeType.startsWith('video/') && input.video)) {
      return undefined
    } else total += Math.ceil(UNSENT_MEDIA_MARKER.length / CHARS_PER_TOKEN)
  }
  return total
}

/** Whether these parts can be priced from what is already known, without spending a round trip. */
export function needsMeasuring(parts: Array<{ inlineData?: { mimeType?: string } }>): boolean {
  // Claude Haiku 5.5 counts a 1,024-pixel image at about 1,400 tokens; ten stay near 14,000, far under the
  // 125,000-token default ceiling. Only types whose cost tracks duration or page count need asking.
  //
  // This estimate is model-specific. A model that prices images by resolution would make the skip wrong — it
  // would wave through the one case it was built to bound. The floor on `gemini.maxAttachmentTokens` still
  // derives from Gemini's flat image charge; the maximum count and the main model's image cost are separate.
  return parts.some((part) => !part.inlineData?.mimeType?.startsWith('image/'))
}
