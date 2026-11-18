/** Runs identify_image before Roka answers when a turn shows an image and asks who or what it is. */

import { logger } from '../../../utils/logger.js'
import { identifyImage, identifyImageAvailable } from './identifyImage.js'

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
 * The automatic lookup for the turn's first image, as a note for Roka's message, or null when the turn does not
 * ask or the tool is unavailable. Runs inside the turn's image, source and budget scopes, like the tool itself.
 */
export async function autoIdentifyNote(message: string, imageCount: number): Promise<string | null> {
  if (!identifyImageAvailable() || !asksWhoIsPictured(message, imageCount)) return null
  const result = await identifyImage({ attachment: 1 })
  logger.info({ imageCount }, 'Identified the first image before the reply')
  return `[A reverse-image lookup already ran for image 1; do not call identify_image again for it.\n${result}]`
}
