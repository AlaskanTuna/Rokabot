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

  describe('embeddings', () => {
    const GEMINI_FINGERPRINT = 'gemini:gemini-embedding-2:768:gemini-task-prefix'
    const LOCAL_MODEL = 'Xenova/multilingual-e5-small@761b726d-q8'
    const LOCAL_FINGERPRINT = `local:${LOCAL_MODEL}:384:e5-prefix-mean-l2`
    const NO_FLOORS_WARNING =
      'No embeddings.minSimilarity entry for this fingerprint, so recall uses the Gemini floors in memory.*MinSimilarity'

    async function loadFloors() {
      const { config, startupWarnings } = await import('../config.js')
      return {
        config,
        startupWarnings,
        floors: [config.memory.episodeMinSimilarity, config.memory.mediaMinSimilarity]
      }
    }

    it("keeps a config without an embeddings block on today's Gemini embeddings", async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({
        embeddings: undefined,
        memory: { embeddingModel: 'gemini-embedding-2', embeddingTimeoutMs: 1500 }
      })

      const { config, floors } = await loadFloors()

      expect(config.embeddings).toEqual({
        provider: 'gemini',
        model: 'gemini-embedding-2',
        dim: 768,
        fingerprint: GEMINI_FINGERPRINT,
        timeoutMs: 1500,
        sidecarUrl: 'http://embeddings:8080',
        apiKey: 'test-api-key',
        backfillBatchSize: 3600,
        backfillGapMs: 1000
      })
      expect(config.memory.embeddingModel).toBe('gemini-embedding-2')
      expect(config.memory.embeddingTimeoutMs).toBe(1500)
      expect(floors).toEqual([0.7, 0.7])
      expect(await warningMessages()).not.toContain(NO_FLOORS_WARNING)
    })

    it('defaults a config without an embeddings block to gemini only while GEMINI_API_KEY is set', async () => {
      const { defaultEmbeddingProvider } = await import('../storage/vectorProvenance.js')

      expect(defaultEmbeddingProvider({ hasBlock: false, hasGeminiKey: true })).toBe('gemini')
      expect(defaultEmbeddingProvider({ hasBlock: false, hasGeminiKey: false })).toBe('local')
      expect(defaultEmbeddingProvider({ hasBlock: true, hasGeminiKey: true })).toBe('local')
    })

    it('honours a legacy memory.embeddingModel at 768 dimensions', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({
        embeddings: undefined,
        memory: { embeddingModel: 'gemini-embedding-001', embeddingTimeoutMs: 900 }
      })

      const { config } = await import('../config.js')

      expect(config.embeddings).toMatchObject({
        provider: 'gemini',
        model: 'gemini-embedding-001',
        dim: 768,
        fingerprint: 'gemini:gemini-embedding-001:768:gemini-task-prefix',
        timeoutMs: 900
      })
      expect(config.memory.embeddingTimeoutMs).toBe(900)
    })

    it('ships config.yml on Gemini so the Pi keeps its vectors', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()

      const { config, floors } = await loadFloors()

      expect(config.embeddings).toMatchObject({
        provider: 'gemini',
        model: 'gemini-embedding-2',
        dim: 768,
        fingerprint: GEMINI_FINGERPRINT,
        timeoutMs: 1500
      })
      expect(floors).toEqual([0.7, 0.7])
    })

    it('defaults an embeddings block without a provider to the local sidecar and its own floors', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ embeddings: { provider: undefined } })

      const { config, floors } = await loadFloors()

      expect(config.embeddings).toMatchObject({
        provider: 'local',
        model: LOCAL_MODEL,
        dim: 384,
        fingerprint: LOCAL_FINGERPRINT,
        sidecarUrl: 'http://embeddings:8080',
        apiKey: undefined
      })
      expect(floors).toEqual([0.86, 0.86])
      expect(await warningMessages()).not.toContain(NO_FLOORS_WARNING)
    })

    it("lets EMBEDDINGS_PROVIDER pick OpenAI and warns that its floors are Gemini's", async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('EMBEDDINGS_PROVIDER', 'openai')
      vi.stubEnv('OPENAI_API_KEY', 'sk-test')

      const { config, floors, startupWarnings } = await loadFloors()

      expect(config.embeddings).toMatchObject({
        provider: 'openai',
        model: 'text-embedding-3-small',
        dim: 1536,
        fingerprint: 'openai:text-embedding-3-small:1536:raw',
        apiKey: 'sk-test'
      })
      expect(floors).toEqual([0.7, 0.7])
      expect(startupWarnings).toContainEqual({
        fields: { fingerprint: 'openai:text-embedding-3-small:1536:raw' },
        message: NO_FLOORS_WARNING
      })
    })

    it('requires OPENAI_API_KEY only when OpenAI embeds', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('EMBEDDINGS_PROVIDER', 'openai')

      await expect(() => import('../config.js')).rejects.toThrow(
        'Missing required environment variable: OPENAI_API_KEY'
      )
    })

    it('names the env key of an unknown provider', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      vi.stubEnv('EMBEDDINGS_PROVIDER', 'cohere')

      await expect(() => import('../config.js')).rejects.toThrow(
        'Environment variable EMBEDDINGS_PROVIDER must be local, gemini or openai, got: cohere'
      )
    })

    it('names the config key of an unknown provider', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ embeddings: { provider: 'cohere' } })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value embeddings.provider must be local, gemini or openai, got: cohere'
      )
    })

    it('rejects an untested embedding model', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ embeddings: { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2' } })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value embeddings.model is not a tested local embedding model, got: Xenova/all-MiniLM-L6-v2'
      )
    })

    it('rejects a zero backfill batch', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ embeddings: { backfillBatchSize: 0 } })

      await expect(() => import('../config.js')).rejects.toThrow(
        'Config value embeddings.backfillBatchSize must be >= 1, got: 0'
      )
    })

    it('accepts a zero backfill gap', async () => {
      setRequiredEnvVars()
      clearTunableEnvVars()
      withYamlOverride({ embeddings: { backfillGapMs: 0 } })

      const { config } = await import('../config.js')

      expect(config.embeddings.backfillGapMs).toBe(0)
    })
  })
})
