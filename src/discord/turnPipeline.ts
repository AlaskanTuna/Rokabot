import type { DiscordAPIError } from 'discord.js'
import { canAffordAttachments } from '../agent/llm/tokenBudget.js'
import type { ImageAttachment } from '../agent/media/attachments.js'
import { type ReplyOutcome, withReplyOutcomes } from '../agent/replyOutcomes.js'
import { type GenerateResult, generateResponse } from '../agent/roka.js'
import { type SearchCitation, withSearchCitations } from '../agent/searchCitations.js'
import type { SocialPostLookup } from '../agent/social/types.js'
import { config } from '../config.js'
import { type ResponseEventInput, recordResponseEvent } from '../storage/metricsStore.js'
import { logger } from '../utils/logger.js'
import type { CallReservation, RateLimiter } from '../utils/rateLimiter.js'
import { fitAttachmentsToTurn, release, reservationFor, tryReserve } from './byteBudget.js'
import { markFree } from './concurrency.js'
import { isIgnorableDiscordError } from './errorHandler.js'
import { guardMarkdown } from './markdownGuard.js'
import { buildRokaMessage } from './messageBuilder.js'
import {
  getRandomError,
  getRandomOversizedAttachment,
  getRandomPartialAttachment,
  getRandomSkippedAttachments,
  getRandomUnsupportedAttachment,
  splitResponse
} from './responses.js'

export type ModelTurn = GenerateResult & { sources: SearchCitation[]; replyOutcome: ReplyOutcome }

export async function runModelTurn(options: Parameters<typeof generateResponse>[0]): Promise<ModelTurn> {
  const [[result, sources], replyOutcome] = await withReplyOutcomes(() =>
    withSearchCitations(() => generateResponse(options))
  )
  return { ...result, sources, replyOutcome }
}

export function recordTurnEvent(
  event: Pick<ResponseEventInput, 'guildId' | 'channelId' | 'userId' | 'trigger'>,
  turn: ModelTurn,
  handlerStartMs: number
): void {
  const responseEvent: ResponseEventInput = {
    ...event,
    tone: turn.tone,
    toolsUsed: turn.toolsUsed,
    e2eMs: Math.max(1, Math.round(performance.now() - handlerStartMs)),
    ...turn.metrics
  }
  logger.info(responseEvent, 'Response completed')
  recordResponseEvent(responseEvent)
}

export interface TurnDelivery {
  turn: ModelTurn
  socialPostResult: SocialPostLookup
  unsupported: number
  skipped: number
}

export interface DeliveryTransport {
  sendFirst: (payload: ReturnType<typeof buildRokaMessage>) => Promise<unknown>
  /** Undefined when the channel cannot post: the later chunks are then neither built nor sent. */
  sendRest: ((payload: ReturnType<typeof buildRokaMessage>) => Promise<unknown>) | undefined
}

export async function deliverTurn(
  delivery: TurnDelivery,
  channelId: string,
  transport: DeliveryTransport
): Promise<void> {
  const { text: responseText, tone, toolsUsed, sources, replyOutcome, watchOutcome } = delivery.turn
  const { droppedAttachments, truncatedAttachments, refusedAttachments } = delivery.turn
  const { socialPostResult, unsupported, skipped } = delivery
  // She answers the question either way; the nudge only tells them the file was not something she can open.
  // droppedAttachments covers the other way that fails: a type she takes, but bytes she could not — an
  // oversized clip is admitted at intake and refused at the download, and silence there reads as her ignoring it.
  // Two different things to say, and they are not alternatives: a turn can carry one file she could not
  // open and another she could only take the opening of.
  const notes: string[] = []
  if (unsupported > 0 || droppedAttachments > 0) notes.push(getRandomUnsupportedAttachment())
  if (truncatedAttachments > 0) notes.push(getRandomPartialAttachment())
  if (refusedAttachments > 0) notes.push(getRandomOversizedAttachment())
  if (skipped > 0) notes.push(getRandomSkippedAttachments())
  const withNudge = notes.length > 0 ? `${responseText}\n\n${notes.join('\n\n')}` : responseText
  // Escaped before the split, not after: escaping lengthens the text, so doing it downstream would let a
  // chunk sized against the raw length overrun the TextDisplay budget it was measured for.
  const chunks = splitResponse(guardMarkdown(withNudge))
  logger.debug({ channelId, chunkCount: chunks.length }, 'Response split into chunks')
  await transport.sendFirst(
    buildRokaMessage(chunks[0], tone, toolsUsed, sources, socialPostResult, replyOutcome, watchOutcome)
  )
  if (!transport.sendRest) return
  for (let i = 1; i < chunks.length; i++) {
    await transport.sendRest(buildRokaMessage(chunks[i], tone))
  }
}

export async function replyToFailedTurn(
  error: unknown,
  input: { channelId: string; label: string; send: (text: string) => Promise<unknown> }
): Promise<void> {
  const { channelId, label, send } = input
  if (isIgnorableDiscordError(error)) {
    logger.warn({ error, channelId, code: (error as DiscordAPIError).code }, 'Discord API error (ignored)')
    return
  }
  const errDetail = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
  logger.error({ error: errDetail, channelId }, label)
  try {
    await send(getRandomError())
  } catch (replyError) {
    if (isIgnorableDiscordError(replyError)) {
      logger.warn({ error: replyError, channelId }, 'Could not send error reply (ignored)')
    } else {
      logger.error({ error: replyError, channelId }, 'Failed to send error reply')
    }
  }
}

export function releaseTurn(input: {
  channelId: string
  reservedBytes: number
  callReservation: CallReservation | undefined
  modelCallsUsed: number
}): void {
  markFree(input.channelId)
  release(input.reservedBytes)
  input.callReservation?.release(input.modelCallsUsed)
}

export type VanishingReply = (text: string) => Promise<void>

export interface TurnBudget {
  attachments: ImageAttachment[]
  skippedAttachments: number
  callReservation: CallReservation
  reservedBytes: number
}

export function reserveTurnBudget(input: {
  channelId: string
  attachments: ImageAttachment[]
  rateLimiter: RateLimiter
  onDeclined: () => void
}): TurnBudget | undefined {
  const { channelId, rateLimiter, onDeclined } = input
  const { kept, skipped } = fitAttachmentsToTurn(input.attachments)

  // Bytes are not the only thing an attachment spends, and the two do not track each other: an 89-page PDF
  // is 35 KB of the byte budget and 49,841 tokens of the minute's. `rateLimit.rpm` bounds how many turns
  // happen, which bounded spend adequately while every turn cost about the same; it does not bound this.
  // Asked before the reservation below so a declined turn has taken nothing it must hand back.
  if (kept.length > 0 && !canAffordAttachments()) {
    onDeclined()
    logger.debug({ channelId }, 'Per-minute token budget too low for an attachment turn — sending busy message')
    return undefined
  }

  // Slots and bytes are reserved last, so a declined turn has taken nothing it must hand back: the handler
  // never sees a refused reservation, so without the `release(0)` on the byte refusal below a declined turn
  // would keep its slots. Reserving the ceiling rather than one slot is the point: the minute is spent in
  // REQUESTS and a turn issues up to `maxLlmCalls` of them, so admitting on one slot let 15 turns become up
  // to 60 requests (#167).
  const callReservation = rateLimiter.reserveCalls(config.gemini.maxLlmCalls)
  if (!callReservation) {
    onDeclined()
    logger.debug({ channelId, remainingRpm: rateLimiter.remainingRpm }, 'Lost the race for call slots')
    return undefined
  }

  const bytes = reservationFor(kept)
  if (!tryReserve(bytes)) {
    onDeclined()
    // Released here with nothing spent: without this the refused turn would keep its slots and its daily
    // unit, though nothing was sent to the model.
    callReservation.release(0)
    logger.debug({ channelId, reservedBytes: bytes }, 'In-flight attachment budget full — sending busy message')
    return undefined
  }

  return { attachments: kept, skippedAttachments: skipped, callReservation, reservedBytes: bytes }
}
