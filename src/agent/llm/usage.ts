import type { LlmRequest } from '@google/adk'
import type { ProviderId } from './profiles.js'

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
