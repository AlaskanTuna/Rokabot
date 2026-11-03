import type { LlmRequest, LlmResponse } from '@google/adk'
import { type ModelProfile, type ProviderId, profileFor } from './profiles.js'

export type Workload =
  | 'reply'
  | 'extraction'
  | 'reclassify'
  | 'admission'
  | 'verification'
  | 'embedding'
  | 'watcher'
  | 'search'

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
  /** The provider's own web searches this call billed, each at its profile's `nativeSearch.usdPerSearch`. */
  searchRequests?: number
}

/** Every input token the call was billed for, cached or not: what a single prompt-size figure means. */
export function promptTokenTotal(usage: CallUsage): number {
  return usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
}

export function usageFromCachedPrompt(input: {
  provider: CallUsage['provider']
  model: string
  workload: Workload
  promptTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
}): CallUsage {
  return {
    provider: input.provider,
    model: input.model,
    workload: input.workload,
    inputTokens: Math.max(0, input.promptTokens - input.cachedTokens),
    outputTokens: input.outputTokens,
    ...(input.reasoningTokens > 0 ? { reasoningTokens: input.reasoningTokens } : {}),
    ...(input.cachedTokens > 0 ? { cacheReadTokens: input.cachedTokens } : {})
  }
}

/** Gemini's own usage metadata as a `CallUsage`. `usageMetadata` is absent on a response with nothing to bill. */
export function geminiUsage(
  model: string,
  workload: Workload,
  metadata: NonNullable<LlmResponse['usageMetadata']>
): CallUsage {
  return usageFromCachedPrompt({
    provider: 'gemini',
    model,
    workload,
    promptTokens: metadata.promptTokenCount ?? 0,
    cachedTokens: metadata.cachedContentTokenCount ?? 0,
    outputTokens: metadata.candidatesTokenCount ?? 0,
    reasoningTokens: metadata.thoughtsTokenCount ?? 0
  })
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
  'watcher',
  'search'
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
 * Estimated USD for one call, from its profile's prices per million tokens, plus a flat fee per web search the
 * provider itself ran. The usage buckets are disjoint: `inputTokens` excludes cache reads and writes, and
 * `outputTokens` excludes `reasoningTokens`, which bill as output. The provider's bill stays the source of truth.
 * `price` defaults to the tested profile's; the search fee is read from the profile either way.
 */
export function estimateCostUsd(
  usage: CallUsage,
  price: ModelProfile['price'] | undefined = profileFor(usage.provider, usage.model)?.price
): number {
  const searches =
    (usage.searchRequests ?? 0) * (profileFor(usage.provider, usage.model)?.nativeSearch?.usdPerSearch ?? 0)
  if (!price) return searches
  const cacheRead = (usage.cacheReadTokens ?? 0) * (price.cachedInput ?? price.input)
  const cacheWrite = (usage.cacheWriteTokens ?? 0) * (price.cacheWrite ?? price.input * CACHE_WRITE_PRICE_MULTIPLIER)
  const output = (usage.outputTokens + (usage.reasoningTokens ?? 0)) * price.output
  return searches + (usage.inputTokens * price.input + cacheRead + cacheWrite + output) / 1_000_000
}
