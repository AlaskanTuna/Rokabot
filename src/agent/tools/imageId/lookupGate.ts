/** The vision gate behind image lookups: Roka's own route judges the speaker text and the images. */

import { z } from 'zod'
import { config } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import { generateObject } from '../../llm/generateObject.js'
import { processImageForGemini } from '../../media/imageProcessor.js'
import type { TurnImage } from '../../media/turnImages.js'

export const GATE_PROMPT = `Screen a Discord turn before a reverse-image search. Images are numbered in order. Reply JSON only: {"asks": boolean, "target": number, "subject": string}.
asks: true only if the text asks who or what something pictured is, what it is from (anime, game, show, brand, shop), where it is, when it came out, or how to make, play or solve it, in any language or slang ("wat dis", "siapa ni", "ni apa", "这是什么", "これ誰"), or doubts an earlier answer about it ("u sure?", "same person?"). False when it only reacts or shares, asks Roka's opinion, or asks about something not in the images.
target: "2nd"/"kedua"/"第二" picks 2, "left" 1, "right" 2, "last" the last; else the first image that fits.
subject of target: character_art | figure_or_merch | product | place | food | game_screen | real_person (any real human photo: selfie, group, cosplay, celebrity) | text_or_chat | chart | meme | other`

const SUBJECTS = [
  'character_art',
  'figure_or_merch',
  'product',
  'place',
  'food',
  'game_screen',
  'real_person',
  'text_or_chat',
  'chart',
  'meme',
  'other'
] as const

export type GateSubject = (typeof SUBJECTS)[number]

const gateSchema = z.object({ asks: z.boolean(), target: z.number().int(), subject: z.enum(SUBJECTS) })

export type GateVerdict = z.infer<typeof gateSchema>

export interface GateJudgeOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type GateJudge = (text: string, images: TurnImage[], options?: GateJudgeOptions) => Promise<GateVerdict | null>

/** Subjects a reverse-image search can name, so the lookup fires only on these. */
export const FIREABLE_SUBJECTS: ReadonlySet<GateSubject> = new Set([
  'character_art',
  'figure_or_merch',
  'product',
  'place',
  'food',
  'game_screen'
])

async function fetchGateImage(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<{ mimeType: string; data: Buffer } | null> {
  const response = await fetchImpl(url, { signal })
  if (!response.ok) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  return processImageForGemini(buffer, contentType)
}

/**
 * Asks Roka's own route (main model, falling back exactly as it does today) whether the turn asks
 * about something pictured. Any error, timeout or invalid output returns null, which never fires.
 */
export async function judgeImageLookup(
  text: string,
  images: TurnImage[],
  options: GateJudgeOptions = {}
): Promise<GateVerdict | null> {
  const timeoutMs = options.timeoutMs ?? config.imageId.gateTimeoutMs
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // Resolves null when the gate outlives its budget, even if the model call ignores the abort.
  const onTimeout = new Promise<null>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(null), { once: true })
  })
  try {
    const gateImages = (
      await Promise.all(
        images.map((image) => fetchGateImage(image.url, fetchImpl, controller.signal).catch(() => null))
      )
    ).filter((image): image is { mimeType: string; data: Buffer } => image !== null)
    if (gateImages.length === 0) return null
    const pending = generateObject({
      schema: gateSchema,
      prompt: `${GATE_PROMPT}\n\nText: ${text}`,
      workload: 'imageGate',
      maxOutputTokens: 200,
      images: gateImages,
      signal: controller.signal
    })
    // A hung model call must not hang the turn: on timeout the race below wins and the late reply is dropped.
    pending.then(
      () => undefined,
      () => undefined
    )
    const outcome = await Promise.race([pending, onTimeout])
    if (outcome === null) return null
    return outcome.value
  } catch (error) {
    logger.warn(
      {
        workload: 'imageGate',
        errorName: (Object(error) as { constructor?: { name?: string } }).constructor?.name ?? 'Error'
      },
      'Image lookup gate failed'
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}
