import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('config module', () => {
  const warn = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    warn.mockReset()
    vi.doMock('../utils/logger.js', () => ({ logger: { warn } }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('../utils/logger.js')
  })

  function setRequiredEnvVars() {
    vi.stubEnv('DISCORD_TOKEN', 'test-token')
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key')
  }

  /** Clear any env overrides that dotenv may have loaded from .env */
  function clearTunableEnvVars() {
    vi.stubEnv('LOG_LEVEL', '')
    vi.stubEnv('RATE_LIMIT_RPM', '')
    vi.stubEnv('RATE_LIMIT_RPD', '')
    vi.stubEnv('SESSION_TTL_MS', '')
    vi.stubEnv('SESSION_WINDOW_SIZE', '')
    vi.stubEnv('GEMINI_MODEL', '')
    vi.stubEnv('GEMINI_EXTRACTION_MODEL', '')
    vi.stubEnv('GEMINI_TIMEOUT', '')
    vi.stubEnv('GEMINI_MAX_RETRIES', '')
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '')
    vi.stubEnv('GEMINI_RETRY_RPM_FLOOR', '')
    vi.stubEnv('GEMINI_EXTRACTION_RPM_FLOOR', '')
    vi.stubEnv('GEMINI_EXTRACTION_MAX_RETRIES', '')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_BASE_MS', '')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_CAP_MS', '')
    vi.stubEnv('MEMORY_BUFFER_SIZE', '')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '')
    vi.stubEnv('MEMORY_EXTRACTION_GAP_MS', '')
    vi.stubEnv('MEMORY_CLAIMS_BACKEND', '')
    vi.stubEnv('MEMORY_MAX_CLAIMS_PER_TURN', '')
    vi.stubEnv('MEMORY_RETRIEVAL_TOKEN_BUDGET', '')
    vi.stubEnv('MEMORY_RECENT_PARTICIPANT_LIMIT', '')
    vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '')
    vi.stubEnv('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER', '')
    vi.stubEnv('MEMORY_CLAIM_RETENTION_DAYS', '')
    vi.stubEnv('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO', '')
    vi.stubEnv('MEMORY_PER_GUILD_GAP_MS', '')
    vi.stubEnv('MEMORY_EXTRACTION_QUEUE_MAX_PER_GUILD', '')
    vi.stubEnv('MEMORY_VAULT_EXPORT_DIR', '')
    vi.stubEnv('METRICS_RETENTION_DAYS', '')
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '')
  }

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

  it('loads defaults from config.yml when no env overrides set', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { config } = await import('../config.js')

    expect(config.gemini.model).toBe('gemini-3.5-flash-lite')
    expect(config.gemini.extractionModel).toBe(config.gemini.model)
    expect(config.gemini.timeout).toBe(45_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.gemini.maxOutputTokens).toBe(500)
    expect(config.gemini.baseRetryDelay).toBe(2000)
    expect(config.gemini.maxLlmCalls).toBe(4)
    expect(config.gemini.liveMaxRetries).toBe(2)
    expect(config.gemini.retryRpmFloor).toBe(2)
    expect(config.gemini.extractionRpmFloor).toBe(3)
    expect(config.gemini.extractionMaxRetries).toBe(1)
    expect(config.gemini.retryBackoffBaseMs).toBe(1000)
    expect(config.gemini.retryBackoffCapMs).toBe(12_000)
    expect(config.logging.level).toBe('info')
    expect(config.rateLimit.rpm).toBe(15)
    expect(config.rateLimit.rpd).toBe(500)
    expect(config.session.ttlMs).toBe(500_000)
    expect(config.session.windowSize).toBe(20)
    expect(config.session.maxRehydrationAge).toBe(7_200_000)
    expect(config.session.historyRetentionDays).toBe(7)
    expect(config.discord.maxMessageLength).toBe(1500)

    // Memory
    expect(config.memory.bufferSize).toBe(30)
    expect(config.memory.contextSize).toBe(10)
    expect(config.memory.extractionInterval).toBe(20)
    expect(config.memory.extractionGapMs).toBe(20_000)
    expect(config.memory.maxFactsPerUser).toBe(20)
    expect(config.memory.factRetentionDays).toBe(14)
    expect(config.memory.channelMonitorTtlMs).toBe(86_400_000)
    expect(config.memory.claimsBackend).toBe(false)
    expect(config.memory.maxClaimsPerTurn).toBe(10)
    expect(config.memory.retrievalTokenBudget).toBe(350)
    expect(config.memory.recentParticipantLimit).toBe(3)
    expect(config.memory.speakerMinShare).toBe(0.5)
    expect(config.memory.maxActiveClaimsPerUser).toBe(20)
    expect(config.memory.claimRetentionDays).toBe(90)
    expect(config.memory.extractionDailyBudgetRatio).toBe(0.4)
    expect(config.memory.perGuildGapMs).toBe(20_000)
    expect(config.memory.extractionQueueMaxPerGuild).toBe(50)
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
    expect(config.games.hangmanTimeoutMs).toBe(60_000)
    expect(config.games.shiritoriTimeoutMs).toBe(60_000)
    expect(config.games.shinyChance).toBe(0.01)

    // Status cycle
    expect(config.statusCycleMs).toBe(900_000)
    expect(warn).not.toHaveBeenCalled()
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
    vi.stubEnv('GEMINI_EXTRACTION_RPM_FLOOR', '6')
    vi.stubEnv('GEMINI_EXTRACTION_MAX_RETRIES', '2')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_BASE_MS', '1500')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_CAP_MS', '9000')
    vi.stubEnv('MEMORY_BUFFER_SIZE', '40')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '30')
    vi.stubEnv('MEMORY_EXTRACTION_GAP_MS', '25000')
    vi.stubEnv('MEMORY_CLAIMS_BACKEND', 'true')
    vi.stubEnv('MEMORY_MAX_CLAIMS_PER_TURN', '8')
    vi.stubEnv('MEMORY_RETRIEVAL_TOKEN_BUDGET', '300')
    vi.stubEnv('MEMORY_RECENT_PARTICIPANT_LIMIT', '2')
    vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '0.75')
    vi.stubEnv('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER', '25')
    vi.stubEnv('MEMORY_CLAIM_RETENTION_DAYS', '120')
    vi.stubEnv('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO', '0.35')
    vi.stubEnv('MEMORY_PER_GUILD_GAP_MS', '30000')
    vi.stubEnv('MEMORY_EXTRACTION_QUEUE_MAX_PER_GUILD', '75')
    vi.stubEnv('MEMORY_VAULT_EXPORT_DIR', 'tmp/vault')
    vi.stubEnv('METRICS_RETENTION_DAYS', '120')
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '4000')

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
    expect(config.gemini.retryRpmFloor).toBe(5)
    expect(config.gemini.extractionRpmFloor).toBe(6)
    expect(config.gemini.extractionMaxRetries).toBe(2)
    expect(config.gemini.retryBackoffBaseMs).toBe(1500)
    expect(config.gemini.retryBackoffCapMs).toBe(9000)
    expect(config.memory.bufferSize).toBe(40)
    expect(config.memory.extractionInterval).toBe(30)
    expect(config.memory.extractionGapMs).toBe(25_000)
    expect(config.memory.claimsBackend).toBe(true)
    expect(config.memory.maxClaimsPerTurn).toBe(8)
    expect(config.memory.retrievalTokenBudget).toBe(300)
    expect(config.memory.recentParticipantLimit).toBe(2)
    expect(config.memory.speakerMinShare).toBe(0.75)
    expect(config.memory.maxActiveClaimsPerUser).toBe(25)
    expect(config.memory.claimRetentionDays).toBe(120)
    expect(config.memory.extractionDailyBudgetRatio).toBe(0.35)
    expect(config.memory.perGuildGapMs).toBe(30_000)
    expect(config.memory.extractionQueueMaxPerGuild).toBe(75)
    expect(config.memory).not.toHaveProperty('extractionBatchSize')
    expect(config.memory.vaultExportDir).toBe('tmp/vault')
    expect(config.metrics.retentionDays).toBe(120)
    expect(config.discord.maxMessageLength).toBe(4000)
  })

  it('warns when the session TTL is shorter than the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '100000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledOnce()
  })

  it('does not warn when the session TTL exceeds the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '120000')

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('throws if env int override is non-numeric', async () => {
    setRequiredEnvVars()
    vi.stubEnv('RATE_LIMIT_RPM', 'not-a-number')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable RATE_LIMIT_RPM must be a number, got: not-a-number'
    )
  })

  it('clamps the extraction interval to the passive buffer size', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_BUFFER_SIZE', '20')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '30')

    const { config } = await import('../config.js')

    expect(config.memory.extractionInterval).toBe(20)
    expect(warn).toHaveBeenCalledOnce()
  })
})
