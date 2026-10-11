import { Gemini } from '@google/adk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configState = vi.hoisted(() => ({
  logging: { level: 'silent' },
  gemini: { hedgeAfterMs: 5000 },
  fallback: { baseUrl: 'https://api-inference.modelscope.ai/v1' },
  llm: {
    main: undefined as unknown,
    fallback: null as unknown,
    hedgeAfterMs: 5000,
    stickyMs: 300_000,
    monthlyBudgetUsd: {}
  }
}))

vi.mock('../../../config.js', () => ({ config: configState }))

const budget = vi.hoisted(() => ({ release: vi.fn(), startCall: vi.fn() }))

vi.mock('../budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../budget.js')>()),
  startCall: budget.startCall
}))

import type { ResolvedModel } from '../../../config.js'
import { ModelScopeLlm, RoutedLlm } from '../../fallbackModel.js'
import { AnthropicLlm } from '../anthropicLlm.js'
import { ChatCompletionsLlm } from '../chatCompletionsLlm.js'
import { createLlm, createRokaModel } from '../createModel.js'
import { profileFor } from '../profiles.js'
import { type CallUsage, onUsage } from '../usage.js'

const legacyGemini: ResolvedModel = {
  key: 'legacy-gemini',
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  profile: profileFor('gemini', 'gemini-3.5-flash-lite')!,
  apiKey: 'vitest-gemini-token',
  timeoutMs: 20_000,
  maxOutputTokens: 500
}
const legacyFallback: ResolvedModel = {
  key: 'legacy-fallback',
  provider: 'modelscope',
  model: 'Qwen/Qwen3.5-122B-A10B',
  profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')!,
  apiKey: 'modelscope-key',
  baseUrl: 'https://api-inference.modelscope.ai/v1',
  timeoutMs: 15_000,
  maxOutputTokens: 500
}
const haiku: ResolvedModel = {
  key: 'haiku',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  apiKey: 'anthropic-key',
  timeoutMs: 20_000,
  maxOutputTokens: 500,
  effort: 'low'
}

const luna: ResolvedModel = {
  key: 'luna',
  provider: 'openai',
  model: 'gpt-6-luna',
  profile: profileFor('openai', 'gpt-6-luna')!,
  apiKey: 'openai-key',
  timeoutMs: 20_000,
  maxOutputTokens: 500,
  effort: 'none'
}
const qwen122: ResolvedModel = {
  ...legacyFallback,
  key: 'qwen122',
  timeoutMs: 12_000
}

function geminiRequest(): LlmRequest {
  return {
    model: 'gemini-3.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    config: { maxOutputTokens: 500 },
    toolsDict: {},
    liveConnectConfig: {}
  } as unknown as LlmRequest
}

beforeEach(() => {
  configState.llm.main = legacyGemini
  configState.llm.fallback = null
  configState.llm.hedgeAfterMs = 5000
  budget.release.mockReset()
  budget.startCall.mockReset()
  budget.startCall.mockResolvedValue({ release: budget.release })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createRokaModel', () => {
  it('builds the legacy route: Gemini main, no fallback, per-call hedging', () => {
    const model = createRokaModel()

    expect(model).toBeInstanceOf(RoutedLlm)
    expect(model.model).toBe('gemini-3.5-flash-lite')
    expect(Reflect.get(model, 'primary')).toBeInstanceOf(Gemini)
    expect(model.hasFallback).toBe(false)
    expect(model.hedgeAfterMs).toBe(5000)
    expect(Reflect.get(model, 'pinTurns')).toBe(false)
  })

  it('builds the legacy ModelScope fallback with its own endpoint and timeout', () => {
    configState.llm.fallback = legacyFallback

    const model = createRokaModel()
    const fallback = Reflect.get(model, 'fallback')

    expect(fallback).toBeInstanceOf(ModelScopeLlm)
    expect(fallback).toMatchObject({
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'modelscope-key',
      baseUrl: 'https://api-inference.modelscope.ai/v1',
      timeoutMs: 15_000
    })
    expect(model.fallbackModelName).toBe('Qwen/Qwen3.5-122B-A10B')
    expect(Reflect.get(model, 'pinTurns')).toBe(false)
  })

  it('builds AnthropicLlm for a Claude main and pins turns, because Claude replays thinking within a turn', () => {
    configState.llm.main = haiku
    configState.llm.fallback = legacyGemini
    configState.llm.hedgeAfterMs = 0

    const model = createRokaModel()

    expect(Reflect.get(model, 'primary')).toBeInstanceOf(AnthropicLlm)
    expect(Reflect.get(model, 'fallback')).toBeInstanceOf(Gemini)
    expect(model.hedgeAfterMs).toBe(0)
    expect(Reflect.get(model, 'pinTurns')).toBe(true)
  })
})

describe('createLlm', () => {
  it('builds the Chat Completions adapter for an openai model, not the legacy ModelScope one', () => {
    const llm = createLlm(luna)

    expect(llm).toBeInstanceOf(ChatCompletionsLlm)
    expect(llm).not.toBeInstanceOf(ModelScopeLlm)
    expect(llm).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'openai-key',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 20_000,
      maxOutputTokens: 500,
      effort: 'none'
    })
  })

  it('builds the Chat Completions adapter for a block modelscope entry, keeping ModelScopeLlm for the legacy key only', () => {
    const llm = createLlm(qwen122)

    expect(llm).toBeInstanceOf(ChatCompletionsLlm)
    expect(llm).not.toBeInstanceOf(ModelScopeLlm)
    expect(llm).toMatchObject({
      provider: 'modelscope',
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'modelscope-key',
      baseUrl: 'https://api-inference.modelscope.ai/v1',
      timeoutMs: 12_000
    })
    expect(createLlm(legacyFallback)).toBeInstanceOf(ModelScopeLlm)
  })

  it('sends Gemini requests unchanged and records Gemini usage', async () => {
    const seen: LlmRequest[] = []
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* (llmRequest: LlmRequest) {
      seen.push(llmRequest)
      const response: LlmResponse = {
        content: { role: 'model', parts: [{ text: 'hi' }] },
        usageMetadata: {
          promptTokenCount: 120,
          cachedContentTokenCount: 20,
          candidatesTokenCount: 30,
          thoughtsTokenCount: 5,
          totalTokenCount: 155
        }
      }
      yield response
    })
    const usages: CallUsage[] = []
    const stop = onUsage((usage) => usages.push(usage))
    const config = {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 500,
      safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]
    }
    const llmRequest = {
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config,
      toolsDict: {},
      liveConnectConfig: {}
    } as unknown as LlmRequest

    const responses: LlmResponse[] = []
    for await (const response of createLlm(legacyGemini).generateContentAsync(llmRequest)) responses.push(response)
    stop()

    expect(seen[0]?.config).toEqual(config)
    expect(seen[0]?.contents).toBe(llmRequest.contents)
    expect(responses[0]?.content?.parts?.[0]?.text).toBe('hi')
    expect(usages).toEqual([
      {
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        workload: 'reply',
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 5,
        cacheReadTokens: 20
      }
    ])
    expect(budget.startCall).toHaveBeenCalledTimes(1)
    expect(budget.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-3.5-flash-lite', workload: 'reply' })
    )
    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release).toHaveBeenCalledWith(usages[0])
  })

  it('sends its own model id when the route was built around another provider', async () => {
    const seen: LlmRequest[] = []
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* (llmRequest: LlmRequest) {
      seen.push(llmRequest)
      yield { content: { role: 'model', parts: [{ text: 'hi' }] } }
    })
    const llmRequest = { ...geminiRequest(), model: 'claude-haiku-5-5' } as LlmRequest

    for await (const _response of createLlm(legacyGemini).generateContentAsync(llmRequest)) {
      // drain
    }

    expect(seen[0]?.model).toBe('gemini-3.5-flash-lite')
    expect(seen[0]?.contents).toBe(llmRequest.contents)
    expect(llmRequest.model).toBe('claude-haiku-5-5')
  })

  it('passes a Gemini failure through unchanged and releases the reservation with no usage', async () => {
    const failure = new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}')
    // biome-ignore lint/correctness/useYield: the call fails before Gemini answers anything
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* () {
      throw failure
    })
    const usages: CallUsage[] = []
    const stop = onUsage((usage) => usages.push(usage))

    const call = async () => {
      for await (const _response of createLlm(legacyGemini).generateContentAsync(geminiRequest())) {
        // drain
      }
    }
    await expect(call()).rejects.toBe(failure)
    stop()

    expect(usages).toEqual([])
    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release).toHaveBeenCalledWith()
  })

  it('counts every prompt token as uncached input when Gemini reports no cache or thinking split', async () => {
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* () {
      yield {
        content: { role: 'model', parts: [{ text: 'hi' }] },
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 12, totalTokenCount: 92 }
      }
    })
    const usages: CallUsage[] = []
    const stop = onUsage((usage) => usages.push(usage))

    for await (const _response of createLlm(legacyGemini).generateContentAsync(geminiRequest())) {
      // drain
    }
    stop()

    expect(usages).toEqual([
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', workload: 'reply', inputTokens: 80, outputTokens: 12 }
    ])
    expect(usages[0]).not.toHaveProperty('reasoningTokens')
    expect(usages[0]).not.toHaveProperty('cacheReadTokens')
  })
})
