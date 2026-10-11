import { config } from '../config.js'
import { logger } from '../utils/logger.js'

/**
 * Tokens spent per rolling minute, which is the quota the request limiter does not measure.
 *
 * `rateLimit.rpm` bounds how many turns happen, and that bounded spend adequately while every turn cost about the
 * same — a text turn is ~5,600 tokens, so 15 of them is 34% of the measured 250,000 TPM. Attachments end that: one
 * turn may now carry `gemini.maxAttachmentTokens`, and 15 of those is over three times the minute's budget. Neither
 * existing guard catches it. `byteBudget` meters bytes, and the whole finding of #136 is that bytes do not bound
 * tokens — an 89-page PDF measures 49,841 tokens in 35 KB, passing the per-turn ceiling and reserving 0.1% of the
 * byte budget while fifteen of them would spend 333% of the minute.
 *
 * One bucket per model rather than per channel: TPM is the provider's quota on the model, so overspending lands on
 * every other channel rather than on the sender. It was Gemini-only until #296.
 */
export class TokenBucket {
  private spent = 0
  private lastDrain = Date.now()

  constructor(private readonly perMinute: number) {}

  /** Tokens drain continuously rather than resetting on a boundary, mirroring the RPM bucket's refill. */
  private drain(): void {
    const now = Date.now()
    const elapsed = now - this.lastDrain
    if (elapsed <= 0) return

    this.spent = Math.max(0, this.spent - (elapsed * this.perMinute) / 60_000)
    this.lastDrain = now
  }

  /** Tokens still available in the rolling minute. */
  remaining(): number {
    this.drain()
    return Math.max(0, this.perMinute - this.spent)
  }

  /**
   * Record tokens sent. Always charged and never refused: a call that has reached this point has been admitted, and
   * declining to account for it would leave the budget describing something other than what was spent.
   */
  charge(tokens: number): void {
    this.drain()
    this.spent += Math.max(0, tokens)
  }

  /** Hand back an estimate once the provider has said what the call really cost. */
  refund(tokens: number): void {
    this.drain()
    this.spent = Math.max(0, this.spent - Math.max(0, tokens))
  }
}

const buckets = new Map<string, TokenBucket>()

/** The model's bucket, made on first use, or null when its entry sets no `tpm` and nothing is metered. */
export function tokenBucketFor(model: {
  provider: string
  model: string
  limits?: { tpm?: number }
}): TokenBucket | null {
  const perMinute = model.limits?.tpm
  if (perMinute === undefined) return null
  const key = `${model.provider}/${model.model}`
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = new TokenBucket(perMinute)
    buckets.set(key, bucket)
  }
  return bucket
}

/** Tokens still available in the main model's rolling minute; unlimited when its entry sets no `tpm`. */
export function remainingTokensThisMinute(): number {
  return tokenBucketFor(config.llm.main)?.remaining() ?? Number.POSITIVE_INFINITY
}

/**
 * The turn's own charge on the main model's minute, made once by roka.ts after the reliability ladder. Per-call
 * charges for the calls a turn does not cover live in `src/agent/llm/budget.ts`.
 *
 * Always charged and never refused: a turn that has reached this point has been admitted, and declining to account
 * for it would leave the budget describing something other than what was spent. Admission is a separate decision,
 * taken before the turn by `canAffordAttachments`.
 */
export function chargeTokens(tokens: number): void {
  tokenBucketFor(config.llm.main)?.charge(tokens)
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

/** Test seam: buckets are module state, and a leaked balance would make later tests refuse for no reason. */
export function __resetTokenBudgetForTest(): void {
  buckets.clear()
}
