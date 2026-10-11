import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { GenerateContentConfig } from '@google/genai'
import type { z } from 'zod'
import { type ResolvedModel, config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { SAFETY_SETTINGS } from '../safetySettings.js'
import { createLlm } from './createModel.js'
import { normalizeReply, requestSchema } from './objectSchema.js'
import type { ProviderId } from './profiles.js'
import { type CallUsage, WORKLOAD_LABEL, type Workload } from './usage.js'

export type BackgroundWorkload = Exclude<Workload, 'reply' | 'embedding' | 'watcher'>

type GenerateObjectInput<T> = {
  schema: z.ZodType<T>
  system?: string
  prompt: string
  workload: BackgroundWorkload
  maxOutputTokens?: number
  signal?: AbortSignal
  /** The exact Gemini `responseSchema` this job sent before #296; only the legacy config sends it, unchanged. */
  legacyResponseSchema?: GenerateContentConfig['responseSchema']
}

// Today's per-job settings, so the legacy config sends exactly what it sent before.
const TEMPERATURE: Record<BackgroundWorkload, number> = {
  extraction: 0.3,
  reclassify: 0,
  admission: 0,
  verification: 0
}
const DEFAULT_MAX_OUTPUT_TOKENS = 1024

export class StructuredOutputError extends Error {
  constructor(
    readonly reason: 'blocked' | 'truncated' | 'empty' | 'invalid_json' | 'invalid_object',
    provider: ProviderId
  ) {
    super(`${provider} returned no usable structured output: ${reason}`)
    this.name = 'StructuredOutputError'
  }
}

const adapters = new Map<string, BaseLlm>()

function routes(): { main: ResolvedModel; fallback: ResolvedModel | null; legacy: boolean } {
  const { main, fallback } = config.llm
  // The legacy config keeps today's background setup: the extraction model, its timeout, and no fallback.
  if (main.key === 'legacy-gemini') {
    return {
      main: { ...main, model: config.gemini.extractionModel, timeoutMs: config.gemini.timeout },
      fallback: null,
      legacy: true
    }
  }
  return { main, fallback, legacy: false }
}

function outputCap<T>(route: ResolvedModel, input: GenerateObjectInput<T>): number {
  return Math.min(input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, route.profile.maxOutputTokens)
}

function adapterFor(route: ResolvedModel, cap: number): BaseLlm {
  const key = `${route.key}:${route.model}:${cap}`
  let adapter = adapters.get(key)
  if (!adapter) {
    // Adapters clamp every request to their own cap, which on the route is the reply cap, not this job's budget.
    adapter = createLlm({ ...route, maxOutputTokens: cap })
    adapters.set(key, adapter)
  }
  return adapter
}

function requestFor<T>(route: ResolvedModel, input: GenerateObjectInput<T>, legacy: boolean): LlmRequest {
  const { profile } = route
  const schema =
    legacy && input.legacyResponseSchema !== undefined
      ? { responseSchema: input.legacyResponseSchema }
      : { responseJsonSchema: requestSchema(input.schema, profile.structuredOutput) }
  return {
    model: route.model,
    contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
    config: {
      ...(input.system ? { systemInstruction: input.system } : {}),
      responseMimeType: 'application/json',
      ...schema,
      ...(profile.sampling.temperature ? { temperature: TEMPERATURE[input.workload] } : {}),
      maxOutputTokens: outputCap(route, input),
      ...(route.provider === 'gemini' ? { safetySettings: SAFETY_SETTINGS } : {}),
      httpOptions: { timeout: route.timeoutMs },
      labels: { [WORKLOAD_LABEL]: input.workload },
      ...(input.signal ? { abortSignal: input.signal } : {})
    },
    liveConnectConfig: {},
    toolsDict: {}
  }
}

function replyText(response: LlmResponse): string {
  return (response.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim()
}

function callUsage(
  route: ResolvedModel,
  workload: BackgroundWorkload,
  metadata: LlmResponse['usageMetadata']
): CallUsage {
  const cached = metadata?.cachedContentTokenCount ?? 0
  const reasoning = metadata?.thoughtsTokenCount ?? 0
  return {
    provider: route.provider,
    model: route.model,
    workload,
    inputTokens: Math.max(0, (metadata?.promptTokenCount ?? 0) - cached),
    outputTokens: metadata?.candidatesTokenCount ?? 0,
    // Gemini counts thinking apart from candidates; Anthropic's output count already includes it.
    ...(route.provider === 'gemini' && reasoning > 0 ? { reasoningTokens: reasoning } : {}),
    ...(cached > 0 ? { cacheReadTokens: cached } : {})
  }
}

async function attempt<T>(
  route: ResolvedModel,
  input: GenerateObjectInput<T>,
  legacy: boolean
): Promise<{ value: T; usage: CallUsage }> {
  let last: LlmResponse | undefined
  const adapter = adapterFor(route, outputCap(route, input))
  for await (const response of adapter.generateContentAsync(requestFor(route, input, legacy), false)) {
    last = response
  }
  if (!last) throw new StructuredOutputError('blocked', route.provider)
  const finish = last.errorCode ?? last.finishReason
  if (finish === FinishReason.MAX_TOKENS) throw new StructuredOutputError('truncated', route.provider)
  if (finish !== undefined && finish !== FinishReason.STOP) throw new StructuredOutputError('blocked', route.provider)
  const text = replyText(last)
  if (!text) throw new StructuredOutputError('empty', route.provider)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new StructuredOutputError('invalid_json', route.provider)
  }
  const result = input.schema.safeParse(normalizeReply(parsed, route.profile.structuredOutput))
  if (!result.success) throw new StructuredOutputError('invalid_object', route.provider)
  return { value: result.data, usage: callUsage(route, input.workload, last.usageMetadata) }
}

function failureFields(error: unknown) {
  return {
    errorName: (Object(error) as { constructor?: { name?: string } }).constructor?.name ?? 'Error',
    ...(error instanceof StructuredOutputError ? { reason: error.reason } : {})
  }
}

export async function generateObject<T>(
  input: GenerateObjectInput<T>
): Promise<{ value: T; provider: ProviderId; model: string; usage: CallUsage }> {
  const { main, fallback, legacy } = routes()
  try {
    const { value, usage } = await attempt(main, input, legacy)
    return { value, provider: main.provider, model: main.model, usage }
  } catch (error) {
    if (!fallback || input.signal?.aborted) throw error
    logger.warn(
      { workload: input.workload, provider: main.provider, ...failureFields(error) },
      'Background job failed on the main model, trying the fallback'
    )
    try {
      const { value, usage } = await attempt(fallback, input, false)
      return { value, provider: fallback.provider, model: fallback.model, usage }
    } catch (fallbackError) {
      logger.warn(
        { workload: input.workload, provider: fallback.provider, ...failureFields(fallbackError) },
        'Background job failed on the fallback too'
      )
      // The main model's failure is the one the extraction queue's retry policy should judge.
      throw error
    }
  }
}

export function resetGenerateObjectForTest(): void {
  adapters.clear()
}
