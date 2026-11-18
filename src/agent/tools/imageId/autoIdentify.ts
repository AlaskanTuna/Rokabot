/** Runs identify_image before Roka answers when a turn shows an image and asks who or what it is. */

import { logger } from '../../../utils/logger.js'
import { turnImages } from '../../media/turnImages.js'
import { identifyImage, identifyImageAvailable } from './identifyImage.js'
import { lensAllowed } from './lensLedger.js'

/** Footer key for a lookup the turn ran on its own, so the reply says it was automatic. */
export const AUTO_IDENTIFY_TOOL_NAME = 'identify_image_auto'

// "who is this", "what's this", "which character", "same person?", "identify", and the Japanese 誰 / 何.
const ASKS_IDENTITY =
  /\bwho\b|\bwhat(?:'s| is| are|'re)\b|\bwhich (?:character|anime|game|series|figure|plush|product|model|brand|one)\b|\bidentify\b|\bsame (?:person|character|girl|guy|one)\b|誰|だれ|何これ|これは何|なにこれ/i

/** Whether the turn asks who or what is pictured: an image is present and the text asks for an identity. */
export function asksWhoIsPictured(message: string, imageCount: number): boolean {
  return imageCount > 0 && ASKS_IDENTITY.test(message)
}

/**
 * The automatic lookup for the turn's first identifying image, as a note for Roka's message, or null when
 * the turn does not ask or the tool is unavailable. Tests only the speaker's own text — the caller strips
 * the reply quote, embed descriptions, forwarded text and container text before calling. Runs inside the
 * turn's image, source and budget scopes, like the tool itself.
 */
export async function autoIdentifyNote(
  message: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string | null> {
  if (!identifyImageAvailable() || !lensAllowed('auto')) return null
  // A link preview is the article's furniture, not the question: look past it at what was actually shared.
  const images = turnImages()
  const found = images.findIndex((image) => image.origin !== 'link_preview')
  if (found === -1 || !asksWhoIsPictured(message, 1)) return null
  const attachment = found + 1
  const result = await identifyImage({ attachment }, fetchImpl, 'auto')
  logger.info({ imageCount: images.length, attachment }, 'Identified an image before the reply')
  return `[A reverse-image lookup already ran for image ${attachment}; do not call identify_image again for it.\n${result}]`
}
