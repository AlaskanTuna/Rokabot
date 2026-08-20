import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * A project-wide account of tokens spent per minute, which is the quota the request limiter does not measure.
 *
 * `rateLimit.rpm` bounds how many turns happen, and that bounded spend adequately while every turn cost about
 * the same — a text turn is ~5,600 tokens, so 15 of them is 34% of the measured 250,000 TPM. Attachments end
 * that: one turn may now carry `gemini.maxAttachmentTokens`, and 15 of those is over three times the minute's
 * budget. Neither existing guard catches it. `byteBudget` meters bytes, and the whole finding of #136 is that
 * bytes do not bound tokens — an 89-page PDF measures 49,841 tokens in 35 KB, passing the per-turn ceiling
 * and reserving 0.1% of the byte budget while fifteen of them would spend 333% of the minute.
 *
 * Global rather than per-channel on purpose: TPM is a project quota, so the harm from overspending lands on
 * every other channel rather than on the sender.
 */
let spent = 0
let lastDrain = Date.now()

/** Tokens drain continuously rather than resetting on a boundary, mirroring the RPM bucket's refill. */
function drain(): void {
  const now = Date.now()
  const elapsed = now - lastDrain
  if (elapsed <= 0) return

  spent = Math.max(0, spent - (elapsed * config.gemini.maxTokensPerMinute) / 60_000)
  lastDrain = now
}

/** Tokens still available in the rolling minute. */
export function remainingTokensThisMinute(): number {
  drain()
  return Math.max(0, config.gemini.maxTokensPerMinute - spent)
}

/**
 * Record tokens actually sent. Always charged and never refused: a turn that has reached this point has been
 * admitted, and declining to account for it would leave the budget describing something other than what was
 * spent. Admission is a separate decision, taken before the turn by `canAffordAttachments`.
 */
export function chargeTokens(tokens: number): void {
  drain()
  spent += Math.max(0, tokens)
}

/**
 * Whether a turn carrying attachments should be admitted, judged against the most one could cost rather than
 * against what this one will.
 *
 * The exact cost is only knowable after the file has been downloaded and measured, which is far too late to
 * decline politely — so this asks the answerable question instead: is there room for the worst turn the
 * per-turn ceiling admits? Text turns are never gated, because `rpm` already bounds them to about a third of
 * the budget; the config bounds pin that relationship so it cannot quietly stop being true.
 */
export function canAffordAttachments(): boolean {
  const remaining = remainingTokensThisMinute()
  const needed = config.gemini.maxAttachmentTokens

  if (remaining < needed) {
    logger.info(
      { remaining: Math.round(remaining), needed },
      'Not enough of this minute token budget for an attachment turn'
    )
    return false
  }
  return true
}

/** Test seam: the account is module state, and a leaked balance would make later tests refuse for no reason. */
export function __resetTokenBudgetForTest(): void {
  spent = 0
  lastDrain = Date.now()
}
