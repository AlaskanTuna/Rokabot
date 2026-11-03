import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTunableEnvVars, setRequiredEnvVars, warningMessages, withYamlOverride } from './configOverrides.js'

describe('config module', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('js-yaml')
    vi.doUnmock('../agent/llm/profiles.js')
  })

  describe('search provider', () => {
    it('defaults search.provider to native when unset', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ search: undefined })

      const { config } = await import('../config.js')

      expect(config.search).toEqual({
        provider: 'native',
        available: true,
        nativeTimeoutMs: 8000,
        nativeReserveMs: 5000
      })
    })

    it('reads search.provider from config.yml, and SEARCH_PROVIDER overrides it', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('EXA_API_KEY', 'test-exa-key')
      withYamlOverride({ search: { provider: 'exa' } })

      const fromYaml = await import('../config.js')
      expect(fromYaml.config.search.provider).toBe('exa')

      vi.resetModules()
      vi.stubEnv('SEARCH_PROVIDER', 'off')
      const fromEnv = await import('../config.js')
      expect(fromEnv.config.search.provider).toBe('off')
    })

    it.each(['Exa', 'brave'])('rejects the unknown search provider %s', async (provider) => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('SEARCH_PROVIDER', provider)

      await expect(() => import('../config.js')).rejects.toThrow(
        `Environment variable SEARCH_PROVIDER must be off, native, tavily or exa, got: ${provider}`
      )
    })

    it('rejects an unknown value in config.yml', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ search: { provider: 'brave' } })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value search.provider must be off, native, tavily or exa, got: brave'
      )
    })

    it('names exactly the four models that support native search', async () => {
      const { MODEL_PROFILES } = await import('../agent/llm/profiles.js')

      const native: Array<{ model: string; tool: string; usdPerSearch: number }> = []
      for (const profile of MODEL_PROFILES) {
        if (profile.nativeSearch) native.push({ model: profile.model, ...profile.nativeSearch })
      }

      expect(native).toEqual([
        { model: 'gemini-3.5-flash-lite', tool: 'google_search', usdPerSearch: 0.014 },
        { model: 'claude-haiku-5-5', tool: 'web_search_20250305', usdPerSearch: 0.01 },
        { model: 'claude-sonnet-5-5', tool: 'web_search_20250305', usdPerSearch: 0.01 },
        { model: 'gemini-3.8-flash', tool: 'google_search', usdPerSearch: 0.014 }
      ])
    })

    it('makes native available on a supporting main model', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
      vi.stubEnv('SEARCH_PROVIDER', 'native')
      withYamlOverride({
        llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5' } } }
      })

      const { config } = await import('../config.js')

      expect(config.search).toEqual({
        provider: 'native',
        available: true,
        nativeTimeoutMs: 8000,
        nativeReserveMs: 5000
      })
      expect(await warningMessages()).not.toContainEqual(expect.stringContaining('has no web search'))
    })

    // The legacy route copies its family's profile for an untested `gemini.model`, so the copy's capabilities
    // must not make native available there.
    it('treats native on a legacy Gemini model with no tested profile as unsupported', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('SEARCH_PROVIDER', 'native')
      vi.stubEnv('GEMINI_MODEL', 'gemini-2.0-flash-lite')

      const { config, startupWarnings } = await import('../config.js')

      expect(config.search).toEqual({
        provider: 'native',
        available: false,
        nativeTimeoutMs: 8000,
        nativeReserveMs: 5000
      })
      expect(startupWarnings).toContainEqual({
        fields: { provider: 'native' },
        message:
          'search.provider is native, but gemini-2.0-flash-lite has no web search, so Roka runs without it. Set search.provider to tavily or exa to search with an API key.'
      })
    })

    it('marks off unavailable without warning', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ search: { provider: 'off' } })

      const { config } = await import('../config.js')

      expect(config.search).toEqual({
        provider: 'off',
        available: false,
        nativeTimeoutMs: 8000,
        nativeReserveMs: 5000
      })
      expect(await warningMessages()).toEqual([])
    })

    it.each([
      ['tavily', 'TAVILY_API_KEY'],
      ['exa', 'EXA_API_KEY']
    ])('warns when %s has no %s, and stays available', async (provider, key) => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('SEARCH_PROVIDER', provider)
      vi.stubEnv(key, '')

      const { config, startupWarnings } = await import('../config.js')

      expect(config.search).toEqual({ provider, available: true, nativeTimeoutMs: 8000, nativeReserveMs: 5000 })
      expect(startupWarnings).toContainEqual({
        fields: { provider },
        message: `search.provider is ${provider}, but ${key} is not set, so search_web will report that search is not configured.`
      })
    })

    it('runs jev.prefetch on as shadow under off, and warns', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('SEARCH_PROVIDER', 'off')
      vi.stubEnv('JEV_PREFETCH', 'on')

      const { config, startupWarnings } = await import('../config.js')

      expect(config.jev.prefetch).toBe('shadow')
      expect(config.search.available).toBe(false)
      expect(startupWarnings).toContainEqual({
        fields: { provider: 'off' },
        message: 'jev.prefetch is on, but search.provider is off, so prefetch runs as shadow.'
      })
    })

    it('runs jev.prefetch on as shadow under native', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('SEARCH_PROVIDER', 'native')
      vi.stubEnv('JEV_PREFETCH', 'on')

      const { config } = await import('../config.js')

      // The legacy route runs a model that now supports native, so search is available; prefetch stays shadow
      // anyway, because only a keyed backend can answer inside `jev.prefetchWaitMs`.
      expect(config.search.available).toBe(true)
      expect(config.jev.prefetch).toBe('shadow')
    })

    it('leaves jev.prefetch on under tavily and exa', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('EXA_API_KEY', 'test-exa-key')
      vi.stubEnv('JEV_PREFETCH', 'on')
      vi.stubEnv('SEARCH_PROVIDER', 'exa')

      const { config } = await import('../config.js')

      expect(config.jev.prefetch).toBe('on')
      expect(await warningMessages()).not.toContainEqual(expect.stringContaining('prefetch runs as shadow'))
    })

    // Neither setting names a provider, so search runs on the main model and bills that provider. The
    // warning is the only signal an operator gets before the bill.
    it('warns when neither SEARCH_PROVIDER nor search.provider is set, naming the model', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
      withYamlOverride({
        search: { provider: undefined },
        llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5' } } }
      })

      const { config, startupWarnings } = await import('../config.js')

      expect(config.search.provider).toBe('native')
      expect(startupWarnings).toContainEqual({
        fields: { provider: 'native', model: 'claude-haiku-5-5' },
        message:
          'search.provider is unset, so web search runs on claude-haiku-5-5 and bills that provider. A free-tier Gemini key cannot search. Set search.provider to tavily, exa or off to choose another.'
      })
    })

    it('warns when search.provider is an empty YAML key', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
      withYamlOverride({
        search: { provider: null },
        llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5' } } }
      })

      const { config, startupWarnings } = await import('../config.js')

      expect(config.search.provider).toBe('native')
      expect(startupWarnings).toContainEqual({
        fields: { provider: 'native', model: 'claude-haiku-5-5' },
        message:
          'search.provider is unset, so web search runs on claude-haiku-5-5 and bills that provider. A free-tier Gemini key cannot search. Set search.provider to tavily, exa or off to choose another.'
      })
    })

    it.each([
      ['SEARCH_PROVIDER set', { search: { provider: undefined } }, 'SEARCH_PROVIDER'],
      ['search.provider set', { search: { provider: 'tavily' } }, undefined]
    ])('does not warn when %s', async (_name, override, env) => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
      if (env) vi.stubEnv(env, 'native')
      withYamlOverride({
        ...override,
        llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5' } } }
      })

      await import('../config.js')

      expect(await warningMessages()).not.toContainEqual(expect.stringContaining('search.provider is unset'))
    })

    it('bounds the native search time and its reserve', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()

      const { config, NUMERIC_BOUNDS } = await import('../config.js')

      expect(config.search.nativeTimeoutMs).toBe(8000)
      expect(config.search.nativeReserveMs).toBe(5000)
      expect(NUMERIC_BOUNDS.find(({ path }) => path === 'search.nativeTimeoutMs')).toMatchObject({
        value: 8000,
        min: 2000,
        max: 60_000
      })
      expect(NUMERIC_BOUNDS.find(({ path }) => path === 'search.nativeReserveMs')).toMatchObject({
        value: 5000,
        min: 0,
        max: 60_000
      })
    })
  })
})
