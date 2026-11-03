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

  describe('OpenAI-compatible models', () => {
    const LOCAL = { provider: 'openai-compatible', model: 'qwen3:32b', baseUrl: 'http://localhost:11434/v1' }

    beforeEach(() => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('LOCAL_LLM_KEY', '')
      vi.stubEnv('ROUTER_KEY', '')
    })

    it('resolves a keyless entry with the conservative default capabilities', async () => {
      withYamlOverride({ llm: { main: 'local', fallback: null, models: { local: LOCAL } } })

      const { config } = await import('../config.js')
      const { COMPATIBLE_DEFAULTS, compatibleProfile } = await import('../agent/llm/profiles.js')

      expect(config.llm.main).toMatchObject({
        key: 'local',
        provider: 'openai-compatible',
        model: 'qwen3:32b',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
        maxTokensParam: 'max_tokens',
        maxOutputTokens: config.gemini.maxOutputTokens
      })
      expect(config.llm.main.effort).toBeUndefined()
      expect(config.llm.main.extraBody).toBeUndefined()
      expect(config.llm.main.profile).toEqual(compatibleProfile('qwen3:32b', COMPATIBLE_DEFAULTS))
    })

    it('reads the key, effort, extra body, price and capabilities an entry declares', async () => {
      vi.stubEnv('ROUTER_KEY', 'router-test-key')
      withYamlOverride({
        llm: {
          main: 'router',
          fallback: null,
          monthlyBudgetUsd: { 'openai-compatible': 3 },
          models: {
            router: {
              provider: 'openai-compatible',
              model: 'vendor/model-x',
              baseUrl: 'https://router.example/api/v1',
              apiKeyEnv: 'ROUTER_KEY',
              effort: 'low',
              extraBody: { provider: { sort: 'price' } },
              price: { input: 0.3, output: 1.2 },
              maxOutputTokens: 900,
              capabilities: {
                vision: true,
                structuredOutput: 'json_schema',
                maxTokensParam: 'max_completion_tokens',
                efforts: ['low', 'high'],
                maxOutputTokens: 4096
              }
            }
          }
        }
      })

      const { config } = await import('../config.js')

      expect(config.llm.main).toMatchObject({
        key: 'router',
        apiKey: 'router-test-key',
        effort: 'low',
        extraBody: { provider: { sort: 'price' } },
        maxTokensParam: 'max_completion_tokens',
        maxOutputTokens: 900
      })
      expect(config.llm.main.profile).toMatchObject({
        provider: 'openai-compatible',
        model: 'vendor/model-x',
        input: { image: true },
        structuredOutput: 'json_schema_strict',
        thinking: { efforts: ['low', 'high'], replayWithinTurn: false },
        maxOutputTokens: 4096,
        price: { input: 0.3, output: 1.2 },
        verified: true
      })
      expect(config.llm.monthlyBudgetUsd).toEqual({ 'openai-compatible': 3 })
    })

    it('runs both main and fallback on openai-compatible endpoints at once', async () => {
      vi.stubEnv('ROUTER_KEY', 'router-test-key')
      withYamlOverride({
        llm: {
          main: 'router',
          fallback: 'local',
          models: {
            local: LOCAL,
            router: { ...LOCAL, model: 'vendor/model-x', baseUrl: 'https://router.example/v1', apiKeyEnv: 'ROUTER_KEY' }
          }
        }
      })

      const { config } = await import('../config.js')

      expect(config.llm.main).toMatchObject({
        key: 'router',
        provider: 'openai-compatible',
        baseUrl: 'https://router.example/v1',
        apiKey: 'router-test-key'
      })
      expect(config.llm.fallback).toMatchObject({
        key: 'local',
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: ''
      })
    })

    it.each([
      ['a missing baseUrl', { ...LOCAL, baseUrl: undefined }, 'Config value llm.models.local.baseUrl is required'],
      [
        'a baseUrl that is not http(s)',
        { ...LOCAL, baseUrl: 'localhost:11434/v1' },
        'Config value llm.models.local.baseUrl must be an http or https URL, got: localhost:11434/v1'
      ],
      [
        'a missing model',
        { ...LOCAL, model: undefined },
        'Config value llm.models.local.model must be a non-empty string, got: undefined'
      ],
      [
        'an unknown capability',
        { ...LOCAL, capabilities: { streaming: true } },
        'Config value llm.models.local.capabilities.streaming is not a known capability'
      ],
      [
        'a structured output mode the client cannot send',
        { ...LOCAL, capabilities: { structuredOutput: 'grammar' } },
        'Config value llm.models.local.capabilities.structuredOutput must be json_schema or json_object, got: grammar'
      ],
      [
        'an unknown max-tokens parameter',
        { ...LOCAL, capabilities: { maxTokensParam: 'max_output_tokens' } },
        'Config value llm.models.local.capabilities.maxTokensParam must be max_tokens or max_completion_tokens, got: max_output_tokens'
      ],
      [
        'a capability flag that is not a boolean',
        { ...LOCAL, capabilities: { vision: 'yes' } },
        'Config value llm.models.local.capabilities.vision must be true or false, got: yes'
      ],
      [
        'a context window below one',
        { ...LOCAL, capabilities: { contextWindow: 0 } },
        'Config value llm.models.local.capabilities.contextWindow must be a positive integer, got: 0'
      ],
      [
        'efforts that are not a list',
        { ...LOCAL, capabilities: { efforts: 'low' } },
        'Config value llm.models.local.capabilities.efforts must be a list of effort names, got: low'
      ],
      [
        'capabilities that are not a mapping',
        { ...LOCAL, capabilities: 'all' },
        'Config value llm.models.local.capabilities must be a mapping, got: all'
      ],
      [
        'an effort its capabilities do not list',
        { ...LOCAL, effort: 'high', capabilities: { efforts: ['low'] } },
        'Config value llm.models.local.effort must be one of low, got: high'
      ],
      [
        'an effort on a model that lists none',
        { ...LOCAL, effort: 'low' },
        'Config value llm.models.local.effort is not accepted by qwen3:32b, got: low'
      ],
      [
        'an extra body that is not a mapping',
        { ...LOCAL, extraBody: 'think' },
        'Config value llm.models.local.extraBody must be a mapping, got: think'
      ],
      [
        'a negative price',
        { ...LOCAL, price: { input: -1 } },
        'Config value llm.models.local.price.input must be a number >= 0, got: -1'
      ],
      [
        'an unknown price field',
        { ...LOCAL, price: { cachedInput: 0.1 } },
        'Config value llm.models.local.price.cachedInput is not a known price; use input or output'
      ],
      [
        'an apiKeyEnv that is not a variable name',
        { ...LOCAL, apiKeyEnv: 42 },
        'Config value llm.models.local.apiKeyEnv must name an environment variable, got: 42'
      ],
      [
        'an apiKeyEnv naming an unset variable',
        { ...LOCAL, apiKeyEnv: 'LOCAL_LLM_KEY' },
        'Missing required environment variable: LOCAL_LLM_KEY (llm.main uses openai-compatible)'
      ],
      [
        'an output cap above its declared maximum',
        { ...LOCAL, maxOutputTokens: 5000, capabilities: { maxOutputTokens: 4096 } },
        'Config value llm.main.maxOutputTokens must be <= 4096, got: 5000'
      ]
    ])('stops startup with one clear message for %s', async (_name, local, message) => {
      withYamlOverride({ llm: { main: 'local', fallback: null, models: { local } } })

      await expect(() => import('../config.js')).rejects.toThrow(message)
    })
  })
})
