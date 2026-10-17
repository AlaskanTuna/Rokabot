import type { LlmRequest } from '@google/adk'
import { type ModelProfile, type ProviderId, profileFor } from './profiles.js'

export type Workload = 'reply' | 'extraction' | 'reclassify' | 'admission' | 'verification' | 'embedding' | 'watcher'

/** The token buckets are disjoint, so a cost is the sum of each bucket times its own rate. */
export interface CallUsage {
  provider: ProviderId
  model: string
  workload: Workload
  /** Uncached input tokens; cache reads and writes are counted on their own. */
  inputTokens: number
  /** Excludes `reasoningTokens` when the provider reports reasoning separately; otherwise the billed output. */
  outputTokens: number
  /** Omitted when a provider reports no reasoning split (Anthropic): `outputTokens` is then the billed output. */
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Every input token the call was billed for, cached or not: what a single prompt-size figure means. */
export function promptTokenTotal(usage: CallUsage): number {
  return usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
}

/** Background jobs put their workload in `config.labels` under this key; ADK reply requests carry none. */
export const WORKLOAD_LABEL = 'rokabot_workload'

const WORKLOADS: readonly Workload[] = [
  'reply',
  'extraction',
  'reclassify',
  'admission',
  'verification',
  'embedding',
  'watcher'
]
const listeners = new Set<(usage: CallUsage) => void>()

export function recordUsage(usage: CallUsage): void {
  for (const listener of listeners) {
    try {
      listener(usage)
    } catch {
      // A listener's failure must never fail the model call it observes.
    }
  }
}

export function onUsage(listener: (usage: CallUsage) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function workloadOf(llmRequest: LlmRequest): Workload {
  const label = llmRequest.config?.labels?.[WORKLOAD_LABEL]
  return WORKLOADS.find((workload) => workload === label) ?? 'reply'
}

// A profile without its own `price.cacheWrite` bills a cache write at 1.25x input, Anthropic's 5-minute cache-write rate.
const CACHE_WRITE_PRICE_MULTIPLIER = 1.25

/**
 * Estimated USD for one call, from its profile's prices per million tokens. The usage buckets are disjoint:
 * `inputTokens` excludes cache reads and writes, and `outputTokens` excludes `reasoningTokens`, which bill as output.
 * The provider's bill stays the source of truth. `price` defaults to the tested profile's.
 */
export function estimateCostUsd(
  usage: CallUsage,
  price: ModelProfile['price'] | undefined = profileFor(usage.provider, usage.model)?.price
): number {
  if (!price) return 0
  const cacheRead = (usage.cacheReadTokens ?? 0) * (price.cachedInput ?? price.input)
  const cacheWrite = (usage.cacheWriteTokens ?? 0) * (price.cacheWrite ?? price.input * CACHE_WRITE_PRICE_MULTIPLIER)
  const output = (usage.outputTokens + (usage.reasoningTokens ?? 0)) * price.output
  return (usage.inputTokens * price.input + cacheRead + cacheWrite + output) / 1_000_000
}
