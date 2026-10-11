import type { LlmRequest } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { ModelScopeLlm as ReexportedModelScopeLlm } from '../../fallbackModel.js'
import { ChatCompletionsLlm, ModelScopeLlm } from '../chatCompletionsLlm.js'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

describe('Chat Completions profiles', () => {
  it('describes gpt-6-luna: tools only at effort none, strict JSON schema, image input', () => {
    expect(profileFor('openai', 'gpt-6-luna')).toMatchObject({
      provider: 'openai',
      input: { image: true, pdf: false, audio: false, video: false },
      tools: { supported: true, parallel: true },
      thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
      sampling: { temperature: true, topP: true },
      structuredOutput: 'json_schema_strict',
      promptCaching: 'implicit',
      tokenCounter: 'estimate',
      price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
      verified: true
    })
  })

  it.each(['Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash'])(
    'keeps %s a json_object candidate with thinking off until the probe passes',
    (model) => {
      expect(profileFor('modelscope', model)).toMatchObject({
        provider: 'modelscope',
        tools: { supported: true, parallel: true },
        thinking: { efforts: [], replayWithinTurn: false },
        structuredOutput: 'json_object',
        promptCaching: 'none',
        tokenCounter: 'estimate',
        price: { input: 0, output: 0 },
        verified: false
      })
    }
  )

  it('reads images on Qwen but not yet on DeepSeek', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B')?.input.image).toBe(true)
    expect(profileFor('modelscope', 'deepseek-ai/DeepSeek-V4.1-Flash')?.input.image).toBe(false)
  })

  it('leaves the legacy ModelScope fallback profile as it was and lists each new model once', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')).toMatchObject({
      input: { image: true },
      structuredOutput: 'json_object',
      verified: true
    })
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')?.thinking.defaultEffort).toBeUndefined()
    for (const model of ['gpt-6-luna', 'Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash']) {
      expect(MODEL_PROFILES.filter((profile) => profile.model === model)).toHaveLength(1)
    }
  })
})

describe('ModelScopeLlm', () => {
  it('is a modelscope ChatCompletionsLlm, still exported from fallbackModel', () => {
    const legacy = new ReexportedModelScopeLlm({
      model: 'Qwen/test-model',
      apiKey: 'test-key',
      baseUrl: 'https://modelscope.test/v1',
      timeoutMs: 1000
    })

    expect(ReexportedModelScopeLlm).toBe(ModelScopeLlm)
    expect(legacy).toBeInstanceOf(ChatCompletionsLlm)
    expect(legacy.provider).toBe('modelscope')
    expect(() => legacy.connect({} as LlmRequest)).toThrow('ModelScopeLlm does not support live connections')
  })
})
