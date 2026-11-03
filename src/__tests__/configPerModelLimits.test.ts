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

  describe('per-model limits', () => {
    it("gives the legacy Gemini route today's rateLimit and per-minute token budget", async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      const { config } = await import('../config.js')

      expect(config.llm.main.key).toBe('legacy-gemini')
      expect(config.llm.main.limits).toEqual({ rpm: 15, rpd: 500, tpm: 125_000 })
    })

    it('carries the rateLimit and token budget env overrides into the Gemini route', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('RATE_LIMIT_RPM', '30')
      vi.stubEnv('RATE_LIMIT_RPD', '1000')
      vi.stubEnv('GEMINI_MAX_TOKENS_PER_MINUTE', '100000')
      vi.stubEnv('GEMINI_MAX_ATTACHMENT_TOKENS', '50000')
      const { config } = await import('../config.js')

      expect(config.llm.main.limits).toEqual({ rpm: 30, rpd: 1000, tpm: 100_000 })
      expect(config.rateLimit).toEqual({ rpm: 30, rpd: 1000 })
      expect(config.gemini.maxTokensPerMinute).toBe(100_000)
    })

    it('gives the legacy ModelScope fallback no request or token limits', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope')
      const { config } = await import('../config.js')

      expect(config.llm.fallback?.key).toBe('legacy-fallback')
      expect(config.llm.fallback?.limits).toBeUndefined()
    })

    it('lets a Gemini entry set one limit and inherit the others', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({
        llm: {
          main: 'flash',
          models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite', limits: { rpm: 10 } } }
        }
      })
      const { config } = await import('../config.js')

      expect(config.llm.main.limits).toEqual({ rpm: 10, rpd: 500, tpm: 125_000 })
    })

    it('limits a non-Gemini entry only where it says so', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic')
      withYamlOverride({
        llm: {
          main: 'flash',
          fallback: 'haiku',
          models: {
            flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
            haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low', limits: { rpm: 50 } }
          }
        }
      })
      const { config } = await import('../config.js')

      expect(config.llm.fallback?.limits).toEqual({ rpm: 50 })
    })

    it('rejects a main-model rpm that cannot fund one whole turn', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({
        llm: {
          main: 'flash',
          models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite', limits: { rpm: 3 } } }
        }
      })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value llm.models.flash.limits.rpm must be >= 4, got: 3'
      )
    })

    it('rejects a main-model tpm below one attachment turn', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({
        llm: {
          main: 'flash',
          models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite', limits: { tpm: 40_000 } } }
        }
      })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value llm.models.flash.limits.tpm must be >= 125000, got: 40000'
      )
    })

    it('estimates 250 shared ModelScope Magicubes a day and rejects zero', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      const defaults = await import('../config.js')
      expect(defaults.config.llm.modelscopeDailyMagicubes).toBe(250)

      vi.resetModules()
      withYamlOverride({
        llm: {
          main: 'flash',
          modelscopeDailyMagicubes: 0,
          models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } }
        }
      })
      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value llm.modelscopeDailyMagicubes must be >= 1, got: 0'
      )
    })
  })
})
