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

  it('throws if DISCORD_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_TOKEN', '')
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key')

    await expect(() => import('../config.js')).rejects.toThrow('Missing required environment variable: DISCORD_TOKEN')
  })

  it('throws if DISCORD_CLIENT_ID is missing', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token')
    vi.stubEnv('DISCORD_CLIENT_ID', '')
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Missing required environment variable: DISCORD_CLIENT_ID'
    )
  })

  it('throws if GEMINI_API_KEY is missing', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token')
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GEMINI_API_KEY', '')

    await expect(() => import('../config.js')).rejects.toThrow('Missing required environment variable: GEMINI_API_KEY')
  })

  it.each([
    [0, 'Config value socialPosts.maxRepliesOnRequest must be >= 1, got: 0'],
    [51, 'Config value socialPosts.maxRepliesOnRequest must be <= 50, got: 51']
  ])('rejects maxRepliesOnRequest outside 1..50 (%s)', async (value, message) => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ socialPosts: { maxRepliesOnRequest: value } })

    await expect(() => import('../config.js')).rejects.toThrow(message)
  })

  it('rejects a zero fallback timeout', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ fallback: { timeoutMs: 0 } })

    await expect(() => import('../config.js')).rejects.toThrow('Config value fallback.timeoutMs must be >= 1, got: 0')
  })

  it('accepts a zero fallback sticky duration', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ fallback: { stickyMs: 0 } })

    const { config } = await import('../config.js')

    expect(config.fallback.stickyMs).toBe(0)
  })

  it('defaults the memory store to legacy', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.memory.store).toBe('legacy')
  })

  it('accepts memory.store dual', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { store: 'dual' } })

    const { config } = await import('../config.js')

    expect(config.memory.store).toBe('dual')
  })

  it('rejects memory.store item until the read cutover phase is enabled', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { store: 'item' } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.store=item is not supported in Phase 3; only legacy or dual is accepted'
    )
  })

  it('lets MEMORY_STORE override the YAML setting', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { store: 'item' } })
    vi.stubEnv('MEMORY_STORE', 'legacy')

    const { config } = await import('../config.js')

    expect(config.memory.store).toBe('legacy')
  })

  it('rejects unknown memory store values with the allowed values', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_STORE', 'shadow')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable MEMORY_STORE must be legacy or dual, got: shadow'
    )
  })

  it('rejects a negative fallback sticky duration', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ fallback: { stickyMs: -1 } })

    await expect(() => import('../config.js')).rejects.toThrow('Config value fallback.stickyMs must be >= 0, got: -1')
  })

  it('loads defaults from config.yml when no env overrides set', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.gemini.model).toBe('gemini-3.5-flash-lite')
    expect(config.gemini.extractionModel).toBe(config.gemini.model)
    expect(config.gemini.timeout).toBe(20_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.gemini.maxOutputTokens).toBe(500)
    expect(config.gemini.maxAttachmentTokens).toBe(125_000)
    expect(config.gemini.safetyThreshold).toBe('OFF')
    expect(config.gemini.maxLlmCalls).toBe(4)
    expect(config.gemini.liveMaxRetries).toBe(2)
    expect(config.gemini.retryRpmFloor).toBe(2)
    expect(config.gemini.retryBackoffBaseMs).toBe(1000)
    expect(config.gemini.retryBackoffCapMs).toBe(12_000)
    expect(config.gemini.turnDeadlineMs).toBe(63_000)
    expect(config.fallback.apiKey).toBeUndefined()
    expect(config.fallback.model).toBe('Qwen/Qwen3.5-122B-A10B')
    expect(config.fallback.baseUrl).toBe('https://api-inference.modelscope.ai/v1')
    expect(config.fallback.timeoutMs).toBe(15_000)
    expect(config.fallback.stickyMs).toBe(300_000)
    expect(config.logging.level).toBe('info')
    expect(config.rateLimit.rpm).toBe(15)
    expect(config.rateLimit.rpd).toBe(500)
    expect(config.discord.maxAttachmentBytesPerTurn).toBe(10_485_760)
    expect(config.session.ttlMs).toBe(500_000)
    expect(config.session.windowSize).toBe(20)
    expect(config.session.maxRehydrationAge).toBe(7_200_000)
    expect(config.session.historyRetentionDays).toBe(7)
    expect(config.discord.maxMessageLength).toBe(1500)
    expect(config.report).toEqual({
      maxPerUserPerHour: 5,
      maxAttachmentBytes: 8_388_608,
      historyMessages: 20,
      historyMaxAgeMs: 7_200_000
    })

    expect(config.socialPosts).toEqual({
      enabled: true,
      maxLookupsPerTurn: 1,
      timeoutMs: 6000,
      maxTextChars: 1500,
      cacheTtlMs: 900_000,
      maxCacheEntries: 256,
      maxReplies: 5,
      maxRepliesOnRequest: 50,
      maxReplyChars: 280,
      ytDlpPath: 'yt-dlp'
    })
    expect(config.media).toEqual({
      watcher: 'gemini',
      embedWaitMs: 2000,
      watchTimeoutMs: 30_000,
      digestMaxOutputTokens: 3200,
      skimClips: 8,
      skimClipSeconds: 10,
      maxStreamedUploadBytes: 52_428_800,
      uploadTimeoutMs: 45_000
    })

    expect(config.jev.apiKey).toBeUndefined()
    expect(config.jev.model).toBe('jev-1.13.0')
    expect(config.jev.timeoutMs).toBe(1200)
    expect(config.jev.tone).toBe('on')
    expect(config.jev.referents).toBe('shadow')
    expect(config.jev.prefetch).toBe('shadow')
    expect(config.jev.prefetchMinNoul).toBe(0.7)
    expect(config.jev.prefetchWaitMs).toBe(4000)
    expect(config.jev.toneMinProbability).toBe(0.3)
    expect(config.jev.referentMinConfidence).toBe(0.8)

    // Memory
    expect(config.memory.bufferSize).toBe(30)
    expect(config.memory.contextSize).toBe(10)
    expect(config.memory.channelMonitorTtlMs).toBe(86_400_000)
    expect(config.memory.maxClaimsPerTurn).toBe(10)
    expect(config.memory.retrievalTokenBudget).toBe(350)
    expect(config.memory.guildFactsTokenBudget).toBe(150)
    expect(config.memory.recentParticipantLimit).toBe(3)
    expect(config.memory.speakerMinShare).toBe(0.5)
    expect(config.memory.maxActiveClaimsPerUser).toBe(20)
    expect(config.memory.stableClaimRetentionDays).toBe(180)
    expect(config.memory.claimRetentionDays).toBe(30)
    expect(config.memory.failedExtractionRetentionDays).toBe(7)
    expect(config.memory.transientClaimRetentionDays).toBe(14)
    expect(config.memory.deadClaimRetentionDays).toBe(30)
    expect(config.memory.salienceHalfLifeDays).toBe(30)
    expect(config.memory.recallCooldownMs).toBe(21_600_000)
    expect(config.memory).not.toHaveProperty('extractionInterval')
    expect(config.memory).not.toHaveProperty('extractionGapMs')
    expect(config.memory).not.toHaveProperty('maxFactsPerUser')
    expect(config.memory).not.toHaveProperty('factRetentionDays')
    expect(config.memory).not.toHaveProperty('extractionDailyBudgetRatio')
    expect(config.memory).not.toHaveProperty('perGuildGapMs')
    expect(config.memory).not.toHaveProperty('extractionQueueMaxPerGuild')
    expect(config.jev).not.toHaveProperty('extraction')
    expect(config.jev).not.toHaveProperty('backgroundTimeoutMs')
    expect(config.jev).not.toHaveProperty('extractionAdmitThreshold')
    expect(config.gemini).not.toHaveProperty('extractionRpmFloor')
    expect(config.gemini).not.toHaveProperty('extractionMaxRetries')
    expect(config.memory).not.toHaveProperty('extractionBatchSize')
    expect(config.memory.vaultExportDir).toBe('data/vault')
    expect(config.metrics.retentionDays).toBe(90)

    // Emoji
    expect(config.emoji.probability).toBe(0.33)
    expect(config.emoji.cooldownMs).toBe(180_000)

    // Reminders
    expect(config.reminders.checkIntervalMs).toBe(5_000)
    expect(config.reminders.maxPerUser).toBe(5)
    expect(config.reminders.staleThresholdMs).toBe(300_000)

    // Games
    expect(config.games.hangmanLives).toBe(6)
    expect(config.games.hangmanTimeoutMs).toBe(120_000)
    expect(config.games.shiritoriTimeoutMs).toBe(120_000)
    expect(config.games.shinyChance).toBe(0.01)

    // Status cycle
    expect(config.statusCycleMs).toBe(900_000)
    expect(config.updates).toEqual({ notify: true, repo: 'AlaskanTuna/Rokabot', checkIntervalHours: 24 })
    expect(await warningMessages()).toEqual([])
  })

  it.each([
    [0, 'Config value updates.checkIntervalHours must be >= 1, got: 0'],
    [169, 'Config value updates.checkIntervalHours must be <= 168, got: 169']
  ])('rejects updates.checkIntervalHours outside 1..168 (%s)', async (value, message) => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ updates: { checkIntervalHours: value } })

    await expect(() => import('../config.js')).rejects.toThrow(message)
  })

  it('rejects an updates.repo that is not owner/name', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ updates: { repo: 'https://github.com/AlaskanTuna/Rokabot' } })

    await expect(() => import('../config.js')).rejects.toThrow('updates.repo must be "owner/name"')
  })

  it('allows SOCIAL_POSTS_ENABLED to disable the feature', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SOCIAL_POSTS_ENABLED', 'false')

    const { config } = await import('../config.js')

    expect(config.socialPosts.enabled).toBe(false)
  })

  it('allows MEDIA_WATCHER to choose off', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEDIA_WATCHER', 'off')

    const { config } = await import('../config.js')

    expect(config.media.watcher).toBe('off')
  })

  it.each(['qwen', 'direct', 'openai'])('throws when MEDIA_WATCHER is %s and names the env key', async (watcher) => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEDIA_WATCHER', watcher)

    await expect(() => import('../config.js')).rejects.toThrow(
      `Environment variable MEDIA_WATCHER must be gemini or off, got: ${watcher}`
    )
  })

  it('exposes bounded episode memory settings', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config, NUMERIC_BOUNDS } = await import('../config.js')

    expect(config.memory.episodeLullMs).toBe(180_000)
    expect(config.memory.episodeMaxMessages).toBe(25)
    expect(config.memory.admitThreshold).toBe(0.5)
    expect(config.memory.verifyThreshold).toBe(0.5)
    expect(config.jev.memoryTimeoutMs).toBe(5_000)
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.episodeMaxMessages')?.max).toBe(
      config.memory.bufferSize - 3
    )
    expect(NUMERIC_BOUNDS.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'memory.episodeLullMs',
        'memory.episodeMaxMessages',
        'memory.admitThreshold',
        'memory.verifyThreshold',
        'jev.memoryTimeoutMs'
      ])
    )
  })

  it('loads separate main-model judge thresholds next to the Jev ones', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.memory.admitThreshold).toBe(0.5)
    expect(config.memory.verifyThreshold).toBe(0.5)
    expect(config.memory.modelAdmitThreshold).toBe(0.7)
    expect(config.memory.modelVerifyThreshold).toBe(0.7)
  })

  it('loads bounded summary thresholds next to the verify ones', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config, NUMERIC_BOUNDS } = await import('../config.js')

    expect(config.memory.summaryThreshold).toBe(0.5)
    expect(config.memory.modelSummaryThreshold).toBe(0.7)
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.summaryThreshold')).toMatchObject({ min: 0, max: 1 })
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.modelSummaryThreshold')).toMatchObject({
      min: 0,
      max: 1
    })
  })

  it('throws if memory.summaryThreshold exceeds 1 in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { summaryThreshold: 1.5 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.summaryThreshold must be <= 1, got: 1.5'
    )
  })

  it('throws if memory.modelSummaryThreshold exceeds 1 in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { modelSummaryThreshold: 1.5 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.modelSummaryThreshold must be <= 1, got: 1.5'
    )
  })

  it('throws if memory.modelVerifyThreshold exceeds 1 in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { modelVerifyThreshold: 1.5 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.modelVerifyThreshold must be <= 1, got: 1.5'
    )
  })

  it('judges memory with nothing on the legacy config without a TypeSafe key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.memory.judge).toBe('none')
  })

  it('judges memory with Jev whenever its key is set', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key')
    withYamlOverride({
      llm: { main: 'flash', models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } } }
    })

    const { config } = await import('../config.js')

    expect(config.memory.judge).toBe('jev')
  })

  it('judges memory with the main model on an llm block without a TypeSafe key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('LLM_MAIN', '')
    vi.stubEnv('LLM_FALLBACK', '')
    withYamlOverride({
      llm: { main: 'flash', models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } } }
    })

    const { config } = await import('../config.js')

    expect(config.memory.judge).toBe('model')
  })

  it('loads bounded episodic memory settings', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config, NUMERIC_BOUNDS } = await import('../config.js')

    expect(config.memory.episodeRecallK).toBe(3)
    expect(config.memory.episodeTokenBudget).toBe(200)
    expect(config.memory.episodeMinSimilarity).toBe(0.7)
    expect(config.memory.episodeRetentionDays).toBe(90)
    expect(config.memory.embeddingModel).toBe('gemini-embedding-2')
    expect(config.memory.embeddingTimeoutMs).toBe(1500)
    expect(config.memory.privacy).toBe('relaxed')
    expect(NUMERIC_BOUNDS.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'memory.episodeRecallK',
        'memory.episodeTokenBudget',
        'memory.episodeMinSimilarity',
        'memory.episodeRetentionDays',
        'memory.embeddingTimeoutMs'
      ])
    )
  })

  it('loads bounded watched-media memory settings', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config, NUMERIC_BOUNDS } = await import('../config.js')

    expect(config.memory.mediaRecallK).toBe(2)
    expect(config.memory.mediaTokenBudget).toBe(400)
    expect(config.memory.mediaMinSimilarity).toBe(0.7)
    expect(config.memory.mediaRetentionDays).toBe(90)
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.mediaRecallK')).toMatchObject({ min: 0, max: 5 })
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.mediaTokenBudget')).toMatchObject({ min: 100, max: 1500 })
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.mediaMinSimilarity')).toMatchObject({ min: 0, max: 1 })
    expect(NUMERIC_BOUNDS.find(({ path }) => path === 'memory.mediaRetentionDays')).toMatchObject({ min: 1, max: 365 })
  })

  it('loads bounded extraction sample settings and lets env vars override them', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const defaults = await import('../config.js')

    expect(defaults.config.memory.extractionSampleRate).toBe(0.1)
    expect(defaults.config.memory.extractionSampleDays).toBe(14)
    expect(defaults.NUMERIC_BOUNDS.find(({ path }) => path === 'memory.extractionSampleRate')).toMatchObject({
      min: 0,
      max: 1
    })
    expect(defaults.NUMERIC_BOUNDS.find(({ path }) => path === 'memory.extractionSampleDays')).toMatchObject({
      min: 1,
      max: 90
    })

    vi.resetModules()
    vi.stubEnv('MEMORY_EXTRACTION_SAMPLE_RATE', '0.25')
    vi.stubEnv('MEMORY_EXTRACTION_SAMPLE_DAYS', '7')
    const overridden = await import('../config.js')

    expect(overridden.config.memory.extractionSampleRate).toBe(0.25)
    expect(overridden.config.memory.extractionSampleDays).toBe(7)
  })

  it('loads the bounded reclassification cap and lets an env var override it', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const defaults = await import('../config.js')

    expect(defaults.config.memory.reclassifyMaxPerRun).toBe(20)
    expect(defaults.NUMERIC_BOUNDS.find(({ path }) => path === 'memory.reclassifyMaxPerRun')).toMatchObject({
      min: 0,
      max: 100
    })

    vi.resetModules()
    vi.stubEnv('MEMORY_RECLASSIFY_MAX_PER_RUN', '5')
    const overridden = await import('../config.js')

    expect(overridden.config.memory.reclassifyMaxPerRun).toBe(5)
  })

  it('env vars override config.yml values', async () => {
    setRequiredEnvVars()
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.stubEnv('RATE_LIMIT_RPM', '30')
    vi.stubEnv('RATE_LIMIT_RPD', '1000')
    vi.stubEnv('SESSION_TTL_MS', '600000')
    vi.stubEnv('SESSION_WINDOW_SIZE', '20')
    vi.stubEnv('GEMINI_MODEL', 'gemini-pro')
    vi.stubEnv('GEMINI_EXTRACTION_MODEL', 'gemini-extraction-pro')
    vi.stubEnv('GEMINI_TIMEOUT', '30000')
    vi.stubEnv('GEMINI_MAX_RETRIES', '3')
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '4')
    vi.stubEnv('GEMINI_RETRY_RPM_FLOOR', '5')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_BASE_MS', '1500')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_CAP_MS', '9000')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '90000')
    vi.stubEnv('GEMINI_SAFETY_THRESHOLD', 'BLOCK_ONLY_HIGH')
    vi.stubEnv('MODELSCOPE_API_KEY', 'modelscope-test-key')
    vi.stubEnv('FALLBACK_MODEL', 'Qwen/custom-fallback')
    vi.stubEnv('JEV_MODEL', 'jev-override')
    vi.stubEnv('JEV_TONE', 'on')
    vi.stubEnv('JEV_PREFETCH', 'on')
    vi.stubEnv('TYPESAFE_API_KEY', 'typesafe-test-key')
    vi.stubEnv('DISCORD_MAX_ATTACHMENT_BYTES_PER_TURN', '15728640')
    vi.stubEnv('MEMORY_BUFFER_SIZE', '40')
    vi.stubEnv('GEMINI_EXTRACTION_RPM_FLOOR', '6')
    vi.stubEnv('GEMINI_EXTRACTION_MAX_RETRIES', '2')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '30')
    vi.stubEnv('MEMORY_EXTRACTION_GAP_MS', '25000')
    vi.stubEnv('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO', '0.35')
    vi.stubEnv('MEMORY_PER_GUILD_GAP_MS', '30000')
    vi.stubEnv('MEMORY_EXTRACTION_QUEUE_MAX_PER_GUILD', '75')
    vi.stubEnv('MEMORY_MAX_CLAIMS_PER_TURN', '8')
    vi.stubEnv('MEMORY_RETRIEVAL_TOKEN_BUDGET', '300')
    vi.stubEnv('MEMORY_GUILD_FACTS_TOKEN_BUDGET', '220')
    vi.stubEnv('MEMORY_RECENT_PARTICIPANT_LIMIT', '2')
    vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '0.75')
    vi.stubEnv('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER', '25')
    vi.stubEnv('MEMORY_CLAIM_RETENTION_DAYS', '120')
    vi.stubEnv('MEMORY_VAULT_EXPORT_DIR', 'tmp/vault')
    vi.stubEnv('METRICS_RETENTION_DAYS', '120')
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3927')

    const { config } = await import('../config.js')

    expect(config.logging.level).toBe('debug')
    expect(config.rateLimit.rpm).toBe(30)
    expect(config.rateLimit.rpd).toBe(1000)
    expect(config.session.ttlMs).toBe(600_000)
    expect(config.session.windowSize).toBe(20)
    expect(config.gemini.model).toBe('gemini-pro')
    expect(config.gemini.extractionModel).toBe('gemini-extraction-pro')
    expect(config.gemini.timeout).toBe(30_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.gemini.liveMaxRetries).toBe(4)
    expect(config.fallback.apiKey).toBe('modelscope-test-key')
    expect(config.fallback.model).toBe('Qwen/custom-fallback')
    expect(config.gemini.retryRpmFloor).toBe(5)
    expect(config.gemini.retryBackoffBaseMs).toBe(1500)
    expect(config.gemini.retryBackoffCapMs).toBe(9000)
    expect(config.gemini.turnDeadlineMs).toBe(90_000)
    expect(config.gemini.safetyThreshold).toBe('BLOCK_ONLY_HIGH')
    expect(config.discord.maxAttachmentBytesPerTurn).toBe(15_728_640)
    expect(config.memory.bufferSize).toBe(40)
    expect(config.memory.maxClaimsPerTurn).toBe(8)
    expect(config.memory.retrievalTokenBudget).toBe(300)
    expect(config.memory.guildFactsTokenBudget).toBe(220)
    expect(config.memory.recentParticipantLimit).toBe(2)
    expect(config.memory.speakerMinShare).toBe(0.75)
    expect(config.memory.maxActiveClaimsPerUser).toBe(25)
    expect(config.memory.claimRetentionDays).toBe(120)
    expect(config.memory).not.toHaveProperty('extractionInterval')
    expect(config.memory).not.toHaveProperty('extractionGapMs')
    expect(config.memory).not.toHaveProperty('maxFactsPerUser')
    expect(config.memory).not.toHaveProperty('factRetentionDays')
    expect(config.memory).not.toHaveProperty('extractionDailyBudgetRatio')
    expect(config.memory).not.toHaveProperty('perGuildGapMs')
    expect(config.memory).not.toHaveProperty('extractionQueueMaxPerGuild')
    expect(config.jev).not.toHaveProperty('extraction')
    expect(config.jev).not.toHaveProperty('backgroundTimeoutMs')
    expect(config.jev).not.toHaveProperty('extractionAdmitThreshold')
    expect(config.gemini).not.toHaveProperty('extractionRpmFloor')
    expect(config.gemini).not.toHaveProperty('extractionMaxRetries')
    expect(config.memory).not.toHaveProperty('extractionBatchSize')
    expect(config.memory.vaultExportDir).toBe('tmp/vault')
    expect(config.metrics.retentionDays).toBe(120)
    expect(config.discord.maxMessageLength).toBe(3927)
    expect(config.jev.apiKey).toBe('typesafe-test-key')
    expect(config.jev.model).toBe('jev-override')
    expect(config.jev.tone).toBe('on')
    expect(config.jev.prefetch).toBe('on')
  })

  it('warns when the session TTL is shorter than the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '50000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toHaveLength(1)
  })

  it('warns when the turn deadline cannot reach all live retry attempts', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '10000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: expect.objectContaining({ turnDeadlineMs: 10_000, timeout: 20_000 }),
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('warns when the turn deadline is below the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '39999')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: expect.objectContaining({ turnDeadlineMs: 39_999, timeout: 20_000 }),
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('warns when the turn deadline leaves no room for all live retry attempts', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '40000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: expect.objectContaining({ turnDeadlineMs: 40_000, timeout: 20_000 }),
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('warns when the turn deadline is just below the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '62999')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: {
        turnDeadlineMs: 62_999,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('does not warn when the turn deadline equals the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '63000')

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('does not warn when configured live retries equal what the cumulative backoff cap can reach under minimum jitter', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '5')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '150000')

    await import('../config.js')

    expect(await warningMessages()).not.toContain(
      'Configured live retry count can never be reached because the cumulative backoff cap fires first'
    )
  })

  it('warns when configured live retries exceed what the cumulative backoff cap can reach under minimum jitter', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '6')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '150000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: {
        liveMaxRetries: 6,
        achievableRetries: 5,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000
      },
      message: 'Configured live retry count can never be reached because the cumulative backoff cap fires first'
    })
  })

  it('does not warn when the cumulative backoff cap makes the deadline sufficient', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '4')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '112000')

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('does not warn about retry reachability or deadline at shipped defaults', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('warns when the attempt-count budget exceeds the turn deadline', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '50000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: {
        turnDeadlineMs: 50_000,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('warns when the backoff budget exceeds the turn deadline', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '61000')

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: {
        turnDeadlineMs: 61_000,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      message:
        'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    })
  })

  it('does not warn when the session TTL exceeds the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '120000')

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('warns when a reminder can be swept stale before a scheduler tick can deliver it', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 4000 } })

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: { staleThresholdMs: 4000, checkIntervalMs: 5000 },
      message: 'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
    })
  })

  it('warns when a reminder stale threshold equals the scheduler interval', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 5000 } })

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: { staleThresholdMs: 5000, checkIntervalMs: 5000 },
      message: 'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
    })
  })

  it('does not warn when a reminder stale threshold exceeds the scheduler interval by 1ms', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 5001 } })

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('warns when values above the memory buffer size are silently ineffective', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { contextSize: 31 } })

    const { startupWarnings } = await import('../config.js')

    expect(startupWarnings).toContainEqual({
      fields: { contextSize: 31, bufferSize: 30 },
      message: 'Memory context size above passive buffer size is silently ineffective'
    })
  })

  it('does not warn when the memory context size equals the buffer size', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { contextSize: 30 } })

    await import('../config.js')

    expect(await warningMessages()).toEqual([])
  })

  it('throws if env int override is non-numeric', async () => {
    setRequiredEnvVars()
    vi.stubEnv('RATE_LIMIT_RPM', 'not-a-number')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable RATE_LIMIT_RPM must be a number, got: not-a-number'
    )
  })

  // `maxTokensPerMinute` takes its floor from `maxAttachmentTokens`, so the two ceilings are not independent:
  // an attachment ceiling above the per-minute one leaves that knob with no legal value at all. Before this
  // was pinned, 200,000 was a legal attachment ceiling and the failure surfaced as a complaint about
  // `maxTokensPerMinute` being below a floor the operator never set — the wrong knob named for the right
  // contradiction.
  it('refuses an attachment ceiling no per-minute budget could satisfy, and names the knob at fault', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_MAX_ATTACHMENT_TOKENS', '200000')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value gemini.maxAttachmentTokens must be <= 125000, got: 200000'
    )
  })

  // States the dependency the two ceilings have, which nothing else does. A generic "floor <= ceiling" check
  // would not help: any row whose floor exceeds its own ceiling makes its own value illegal too, so it
  // already throws at load. This one is different precisely because it is satisfiable at defaults and only
  // becomes unsatisfiable at a setting an operator is allowed to choose.
  it('keeps the attachment ceiling inside what a per-minute budget can be set to', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { NUMERIC_BOUNDS } = await import('../config.js')
    const attachment = NUMERIC_BOUNDS.find((bound) => bound.path === 'gemini.maxAttachmentTokens')
    const perMinute = NUMERIC_BOUNDS.find((bound) => bound.path === 'gemini.maxTokensPerMinute')

    expect(attachment?.max).toBeLessThanOrEqual(perMinute?.max ?? Number.POSITIVE_INFINITY)
  })

  it('throws if a min:1 numeric tunable is set to a negative value', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TIMEOUT', '-5000')

    await expect(() => import('../config.js')).rejects.toThrow('Config value gemini.timeout must be >= 1, got: -5000')
  })

  it('throws if a min:1 numeric tunable is set to zero', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TIMEOUT', '0')

    await expect(() => import('../config.js')).rejects.toThrow('Config value gemini.timeout must be >= 1, got: 0')
  })

  it('accepts a min:1 numeric tunable at exactly the boundary', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TIMEOUT', '1')

    const { config } = await import('../config.js')

    expect(config.gemini.timeout).toBe(1)
  })

  it('accepts zero for a min:0 numeric tunable', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_MAX_RETRIES', '0')

    const { config } = await import('../config.js')

    expect(config.gemini.maxRetries).toBe(0)
  })

  it('accepts zero for the guild facts token budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_GUILD_FACTS_TOKEN_BUDGET', '0')

    const { config } = await import('../config.js')

    expect(config.memory.guildFactsTokenBudget).toBe(0)
  })

  it('throws if an env int override uses underscore digit grouping', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TIMEOUT', '20_000')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable GEMINI_TIMEOUT must be a number, got: 20_000'
    )
  })

  it('accepts a well-formed integer env override', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TIMEOUT', '20000')

    const { config } = await import('../config.js')

    expect(config.gemini.timeout).toBe(20000)
  })

  it('throws if DISCORD_MAX_MESSAGE_LENGTH exceeds the tool-footer-adjusted maximum', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3928')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value discord.maxMessageLength must be <= 3927, got: 3928'
    )
  })

  it('accepts DISCORD_MAX_MESSAGE_LENGTH at exactly the tool-footer-adjusted maximum', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3927')

    const { config } = await import('../config.js')

    expect(config.discord.maxMessageLength).toBe(3927)
  })

  // The minimum stays derived from the known per-image Gemini charge and the ten-file turn count.
  it('floors the attachment ceiling at a full turn of images', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { MAX_ATTACHMENTS } = await import('../agent/media/mediaRules.js')
    const { GEMINI_IMAGE_TOKENS } = await import('../agent/media/imageProcessor.js')
    const { NUMERIC_BOUNDS } = await import('../config.js')

    expect(NUMERIC_BOUNDS.find((entry) => entry.path === 'gemini.maxAttachmentTokens')?.min).toBe(
      MAX_ATTACHMENTS * GEMINI_IMAGE_TOKENS
    )
  })

  it('bounds a turn by one file minimum and lets the global budget admit its configured maximum', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { MAX_DOCUMENT_SIZE_BYTES } = await import('../agent/media/attachmentLimits.js')
    const { NUMERIC_BOUNDS } = await import('../config.js')
    const perTurn = NUMERIC_BOUNDS.find((entry) => entry.path === 'discord.maxAttachmentBytesPerTurn')
    const inFlight = NUMERIC_BOUNDS.find((entry) => entry.path === 'discord.maxInFlightAttachmentBytes')

    expect(perTurn).toMatchObject({ min: MAX_DOCUMENT_SIZE_BYTES, max: 31_457_280 })
    expect(inFlight?.min).toBe(perTurn?.max)
  })

  it('bounds every numeric tunable, env-overridable or yaml-only', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const EXPECTED_BOUNDS: ReadonlyArray<{ path: string; min: number; max?: number }> = [
      { path: 'gemini.timeout', min: 1 },
      { path: 'socialPosts.maxLookupsPerTurn', min: 1, max: 1 },
      { path: 'socialPosts.timeoutMs', min: 1, max: 30_000 },
      { path: 'socialPosts.maxTextChars', min: 1, max: 10_000 },
      { path: 'socialPosts.cacheTtlMs', min: 0 },
      { path: 'socialPosts.maxCacheEntries', min: 1, max: 10_000 },
      { path: 'socialPosts.maxReplies', min: 1, max: 10 },
      { path: 'socialPosts.maxRepliesOnRequest', min: 1, max: 50 },
      { path: 'socialPosts.maxReplyChars', min: 40, max: 1000 },
      { path: 'media.embedWaitMs', min: 0, max: 5000 },
      { path: 'media.watchTimeoutMs', min: 5000, max: 60_000 },
      { path: 'media.digestMaxOutputTokens', min: 400, max: 4000 },
      { path: 'media.skimClips', min: 3, max: 9 },
      { path: 'media.skimClipSeconds', min: 2, max: 30 },
      { path: 'media.maxStreamedUploadBytes', min: 10_485_760, max: 104_857_600 },
      { path: 'media.uploadTimeoutMs', min: 10_000, max: 120_000 },
      { path: 'fallback.timeoutMs', min: 1 },
      { path: 'fallback.stickyMs', min: 0 },
      // Kept literal as a drift guard alongside the derived assertion above: ten images cost 10,890 Gemini tokens.
      { path: 'gemini.maxAttachmentTokens', min: 10_890, max: 125_000 },
      { path: 'gemini.maxTokensPerMinute', min: 125_000, max: 125_000 },
      { path: 'gemini.maxOutputTokens', min: 1 },
      { path: 'jev.timeoutMs', min: 1 },
      { path: 'jev.memoryTimeoutMs', min: 1 },
      { path: 'jev.toneMinProbability', min: 0, max: 1 },
      { path: 'jev.prefetchMinNoul', min: 0, max: 1 },
      { path: 'jev.prefetchWaitMs', min: 0 },
      { path: 'jev.referentMinConfidence', min: 0, max: 1 },
      { path: 'memory.admitThreshold', min: 0, max: 1 },
      { path: 'memory.verifyThreshold', min: 0, max: 1 },
      { path: 'memory.summaryThreshold', min: 0, max: 1 },
      { path: 'memory.modelAdmitThreshold', min: 0, max: 1 },
      { path: 'memory.modelVerifyThreshold', min: 0, max: 1 },
      { path: 'memory.modelSummaryThreshold', min: 0, max: 1 },
      { path: 'gemini.turnDeadlineMs', min: 1 },
      { path: 'gemini.retryBackoffCapMs', min: 1 },
      { path: 'gemini.maxRetries', min: 0 },
      { path: 'gemini.liveMaxRetries', min: 0 },
      { path: 'gemini.retryBackoffBaseMs', min: 0 },
      { path: 'gemini.retryRpmFloor', min: 0 },
      { path: 'gemini.maxLlmCalls', min: 1 },
      { path: 'gemini.hedgeAfterMs', min: 0 },
      { path: 'rateLimit.rpm', min: 4 },
      { path: 'rateLimit.rpd', min: 1 },
      { path: 'llm.modelscopeDailyMagicubes', min: 1 },
      { path: 'session.ttlMs', min: 1 },
      { path: 'session.windowSize', min: 1 },
      { path: 'session.maxRehydrationAge', min: 0 },
      { path: 'session.historyRetentionDays', min: 1 },
      { path: 'discord.maxMessageLength', min: 1, max: 3927 },
      { path: 'discord.maxAttachmentBytesPerTurn', min: 10_485_760, max: 31_457_280 },
      { path: 'discord.maxInFlightAttachmentBytes', min: 31_457_280 },
      { path: 'embeddings.timeoutMs', min: 1 },
      { path: 'embeddings.backfillBatchSize', min: 1, max: 100_000 },
      { path: 'embeddings.backfillGapMs', min: 0, max: 60_000 },
      { path: 'memory.bufferSize', min: 1 },
      { path: 'memory.contextSize', min: 1 },
      { path: 'memory.channelMonitorTtlMs', min: 1 },
      { path: 'memory.maxClaimsPerTurn', min: 1 },
      { path: 'memory.retrievalTokenBudget', min: 1 },
      { path: 'memory.guildFactsTokenBudget', min: 0 },
      { path: 'memory.recentParticipantLimit', min: 1 },
      { path: 'memory.speakerMinShare', min: 0, max: 1 },
      { path: 'memory.maxActiveClaimsPerUser', min: 1 },
      { path: 'memory.stableClaimRetentionDays', min: 1 },
      { path: 'memory.claimRetentionDays', min: 1 },
      { path: 'memory.failedExtractionRetentionDays', min: 1 },
      { path: 'memory.transientClaimRetentionDays', min: 1 },
      { path: 'memory.deadClaimRetentionDays', min: 1 },
      { path: 'memory.salienceHalfLifeDays', min: 1 },
      { path: 'memory.recallCooldownMs', min: 0 },
      { path: 'memory.episodeLullMs', min: 1 },
      { path: 'memory.episodeMaxMessages', min: 1, max: 27 },
      { path: 'memory.episodeRecallK', min: 1, max: 10 },
      { path: 'memory.episodeTokenBudget', min: 1 },
      { path: 'memory.episodeMinSimilarity', min: 0, max: 1 },
      { path: 'memory.episodeRetentionDays', min: 1 },
      { path: 'memory.mediaRecallK', min: 0, max: 5 },
      { path: 'memory.mediaTokenBudget', min: 100, max: 1500 },
      { path: 'memory.mediaMinSimilarity', min: 0, max: 1 },
      { path: 'memory.mediaRetentionDays', min: 1, max: 365 },
      { path: 'memory.embeddingTimeoutMs', min: 1 },
      { path: 'memory.extractionSampleRate', min: 0, max: 1 },
      { path: 'memory.extractionSampleDays', min: 1, max: 90 },
      { path: 'memory.reclassifyMaxPerRun', min: 0, max: 100 },
      { path: 'metrics.diagnosticsRetentionHours', min: 1 },
      { path: 'metrics.retentionDays', min: 1 },
      { path: 'report.historyMaxAgeMs', min: 0 },
      { path: 'report.historyMessages', min: 1 },
      { path: 'report.maxAttachmentBytes', min: 1 },
      { path: 'report.maxPerUserPerHour', min: 1 },
      { path: 'emoji.probability', min: 0, max: 1 },
      { path: 'emoji.cooldownMs', min: 0 },
      { path: 'reminders.checkIntervalMs', min: 1 },
      { path: 'reminders.maxPerUser', min: 1 },
      { path: 'reminders.staleThresholdMs', min: 1 },
      { path: 'games.hangmanLives', min: 1 },
      { path: 'games.hangmanTimeoutMs', min: 1 },
      { path: 'games.shiritoriTimeoutMs', min: 1 },
      { path: 'games.shinyChance', min: 0, max: 1 },
      { path: 'statusCycleMs', min: 1 },
      { path: 'updates.checkIntervalHours', min: 1, max: 168 },
      { path: 'llm.hedgeAfterMs', min: 0 },
      { path: 'llm.stickyMs', min: 0 },
      { path: 'search.nativeTimeoutMs', min: 2000, max: 60_000 },
      { path: 'search.nativeReserveMs', min: 0, max: 60_000 },
      { path: 'format.minListItems', min: 2, max: 5 },
      { path: 'format.minListShare', min: 0, max: 1 },
      { path: 'format.wordSlack', min: 0, max: 1 }
    ]

    const { NUMERIC_BOUNDS } = await import('../config.js')

    expect(NUMERIC_BOUNDS.map((bound) => bound.path).sort()).toEqual(EXPECTED_BOUNDS.map((bound) => bound.path).sort())
    for (const expected of EXPECTED_BOUNDS) {
      const actual = NUMERIC_BOUNDS.find((bound) => bound.path === expected.path)
      expect(actual?.min).toBe(expected.min)
      expect(actual?.max).toBe(expected.max)
    }
  })

  it('throws when an env Jev mode is invalid and names the env key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('JEV_TONE', 'fast')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable JEV_TONE must be off, shadow or on, got: fast'
    )
  })

  it('reads memory privacy from env', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_PRIVACY', 'balanced')
    vi.stubEnv('MEMORY_FAILED_EXTRACTION_RETENTION_DAYS', '21')

    const { config } = await import('../config.js')

    expect(config.memory.privacy).toBe('balanced')
    expect(config.memory.failedExtractionRetentionDays).toBe(21)
  })

  it('throws when the env memory privacy level is invalid and names the env key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_PRIVACY', 'paranoid')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable MEMORY_PRIVACY must be relaxed, balanced, strict or off, got: paranoid'
    )
  })

  it('ignores removed recall keys left in a deployed config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({
      memory: {
        recall: 'shadow',
        recallTokenBudget: 600,
        recallCoreFacts: 3,
        recallGateDeadlineMs: 1200,
        factMinSimilarity: 0.65,
        serverFactMinSimilarity: 0.65
      }
    })

    const { config } = await import('../config.js')

    expect(config.memory.privacy).toBe('relaxed')
    expect('recall' in config.memory).toBe(false)
  })

  it('throws when the env prefetch mode is invalid and names the env key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('JEV_PREFETCH', 'fast')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable JEV_PREFETCH must be off, shadow or on, got: fast'
    )
  })

  it('throws when a YAML Jev mode is invalid and names the config key', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ jev: { referents: 'fast' } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value jev.referents must be off, shadow or on, got: fast'
    )
  })

  it('throws if a Jev tone probability threshold exceeds 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ jev: { toneMinProbability: 1.1 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value jev.toneMinProbability must be <= 1, got: 1.1'
    )
  })

  it('throws if jev.prefetchMinNoul exceeds 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ jev: { prefetchMinNoul: 1.1 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value jev.prefetchMinNoul must be <= 1, got: 1.1'
    )
  })

  it('throws if jev.prefetchWaitMs is negative', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ jev: { prefetchWaitMs: -1 } })

    await expect(() => import('../config.js')).rejects.toThrow('Config value jev.prefetchWaitMs must be >= 0, got: -1')
  })

  it('throws if memory.speakerMinShare exceeds 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '2.5')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.speakerMinShare must be <= 1, got: 2.5'
    )
  })

  it('throws if statusCycleMs is set to zero in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ statusCycleMs: 0 })

    await expect(() => import('../config.js')).rejects.toThrow('Config value statusCycleMs must be >= 1, got: 0')
  })

  it('throws if session.historyRetentionDays is set to zero in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ session: { historyRetentionDays: 0 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value session.historyRetentionDays must be >= 1, got: 0'
    )
  })

  it('throws if emoji.probability exceeds 1 in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ emoji: { probability: 1.5 } })

    await expect(() => import('../config.js')).rejects.toThrow('Config value emoji.probability must be <= 1, got: 1.5')
  })

  it('loads when session.maxRehydrationAge is set to zero in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ session: { maxRehydrationAge: 0 } })

    const { config } = await import('../config.js')

    expect(config.session.maxRehydrationAge).toBe(0)
  })

  it('loads when games.hangmanLives is set to exactly the min:1 boundary in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ games: { hangmanLives: 1 } })

    const { config } = await import('../config.js')

    expect(config.games.hangmanLives).toBe(1)
  })

  it('throws if games.hangmanLives is a quoted string in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ games: { hangmanLives: '6' } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value games.hangmanLives must be a finite number, got: 6 (string)'
    )
  })

  it('throws if statusCycleMs is .nan in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ statusCycleMs: Number.NaN })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value statusCycleMs must be a finite number, got: NaN (number)'
    )
  })

  it('synthesises the Gemini main and no fallback when config.yml has no llm block', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.llm).toMatchObject({
      main: {
        key: 'legacy-gemini',
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        apiKey: 'test-api-key',
        timeoutMs: 20_000,
        maxOutputTokens: 500
      },
      fallback: null,
      hedgeAfterMs: 5000,
      stickyMs: 300_000,
      monthlyBudgetUsd: {}
    })
    expect(config.llm.main.profile).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      verified: true
    })
    expect(config.llm.main.effort).toBeUndefined()
  })

  it('synthesises the ModelScope fallback when MODELSCOPE_API_KEY is set', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')

    const { config } = await import('../config.js')

    expect(config.llm.fallback).toMatchObject({
      key: 'legacy-fallback',
      provider: 'modelscope',
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'test-modelscope-key',
      baseUrl: 'https://api-inference.modelscope.ai/v1',
      timeoutMs: 15_000
    })
    expect(config.llm.fallback?.profile.verified).toBe(true)
  })

  it('carries the existing env overrides into the legacy route, untested model ids included', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')
    vi.stubEnv('GEMINI_MODEL', 'gemini-legacy-test')
    vi.stubEnv('FALLBACK_MODEL', 'Qwen/legacy-test')
    vi.stubEnv('GEMINI_TIMEOUT', '12345')
    vi.stubEnv('GEMINI_HEDGE_AFTER_MS', '0')
    withYamlOverride({ fallback: { stickyMs: 0, timeoutMs: 9000 } })

    const { config } = await import('../config.js')

    expect(config.llm.main).toMatchObject({
      model: 'gemini-legacy-test',
      timeoutMs: 12_345,
      profile: { provider: 'gemini', model: 'gemini-legacy-test' }
    })
    expect(config.llm.fallback).toMatchObject({
      model: 'Qwen/legacy-test',
      timeoutMs: 9000,
      profile: { provider: 'modelscope', model: 'Qwen/legacy-test' }
    })
    expect(config.llm).toMatchObject({ hedgeAfterMs: 0, stickyMs: 0 })
  })

  it('starts on the shipped config.yml, llm block included, once its providers have keys', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ROKABOT_CONFIG_PATH', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    const { readFileSync } = await import('node:fs')
    const { load } = await import('js-yaml')
    const shipped = load(readFileSync('config.yml', 'utf8')) as { llm?: { main: string; fallback?: string | null } }

    const { config } = await import('../config.js')

    expect(config.llm.main.key).toBe(shipped.llm?.main ?? 'legacy-gemini')
    expect(config.llm.fallback?.key ?? null).toBe(shipped.llm ? (shipped.llm.fallback ?? null) : 'legacy-fallback')
  })

  const HAIKU_LLM = {
    main: 'haiku',
    models: {
      flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' }
    }
  }

  it('resolves an anthropic main from the llm block with the paid-route defaults', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    withYamlOverride({ llm: HAIKU_LLM })

    const { config } = await import('../config.js')

    expect(config.llm).toMatchObject({
      main: {
        key: 'haiku',
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        apiKey: 'test-anthropic-key',
        effort: 'low',
        timeoutMs: 20_000,
        maxOutputTokens: 500
      },
      fallback: null,
      hedgeAfterMs: 0,
      stickyMs: 300_000
    })
    expect(config.llm.monthlyBudgetUsd).toEqual({ anthropic: 5, openai: 5 })
  })

  it('resolves a fallback, per-model settings and block tunables', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    withYamlOverride({
      llm: {
        ...HAIKU_LLM,
        fallback: 'flash',
        hedgeAfterMs: 2500,
        stickyMs: 60_000,
        monthlyBudgetUsd: { anthropic: 2 },
        models: {
          ...HAIKU_LLM.models,
          haiku: { ...HAIKU_LLM.models.haiku, timeoutMs: 9000, maxOutputTokens: 800, limits: { rpm: 50 } }
        }
      }
    })

    const { config } = await import('../config.js')

    expect(config.llm.main).toMatchObject({ timeoutMs: 9000, maxOutputTokens: 800, limits: { rpm: 50 } })
    expect(config.llm.fallback).toMatchObject({
      key: 'flash',
      provider: 'gemini',
      apiKey: 'test-api-key',
      timeoutMs: 20_000
    })
    expect(config.llm).toMatchObject({ hedgeAfterMs: 2500, stickyMs: 60_000 })
    expect(config.llm.monthlyBudgetUsd).toEqual({ anthropic: 2 })
  })

  it('lets LLM_MAIN and LLM_FALLBACK override the block', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('LLM_MAIN', 'flash')
    vi.stubEnv('LLM_FALLBACK', 'haiku')
    withYamlOverride({ llm: HAIKU_LLM })

    const { config } = await import('../config.js')

    expect(config.llm.main.key).toBe('flash')
    expect(config.llm.fallback?.key).toBe('haiku')
  })

  it('disables a block fallback with LLM_FALLBACK=none', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('LLM_FALLBACK', 'none')
    withYamlOverride({ llm: { ...HAIKU_LLM, fallback: 'flash' } })

    const { config } = await import('../config.js')

    expect(config.llm.fallback).toBeNull()
  })

  it('disables the synthesised fallback with LLM_FALLBACK=none and no llm block', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MODELSCOPE_API_KEY', 'test-modelscope-key')
    vi.stubEnv('LLM_FALLBACK', 'none')

    const { config } = await import('../config.js')

    expect(config.llm.main.key).toBe('legacy-gemini')
    expect(config.llm.fallback).toBeNull()
  })

  it.each([
    ['LLM_MAIN', 'Environment variable LLM_MAIN needs an llm: block in config.yml, got: haiku'],
    ['LLM_FALLBACK', 'Environment variable LLM_FALLBACK needs an llm: block in config.yml, got: haiku']
  ] as const)('rejects %s without an llm block', async (key, message) => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv(key, 'haiku')

    await expect(() => import('../config.js')).rejects.toThrow(message)
  })

  it.each([
    [
      'an llm block without main',
      { models: HAIKU_LLM.models },
      {},
      'Config value llm.main is required when config.yml has an llm: block'
    ],
    [
      'a main that names no model',
      { ...HAIKU_LLM, main: 'nope' },
      {},
      'Config value llm.main must name a key under llm.models, got: nope'
    ],
    [
      'an LLM_MAIN that names no model',
      HAIKU_LLM,
      { LLM_MAIN: 'nope' },
      'Environment variable LLM_MAIN must name a key under llm.models, got: nope'
    ],
    [
      'a fallback that names no model',
      { ...HAIKU_LLM, fallback: 'nope' },
      {},
      'Config value llm.fallback must name a key under llm.models, got: nope'
    ],
    [
      'an unknown provider',
      { main: 'haiku', models: { haiku: { provider: 'mistral', model: 'x' } } },
      {},
      'Config value llm.models.haiku.provider must be gemini, anthropic, openai, modelscope or openai-compatible, got: mistral'
    ],
    [
      'a model with no tested profile',
      { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-4-5' } } },
      {},
      'Config value llm.models.haiku.model has no tested anthropic profile, got: claude-haiku-4-5'
    ],
    [
      'an effort the profile does not take',
      { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'turbo' } } },
      {},
      'Config value llm.models.haiku.effort must be one of none, low, medium, high, xhigh, max, got: turbo'
    ],
    [
      'an effort on a model that takes none',
      { main: 'flash', models: { flash: { provider: 'gemini', model: 'gemini-3.5-flash-lite', effort: 'low' } } },
      {},
      'Config value llm.models.flash.effort is not accepted by gemini-3.5-flash-lite, got: low'
    ],
    [
      'a missing Anthropic key',
      HAIKU_LLM,
      { ANTHROPIC_API_KEY: '' },
      'Missing required environment variable: ANTHROPIC_API_KEY (llm.main uses anthropic)'
    ],
    [
      'a missing ModelScope key for the fallback',
      {
        ...HAIKU_LLM,
        fallback: 'qwen',
        models: { ...HAIKU_LLM.models, qwen: { provider: 'modelscope', model: 'Qwen/Qwen3.5-122B-A10B' } }
      },
      { MODELSCOPE_API_KEY: '' },
      'Missing required environment variable: MODELSCOPE_API_KEY (llm.fallback uses modelscope)'
    ],
    [
      'a timeout below one',
      { main: 'haiku', models: { haiku: { ...HAIKU_LLM.models.haiku, timeoutMs: 0 } } },
      {},
      'Config value llm.main.timeoutMs must be >= 1, got: 0'
    ],
    [
      'an output cap above the profile',
      { main: 'haiku', models: { haiku: { ...HAIKU_LLM.models.haiku, maxOutputTokens: 200_000 } } },
      {},
      'Config value llm.main.maxOutputTokens must be <= 128000, got: 200000'
    ],
    [
      'a negative monthly budget',
      { ...HAIKU_LLM, monthlyBudgetUsd: { anthropic: -1 } },
      {},
      'Config value llm.monthlyBudgetUsd.anthropic must be >= 0, got: -1'
    ],
    [
      'a negative hedge delay',
      { ...HAIKU_LLM, hedgeAfterMs: -5 },
      {},
      'Config value llm.hedgeAfterMs must be >= 0, got: -5'
    ]
  ] as const)('stops startup with one clear message for %s', async (_name, llm, env, message) => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    withYamlOverride({ llm })

    await expect(() => import('../config.js')).rejects.toThrow(message)
  })

  it('rejects an untested candidate profile as main', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.doMock('../agent/llm/profiles.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../agent/llm/profiles.js')>()
      const candidate = {
        ...actual.profileFor('anthropic', 'claude-haiku-5-5')!,
        model: 'claude-candidate',
        verified: false
      }
      return {
        ...actual,
        MODEL_PROFILES: [...actual.MODEL_PROFILES, candidate],
        profileFor: (provider: Parameters<typeof actual.profileFor>[0], model: string) =>
          provider === 'anthropic' && model === 'claude-candidate' ? candidate : actual.profileFor(provider, model)
      }
    })
    withYamlOverride({ llm: { main: 'cand', models: { cand: { provider: 'anthropic', model: 'claude-candidate' } } } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value llm.models.cand.model claude-candidate is an untested candidate and cannot be llm.main'
    )
  })

  const ANTHROPIC_ONLY = {
    llm: {
      main: 'haiku',
      fallback: null,
      models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' } }
    },
    media: { watcher: 'off' }
  }

  function setAnthropicOnlyEnv() {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('LLM_MAIN', '')
    vi.stubEnv('LLM_FALLBACK', '')
  }

  it('needs GEMINI_API_KEY only when a role calls Gemini', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    const { geminiKeyRequired } = await import('../config.js')
    const none = { main: 'anthropic', fallback: null, embeddings: 'local', watcher: 'off' } as const

    expect(geminiKeyRequired(none)).toBe(false)
    expect(geminiKeyRequired({ ...none, main: 'gemini' })).toBe(true)
    expect(geminiKeyRequired({ ...none, fallback: 'gemini' })).toBe(true)
    expect(geminiKeyRequired({ ...none, embeddings: 'gemini' })).toBe(true)
    expect(geminiKeyRequired({ ...none, watcher: 'gemini' })).toBe(true)
  })

  it('starts an Anthropic-only config without GEMINI_API_KEY', async () => {
    setAnthropicOnlyEnv()
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'local')
    withYamlOverride(ANTHROPIC_ONLY)

    const { config } = await import('../config.js')

    expect(config.gemini.apiKey).toBe('')
  })

  it('requires GEMINI_API_KEY when only the media watcher uses Gemini', async () => {
    setAnthropicOnlyEnv()
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'local')
    withYamlOverride({ ...ANTHROPIC_ONLY, media: { watcher: 'gemini' } })

    await expect(() => import('../config.js')).rejects.toThrow('Missing required environment variable: GEMINI_API_KEY')
  })

  it('requires GEMINI_API_KEY for the legacy Gemini main alone', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'local')
    vi.stubEnv('MEDIA_WATCHER', 'off')

    await expect(() => import('../config.js')).rejects.toThrow(
      /^Missing required environment variable: GEMINI_API_KEY$/
    )
  })

  it('judges memory with Jev on the legacy config whenever its key is set', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('TYPESAFE_API_KEY', 'test-typesafe-key')

    const { config } = await import('../config.js')

    expect(config.memory.judge).toBe('jev')
  })

  // 34
  it('validates format bounds, rejects unknown format.mode, and allows FORMAT_MODE override', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('FORMAT_MODE', 'shadow')

    const { config } = await import('../config.js')
    expect(config.format).toEqual({
      mode: 'shadow',
      repair: 'reformat',
      minListItems: 3,
      minListShare: 0.5,
      wordSlack: 0.1
    })

    vi.resetModules()
    clearTunableEnvVars()
    vi.stubEnv('FORMAT_MODE', 'bogus')
    await expect(() => import('../config.js')).rejects.toThrow('FORMAT_MODE must be off, shadow or on')

    vi.resetModules()
    clearTunableEnvVars()
    withYamlOverride({ format: { minListShare: 1.5 } })
    await expect(() => import('../config.js')).rejects.toThrow('format.minListShare')
  })
})
