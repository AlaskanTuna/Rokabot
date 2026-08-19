import { sizeLimitFor } from '../agent/attachmentLimits.js'
import type { ImageAttachment } from '../agent/roka.js'
import { config } from '../config.js'

/**
 * Global ceiling on attachment bytes in flight across every channel at once.
 *
 * The per-channel guard in concurrency.ts bounds how many turns one channel runs, not how many run in total,
 * so K busy channels means K simultaneous downloads. Each attachment costs ~4.7x its own size in RSS — the
 * arrayBuffer, the Buffer copy, the base64 string and the JSON body all coexist — and two of those multiples
 * are Buffers, which live outside the V8 heap and so never raise a catchable heap error. The container is
 * simply SIGKILLed. This is the admission control that stops that, and it reserves BEFORE downloading, since
 * a check after the bytes have landed is a measurement, not a guard. See docs/multimodal.md.
 */
let inFlight = 0

/**
 * What a turn must reserve before it starts downloading. Discord states an upload's size up front, so the
 * common path reserves what will actually arrive; an embed image or a link resolved by HEAD does not state
 * one, and reserves its type's ceiling instead — an unknown has to cost the most it could, or the budget
 * bounds nothing. A stated size above that ceiling is clamped to it, because the download refuses on
 * Content-Length before buffering, so the oversized bytes are never actually held.
 */
export function reservationFor(attachments: ImageAttachment[]): number {
  return attachments.reduce((total, attachment) => {
    const ceiling = sizeLimitFor(attachment.contentType)
    return total + Math.min(attachment.size ?? ceiling, ceiling)
  }, 0)
}

/** Take `bytes` from the budget, or refuse the turn outright. Reserving nothing always succeeds. */
export function tryReserve(bytes: number): boolean {
  if (inFlight + bytes > config.discord.maxInFlightAttachmentBytes) return false
  inFlight += bytes
  return true
}

/**
 * Hand `bytes` back. Clamped at zero because a stray extra release would otherwise leave the counter
 * negative permanently, which admits every subsequent turn regardless of size — the guard failing open and
 * staying there, rather than for one turn.
 */
export function release(bytes: number): void {
  inFlight = Math.max(0, inFlight - bytes)
}

/** Bytes currently reserved. Exists so a test can assert the budget returns to zero after a failing turn. */
export function inFlightBytes(): number {
  return inFlight
}
