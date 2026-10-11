import { Gemini } from '@google/adk'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { config } from '../../config.js'
import type { ResolvedModel } from '../../config.js'
import { ModelScopeLlm, RoutedLlm } from '../fallbackModel.js'
import { AnthropicLlm } from './anthropicLlm.js'
import { requestTokenEstimate, startCall } from './budget.js'
import { shapeRequest } from './requestShape.js'
import { type CallUsage, type Workload, recordUsage, workloadOf } from './usage.js'

function geminiUsage(
  model: string,
  workload: Workload,
  metadata: NonNullable<LlmResponse['usageMetadata']>
): CallUsage {
  const cached = metadata.cachedContentTokenCount ?? 0
  return {
    provider: 'gemini',
    model,
    workload,
    inputTokens: Math.max(0, (metadata.promptTokenCount ?? 0) - cached),
    outputTokens: metadata.candidatesTokenCount ?? 0,
    ...(metadata.thoughtsTokenCount ? { reasoningTokens: metadata.thoughtsTokenCount } : {}),
    ...(cached ? { cacheReadTokens: cached } : {})
  }
}

/** ADK's Gemini with request shaping, a budget reservation and usage recording around each call. */
class GeminiLlm extends Gemini {
  constructor(private readonly resolved: ResolvedModel) {
    super({ model: resolved.model })
  }

  override async *generateContentAsync(
    llmRequest: LlmRequest,
    stream = false,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    const workload = workloadOf(llmRequest)
    const shaped = shapeRequest(llmRequest, this.resolved)
    const reservation = await startCall({
      provider: 'gemini',
      model: this.model,
      workload,
      estTokens: requestTokenEstimate([shaped.config?.systemInstruction, shaped.contents]),
      signal: abortSignal ?? shaped.config?.abortSignal
    })
    let usage: CallUsage | undefined
    try {
      for await (const response of super.generateContentAsync(shaped, stream, abortSignal)) {
        if (response.usageMetadata) usage = geminiUsage(this.model, workload, response.usageMetadata)
        yield response
      }
    } finally {
      if (usage) {
        recordUsage(usage)
        reservation.release(usage)
      } else {
        reservation.release()
      }
    }
  }
}

export function createLlm(resolved: ResolvedModel): BaseLlm {
  switch (resolved.provider) {
    case 'gemini':
      return new GeminiLlm(resolved)
    case 'anthropic':
      return new AnthropicLlm({ resolved })
    case 'modelscope':
      return new ModelScopeLlm({
        model: resolved.model,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl ?? config.fallback.baseUrl,
        timeoutMs: resolved.timeoutMs
      })
    case 'openai':
      throw new Error('No adapter serves openai yet; the Chat Completions adapter lands in a later phase')
  }
}

export function createRokaModel(): RoutedLlm {
  const { main, fallback, hedgeAfterMs } = config.llm
  // Pinning only binds when a side carries turn state the other cannot continue (Claude's thinking); Gemini and
  // ModelScope keep hedging every call, tool round-trips included, as they do today.
  const pinTurns = [main, fallback].some((resolved) => resolved?.profile.thinking.replayWithinTurn === true)
  return new RoutedLlm(createLlm(main), fallback ? createLlm(fallback) : null, hedgeAfterMs, { pinTurns })
}
