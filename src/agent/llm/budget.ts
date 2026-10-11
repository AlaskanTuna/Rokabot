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
import { addSpend, monthKey, readSpend } from '../../storage/spendStore.js'
import { logger } from '../../utils/logger.js'
import { __resetRateLimitersForTest, rateLimiterFor } from '../../utils/rateLimiter.js'
import { estimateTokens } from '../../utils/tokens.js'
import { __resetTokenBudgetForTest, tokenBucketFor } from '../tokenBudget.js'
import type { ProviderId } from './profiles.js'
import { ProviderError } from './providerError.js'
import { type CallUsage, type Workload, estimateCostUsd, onUsage } from './usage.js'

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

// Per-model Magicube tiers are shown only to a logged-in account, so every call is counted at the standard tier.
const MAGICUBES_PER_CALL = 1

// ModelScope guarantees one concurrent request per account and promises nothing past it.
const CONCURRENCY: Partial<Record<ProviderId, number>> = { modelscope: 1 }

let magicubes = { day: '', used: 0 }
const inFlight = new Map<ProviderId, number>()
const waiting = new Map<ProviderId, Array<{ reply: boolean; grant: () => void }>>()
const spendCache = new Map<ProviderId, { month: string; usd: number }>()
const billingExhaustedIn = new Map<ProviderId, string>()

/** A failed read caches nothing, so the next call reads the database again; a spend estimate never fails a call. */
function spentThisMonth(provider: ProviderId, month: string): number {
  const cached = spendCache.get(provider)
  if (cached?.month === month) return cached.usd
  try {
    const usd = readSpend(month, provider)
    spendCache.set(provider, { month, usd })
    return usd
  } catch (error) {
    logger.warn({ err: error, provider, month }, 'Failed to read LLM spend; treating the month as unspent')
    return 0
  }
}

/** Whether `provider` may take no more calls this month: its local cap is spent, or it reported its credit gone. */
export function isMonthlyExhausted(provider: ProviderId): boolean {
  const month = monthKey()
  if (billingExhaustedIn.get(provider) === month) return true
  const cap = config.llm.monthlyBudgetUsd[provider]
  return cap !== undefined && spentThisMonth(provider, month) >= cap
}

function recordSpend(usage: CallUsage): void {
  const usd = estimateCostUsd(usage)
  if (usd <= 0) return
  const month = monthKey()
  const cap = config.llm.monthlyBudgetUsd[usage.provider]
  if (cap === undefined) {
    addSpend(month, usage.provider, usd)
    return
  }
  const before = spentThisMonth(usage.provider, month)
  if (spendCache.get(usage.provider)?.month === month) spendCache.set(usage.provider, { month, usd: before + usd })
  addSpend(month, usage.provider, usd)
  if (before < cap && before + usd >= cap) {
    logger.warn({ provider: usage.provider, cap }, 'Monthly budget reached; route disabled until the month resets')
  }
}

onUsage(recordSpend)

/**
 * The legacy config keeps exactly the accounting it had before per-call budgets: the Discord turn guard, the retry
 * gate and roka's per-turn token charge. Counting its calls here as well would hand the Pi's reply slots to background
 * work, and serialising or capping ModelScope would change a fallback and a qwen watcher that never waited or stopped.
 */
function legacyAccounting(): boolean {
  return config.llm.main.key === 'legacy-gemini'
}

/** Magicubes left in the shared ModelScope estimate; it resets with the UTC day, like the request limiter's. */
function magicubesLeft(): number {
  const day = new Date().toISOString().slice(0, 10)
  if (magicubes.day !== day) magicubes = { day, used: 0 }
  return config.llm.modelscopeDailyMagicubes - magicubes.used
}

/**
 * Waits for one of the provider's in-flight slots. A refusal here would surface as quota exhaustion on a healthy
 * provider and open a sticky window, so the call waits instead, for as long as its own signal allows. Replies wait
 * behind replies already waiting and ahead of every background call.
 */
function acquireSlot(provider: ProviderId, reply: boolean, signal?: AbortSignal): Promise<() => void> {
  const limit = CONCURRENCY[provider]
  if (limit === undefined) return Promise.resolve(() => {})
  signal?.throwIfAborted()

  let held = true
  const leave = () => {
    if (!held) return
    held = false
    inFlight.set(provider, (inFlight.get(provider) ?? 1) - 1)
    waiting.get(provider)?.shift()?.grant()
  }
  const queue = waiting.get(provider) ?? []
  waiting.set(provider, queue)
  if ((inFlight.get(provider) ?? 0) < limit && queue.length === 0) {
    inFlight.set(provider, (inFlight.get(provider) ?? 0) + 1)
    return Promise.resolve(leave)
  }

  return new Promise((resolve, reject) => {
    const waiter = { reply, grant: () => {} }
    const onAbort = () => {
      queue.splice(queue.indexOf(waiter), 1)
      reject(signal?.reason)
    }
    waiter.grant = () => {
      signal?.removeEventListener('abort', onAbort)
      inFlight.set(provider, (inFlight.get(provider) ?? 0) + 1)
      resolve(leave)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const firstBackground = reply ? queue.findIndex((entry) => !entry.reply) : -1
    if (firstBackground === -1) queue.push(waiter)
    else queue.splice(firstBackground, 0, waiter)
  })
}

function routeLimits(provider: ProviderId, model: string) {
  const route = [config.llm.main, config.llm.fallback].find(
    (entry) => entry?.provider === provider && entry.model === model
  )
  return route?.limits
}

/** Reserve one provider call, or name the budget that refused it. Adapters call `startCall`, which wraps this. */
export function reserveCall(input: CallInput): CallReservation | BudgetDenial {
  if (legacyAccounting()) return { release: () => {} }

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
  if (isMonthlyExhausted(provider)) denied = 'monthly'
  else if (!coveredByTurn && limiter.remainingRpd < 1 + headroom) denied = 'rpd'
  else if (!coveredByTurn && limiter.remainingRpm < 1 + headroom) denied = 'rpm'
  // Text replies are never refused on tokens: `rpm` bounds them, and attachment turns were gated before they began.
  else if (!replySide && tokens && tokens.remaining() < estTokens + config.gemini.maxAttachmentTokens) denied = 'tpm'
  else if (provider === 'modelscope' && magicubesLeft() < MAGICUBES_PER_CALL * (1 + headroom)) denied = 'rpd'
  if (denied) {
    logger.info({ provider, model, workload, denied }, 'Budget declined a model call')
    return { denied }
  }

  if (!coveredByTurn) limiter.tryConsume()
  tokens?.charge(estTokens)
  if (provider === 'modelscope') magicubes.used += MAGICUBES_PER_CALL

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

/** Wait for the provider's slot, then reserve the call; a refusal throws the ProviderError the router acts on. */
export async function startCall(input: CallInput & { signal?: AbortSignal }): Promise<CallReservation> {
  if (legacyAccounting()) return grantOrThrow(input.provider, reserveCall(input))
  const leave = await acquireSlot(input.provider, REPLY_SIDE.has(input.workload), input.signal)
  let reservation: CallReservation
  try {
    // The slot can be granted after the caller gave up; refusing here hands it on without spending a Magicube.
    input.signal?.throwIfAborted()
    reservation = grantOrThrow(input.provider, reserveCall(input))
  } catch (error) {
    leave()
    throw error
  }
  return {
    release: (usage) => {
      leave()
      reservation.release(usage)
    }
  }
}

/**
 * For an adapter that classified the provider's own billing error. Held in memory until the month turns, so a restart
 * after topping up the account is how the owner re-enables the route early.
 */
export function markBillingExhausted(provider: ProviderId): void {
  billingExhaustedIn.set(provider, monthKey())
  logger.warn({ provider }, 'Provider reported its credit spent; route disabled until the month resets')
}

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
  magicubes = { day: '', used: 0 }
  inFlight.clear()
  waiting.clear()
  spendCache.clear()
  billingExhaustedIn.clear()
}
