/** Runs identify_image before Roka answers when a turn shows an image and asks who or what it is. */

import { config } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import { turnImages } from '../../media/turnImages.js'
import type { TurnImage } from '../../media/turnImages.js'
import { identifyImage, identifyImageAvailable } from './identifyImage.js'
import { lensAllowed } from './lensLedger.js'
import { FIREABLE_SUBJECTS, type GateJudge, type GateVerdict, judgeImageLookup } from './lookupGate.js'

/** Footer key for a lookup the turn ran on its own, so the reply says it was automatic. */
export const AUTO_IDENTIFY_TOOL_NAME = 'identify_image_auto'

// Speaker's own text only, with Roka's name and mentions stripped.
export const ASKS =
  /\b(?:who|whos|whose|what|whats|wat|wut|wtf|which|where|when|why|how|identify|sauce|source)\b|\b(?:siapa|apa|mana|bila|kenapa|knp|camne|cmne|ma?ca?m mana)\b|谁|什么|啥|哪|为什么|怎么|誰|だれ|何|なに|どこ|いつ|なんで|どう/i
export const FOLLOW_UP =
  /\b(?:u|you|r ?you) sure\b|\blook again\b|\bsame (?:person|one|girl|guy|char\w*)\b|\b(?:and )?this one\b/i
export const SKIP = /<@!?\d+>|\bselfie\b|\bpfp\b/i

/** Whether the text alone could want a lookup: an eligible image is present, nothing rules it out, and it asks. */
export function prefilter(text: string, eligibleImageCount: number): boolean {
  if (eligibleImageCount <= 0 || SKIP.test(text)) return false
  // The bot's own mention is already replaced in speaker text; anything still shaped like a mention names
  // someone else, and SKIP above has ruled it out, so stripping mentions here changes nothing.
  const stripped = text.replace(/\broka\b/gi, '').replace(/<@!?\d+>/g, '')
  return ASKS.test(stripped) || FOLLOW_UP.test(stripped)
}

/** The turn's images a lookup may fire on: everything but a link preview, with its 1-based turn index. */
export function eligibleImages(): Array<TurnImage & { turnIndex: number }> {
  return turnImages()
    .map((image, index) => ({ ...image, turnIndex: index + 1 }))
    .filter((image) => image.origin !== 'link_preview')
}

export interface ImageLookupPlan {
  /** The 1-based turn image index to look up. */
  attachment: number
  /** The gate's verdict, or null when the gate mode skipped it. */
  verdict: GateVerdict | null
}

/**
 * The automatic lookup plan for the turn: prefilter, then the vision gate. Never rejects: any error,
 * timeout or invalid gate output means no lookup. Tests inject the gate; production uses Roka's own route.
 */
export async function planImageLookup(
  text: string,
  judge: GateJudge = judgeImageLookup,
  fetchImpl: typeof fetch = globalThis.fetch,
  mode: string = config.imageId.gate
): Promise<ImageLookupPlan | null> {
  try {
    if (!identifyImageAvailable() || !lensAllowed('auto')) return null
    const eligible = eligibleImages()
    if (!prefilter(text, eligible.length)) return null
    if (mode === 'off') {
      const plan = { attachment: eligible[0].turnIndex, verdict: null }
      logger.info({ ...plan, mode }, 'Planned image lookup')
      return plan
    }
    let verdict: GateVerdict | null = null
    try {
      verdict = await judge(text, eligible, { fetchImpl })
    } catch (error) {
      logger.warn(
        {
          errorName: (Object(error) as { constructor?: { name?: string } }).constructor?.name ?? 'Error'
        },
        'Image lookup gate threw'
      )
      verdict = null
    }
    if (mode === 'shadow') {
      const plan = { attachment: eligible[0].turnIndex, verdict }
      logger.info(
        { ...plan, asks: verdict?.asks ?? null, subject: verdict?.subject ?? null, mode },
        'Planned image lookup'
      )
      return plan
    }
    if (verdict === null || !verdict.asks || !FIREABLE_SUBJECTS.has(verdict.subject)) return null
    const clamped = Math.min(Math.max(1, verdict.target), eligible.length)
    const plan = { attachment: eligible[clamped - 1].turnIndex, verdict }
    logger.info(
      { ...plan, asks: verdict.asks, subject: verdict.subject, target: verdict.target, mode },
      'Planned image lookup'
    )
    return plan
  } catch {
    return null
  }
}

/** Runs the Lens lookup a plan chose, as a note for Roka's message, or null when the plan is missing. */
export async function noteForPlan(
  plan: ImageLookupPlan | null,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string | null> {
  if (!plan) return null
  const result = await identifyImage({ attachment: plan.attachment }, fetchImpl, 'auto')
  logger.info({ attachment: plan.attachment }, 'Identified an image before the reply')
  return `[A reverse-image lookup already ran for image ${plan.attachment}; do not call identify_image again for it.\n${result}]`
}

/**
 * The automatic lookup for the turn's first identifying image, as a note for Roka's message, or null when
 * the turn does not ask or the tool is unavailable. Tests only the speaker's own text — the caller strips
 * the reply quote, embed descriptions, forwarded text and container text before calling. Runs inside the
 * turn's image, source and budget scopes, like the tool itself.
 */
export async function autoIdentifyNote(
  message: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  judge: GateJudge = judgeImageLookup,
  mode: string = config.imageId.gate
): Promise<string | null> {
  return noteForPlan(await planImageLookup(message, judge, fetchImpl, mode), fetchImpl)
}
