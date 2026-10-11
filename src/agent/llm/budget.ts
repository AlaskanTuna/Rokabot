/**
 * Per-call budgets in front of every provider call, counted per model.
 *
 * A reply turn already reserves its whole ceiling of requests on the main model's shared limiter, in the Discord
 * layer (#167), and roka.ts charges the turn's tokens, so reply and watcher calls on the main model are not counted
 * again here. Every other call takes its own slot and charges its own model's minute at its estimate, settled to the
 * provider's reported prompt tokens on release. A background call only gets capacity that still leaves one whole
 * reply turn behind it: that is how replies outrank background work without preempting anything already in flight.
 */

import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { __resetRateLimitersForTest, rateLimiterFor } from '../../utils/rateLimiter.js'
import { estimateTokens } from '../../utils/tokens.js'
import { __resetTokenBudgetForTest, tokenBucketFor } from '../tokenBudget.js'
import type { ProviderId } from './profiles.js'
import { ProviderError } from './providerError.js'
import type { CallUsage, Workload } from './usage.js'

export interface CallReservation {
  release(usage?: CallUsage): void
}

export type BudgetReservation = CallReservation

export interface BudgetDenial {
  denied: 'rpm' | 'rpd' | 'tpm' | 'monthly'
}

export interface CallInput {
  provider: ProviderId
  model: string
  workload: Workload
  estTokens: number
}

const REPLY_SIDE: ReadonlySet<Workload> = new Set<Workload>(['reply', 'watcher'])

function routeLimits(provider: ProviderId, model: string) {
  const route = [config.llm.main, config.llm.fallback].find(
    (entry) => entry?.provider === provider && entry.model === model
  )
  return route?.limits
}

/** Reserve one provider call, or name the budget that refused it. Adapters call `startCall`, which wraps this. */
export function reserveCall(input: CallInput): CallReservation | BudgetDenial {
  // The legacy config keeps exactly the accounting it had before per-call budgets: the Discord turn guard, the retry
  // gate and roka's per-turn token charge. Counting its calls here as well would hand the Pi's reply slots to
  // background work and cap a fallback that has never been capped.
  if (config.llm.main.key === 'legacy-gemini') return { release: () => {} }

  const { provider, model, workload, estTokens } = input
  const replySide = REPLY_SIDE.has(workload)
  const main = config.llm.main
  // The Discord layer reserved this turn's whole ceiling on the main model's limiter (#167) and roka.ts charges its
  // tokens once; counting each of its calls here as well would charge every reply twice.
  const coveredByTurn = replySide && main.provider === provider && main.model === model
  // A background call leaves one whole reply turn behind it, so the next reply is admitted rather than declined.
  const headroom = replySide ? 0 : config.gemini.maxLlmCalls
  const limits = routeLimits(provider, model)
  const limiter = rateLimiterFor({ provider, model, limits })
  const tokens = coveredByTurn ? null : tokenBucketFor({ provider, model, limits })

  let denied: BudgetDenial['denied'] | null = null
  if (!coveredByTurn && limiter.remainingRpd < 1 + headroom) denied = 'rpd'
  else if (!coveredByTurn && limiter.remainingRpm < 1 + headroom) denied = 'rpm'
  // Text replies are never refused on tokens: `rpm` bounds them, and attachment turns were gated before they began.
  else if (!replySide && tokens && tokens.remaining() < estTokens + config.gemini.maxAttachmentTokens) denied = 'tpm'
  if (denied) {
    logger.info({ provider, model, workload, denied }, 'Budget declined a model call')
    return { denied }
  }

  if (!coveredByTurn) limiter.tryConsume()
  tokens?.charge(estTokens)

  let settled = false
  return {
    release: (usage) => {
      if (settled) return
      settled = true
      if (!usage || !tokens) return
      tokens.refund(estTokens)
      tokens.charge(usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0))
    }
  }
}

/** Every adapter awaits this before each provider request; 1D gives it a body that can wait for a window to open. */
export async function startCall(input: CallInput & { signal?: AbortSignal }): Promise<CallReservation> {
  return grantOrThrow(input.provider, reserveCall(input))
}

/** Adapters call this when they classify a provider's own billing error as `billing_exhausted`; 1D gives it a body. */
export function markBillingExhausted(_provider: ProviderId): void {}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()
}

export function grantOrThrow(provider: ProviderId, reservation: CallReservation | BudgetDenial): CallReservation {
  if (!('denied' in reservation)) return reservation
  const message = `${provider} call denied by the local ${reservation.denied} budget`
  if (reservation.denied === 'monthly') throw new ProviderError({ provider, kind: 'billing_exhausted', message })
  throw new ProviderError({
    provider,
    kind: 'quota_exhausted',
    message,
    retryAfterMs: reservation.denied === 'rpd' ? msUntilNextUtcMidnight() : 60_000
  })
}

/** Inline media is left out: its base64 length says nothing about what an image or PDF costs in tokens. */
export function requestTokenEstimate(value: unknown): number {
  return estimateTokens(JSON.stringify(value, (key, child) => (key === 'data' ? undefined : child)) ?? '')
}

/** Test seam: every budget is module state, and one test's spent minute would refuse the next test's calls. */
export function __resetBudgetsForTest(): void {
  __resetRateLimitersForTest()
  __resetTokenBudgetForTest()
}
