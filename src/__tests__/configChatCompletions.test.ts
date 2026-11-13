import type { LlmRequest } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTunableEnvVars, setRequiredEnvVars, withYamlOverride } from './configOverrides.js'

describe('config module', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('js-yaml')
    vi.doUnmock('../agent/llm/profiles.js')
  })

  describe('Chat Completions models', () => {
    const LUNA = { provider: 'openai', model: 'gpt-6-luna', effort: 'none' }

    beforeEach(() => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('MODELSCOPE_API_KEY', '')
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('resolves gpt-6-luna from OPENAI_API_KEY and builds it on the Chat Completions adapter', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'openai-test-key')
      withYamlOverride({ llm: { main: 'luna', fallback: null, models: { luna: LUNA } } })

      const { config } = await import('../config.js')
      const { createLlm } = await import('../agent/llm/createModel.js')
      const { ChatCompletionsLlm, ModelScopeLlm } = await import('../agent/llm/chatCompletionsLlm.js')

      expect(config.llm.main).toMatchObject({
        key: 'luna',
        provider: 'openai',
        model: 'gpt-6-luna',
        apiKey: 'openai-test-key',
        effort: 'none'
      })
      expect(config.llm.fallback).toBeNull()
      const main = createLlm(config.llm.main)
      expect(main).toBeInstanceOf(ChatCompletionsLlm)
      expect(main).not.toBeInstanceOf(ModelScopeLlm)
      expect(main.model).toBe('gpt-6-luna')
    })

    it('stops startup when an openai model has no OPENAI_API_KEY', async () => {
      withYamlOverride({ llm: { main: 'luna', fallback: null, models: { luna: LUNA } } })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Missing required environment variable: OPENAI_API_KEY (llm.main uses openai)'
      )
    })

    it.each([
      ['qwen', 'Qwen/Qwen3.5-35B-A3B'],
      ['deepseek', 'deepseek-ai/DeepSeek-V4.1-Flash']
    ])('accepts the verified %s profile as main', async (key, model) => {
      vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
      withYamlOverride({ llm: { main: key, fallback: null, models: { [key]: { provider: 'modelscope', model } } } })

      const { config } = await import('../config.js')

      expect(config.llm.main).toMatchObject({ key, provider: 'modelscope', model, apiKey: 'modelscope-test-key' })
      expect(config.llm.main.profile.verified).toBe(true)
    })

    it('keeps the legacy fallback and its exact ModelScope request when there is no llm block', async () => {
      vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
      withYamlOverride({ llm: undefined })
      const calls: Array<{ input: unknown; init?: RequestInit }> = []
      vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
        calls.push({ input, init })
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
      })

      const { config } = await import('../config.js')
      const { createLlm } = await import('../agent/llm/createModel.js')
      const { ChatCompletionsLlm, ModelScopeLlm } = await import('../agent/llm/chatCompletionsLlm.js')

      expect(config.llm.main).toMatchObject({ provider: 'gemini' })
      expect(config.llm.fallback).toMatchObject({
        key: 'legacy-fallback',
        provider: 'modelscope',
        model: 'Qwen/Qwen3.5-122B-A10B'
      })
      const fallback = createLlm(config.llm.fallback!)
      expect(fallback).toBeInstanceOf(ChatCompletionsLlm)
      expect(fallback).toBeInstanceOf(ModelScopeLlm)
      const maxOutputTokens = config.gemini.maxOutputTokens
      const llmRequest = {
        model: 'roka',
        contents: [{ role: 'user', parts: [{ text: 'hi' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }],
        config: { maxOutputTokens },
        toolsDict: {},
        liveConnectConfig: undefined
      } as unknown as LlmRequest
      const texts: string[] = []
      for await (const response of fallback.generateContentAsync(llmRequest))
        texts.push(response.content?.parts?.[0]?.text ?? '')

      expect(texts).toEqual(['ok'])
      expect(calls[0]?.input).toBe('https://api-inference.modelscope.ai/v1/chat/completions')
      expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer modelscope-test-key')
      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({
          model: 'Qwen/Qwen3.5-122B-A10B',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'hi' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
              ]
            }
          ],
          enable_thinking: false,
          stream: false,
          max_tokens: maxOutputTokens
        })
      )
    })
  })
})
