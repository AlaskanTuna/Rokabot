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
    vi.doUnmock('js-yaml')
  })

  /** Shallow-recursive merge used only to layer a test override onto the real parsed config.yml */
  function merge(base: unknown, override: Record<string, unknown>): unknown {
    if (typeof base !== 'object' || base === null) return override
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [key, value] of Object.entries(override)) {
      const existing = result[key]
      if (typeof value === 'object' && value !== null && typeof existing === 'object' && existing !== null) {
        result[key] = merge(existing, value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }

  /** Mocks js-yaml's `load` to parse the real config.yml, then layer a test override on top */
  function withYamlOverride(override: Record<string, unknown>) {
    vi.doMock('js-yaml', async (importOriginal) => {
      const actual = await importOriginal<typeof import('js-yaml')>()
      return { ...actual, load: (raw: string) => merge(actual.load(raw), override) }
    })
  }

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
    vi.stubEnv('GEMINI_MAX_OUTPUT_TOKENS', '')
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '')
    vi.stubEnv('GEMINI_RETRY_RPM_FLOOR', '')
    vi.stubEnv('GEMINI_EXTRACTION_RPM_FLOOR', '')
    vi.stubEnv('GEMINI_EXTRACTION_MAX_RETRIES', '')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_BASE_MS', '')
    vi.stubEnv('GEMINI_RETRY_BACKOFF_CAP_MS', '')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '')
    vi.stubEnv('GEMINI_SAFETY_THRESHOLD', '')
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
    expect(config.gemini.timeout).toBe(20_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.gemini.maxOutputTokens).toBe(500)
    expect(config.gemini.safetyThreshold).toBe('OFF')
    expect(config.gemini.maxLlmCalls).toBe(4)
    expect(config.gemini.liveMaxRetries).toBe(2)
    expect(config.gemini.retryRpmFloor).toBe(2)
    expect(config.gemini.extractionRpmFloor).toBe(3)
    expect(config.gemini.extractionMaxRetries).toBe(1)
    expect(config.gemini.retryBackoffBaseMs).toBe(1000)
    expect(config.gemini.retryBackoffCapMs).toBe(12_000)
    expect(config.gemini.turnDeadlineMs).toBe(63_000)
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
    expect(config.memory.claimsBackend).toBe(true)
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
    expect(config.games.hangmanTimeoutMs).toBe(120_000)
    expect(config.games.shiritoriTimeoutMs).toBe(120_000)
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
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '90000')
    vi.stubEnv('GEMINI_SAFETY_THRESHOLD', 'BLOCK_ONLY_HIGH')
    vi.stubEnv('MEMORY_BUFFER_SIZE', '40')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '30')
    vi.stubEnv('MEMORY_EXTRACTION_GAP_MS', '25000')
    vi.stubEnv('MEMORY_CLAIMS_BACKEND', 'false')
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
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3878')

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
    expect(config.gemini.turnDeadlineMs).toBe(90_000)
    expect(config.gemini.safetyThreshold).toBe('BLOCK_ONLY_HIGH')
    expect(config.memory.bufferSize).toBe(40)
    expect(config.memory.extractionInterval).toBe(30)
    expect(config.memory.extractionGapMs).toBe(25_000)
    expect(config.memory.claimsBackend).toBe(false)
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
    expect(config.discord.maxMessageLength).toBe(3878)
  })

  it('warns when the session TTL is shorter than the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '50000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledOnce()
  })

  it('warns when the turn deadline cannot reach all live retry attempts', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '10000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ turnDeadlineMs: 10_000, timeout: 20_000 }),
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('warns when the turn deadline is below the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '39999')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ turnDeadlineMs: 39_999, timeout: 20_000 }),
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('warns when the turn deadline leaves no room for all live retry attempts', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '40000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ turnDeadlineMs: 40_000, timeout: 20_000 }),
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('warns when the turn deadline is just below the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '62999')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      {
        turnDeadlineMs: 62_999,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('does not warn when the turn deadline equals the live retry reachability budget', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '63000')

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn when configured live retries equal what the cumulative backoff cap can reach under minimum jitter', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '5')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '150000')

    await import('../config.js')

    expect(warn).not.toHaveBeenCalledWith(
      expect.any(Object),
      'Configured live retry count can never be reached because the cumulative backoff cap fires first'
    )
  })

  it('warns when configured live retries exceed what the cumulative backoff cap can reach under minimum jitter', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '6')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '150000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      {
        liveMaxRetries: 6,
        achievableRetries: 5,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000
      },
      'Configured live retry count can never be reached because the cumulative backoff cap fires first'
    )
  })

  it('does not warn when the cumulative backoff cap makes the deadline sufficient', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '4')
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '112000')

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn about retry reachability or deadline at shipped defaults', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when the attempt-count budget exceeds the turn deadline', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '50000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      {
        turnDeadlineMs: 50_000,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('warns when the backoff budget exceeds the turn deadline', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '61000')

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      {
        turnDeadlineMs: 61_000,
        timeout: 20_000,
        liveMaxRetries: 2,
        retryBackoffBaseMs: 1_000,
        retryBackoffCapMs: 12_000,
        requiredMs: 63_000
      },
      'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
    )
  })

  it('does not warn when the session TTL exceeds the maximum live retry window', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('SESSION_TTL_MS', '120000')

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when a reminder can be swept stale before a scheduler tick can deliver it', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 4000 } })

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      { staleThresholdMs: 4000, checkIntervalMs: 5000 },
      'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
    )
  })

  it('warns when a reminder stale threshold equals the scheduler interval', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 5000 } })

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      { staleThresholdMs: 5000, checkIntervalMs: 5000 },
      'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
    )
  })

  it('does not warn when a reminder stale threshold exceeds the scheduler interval by 1ms', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ reminders: { staleThresholdMs: 5001 } })

    await import('../config.js')

    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when values above the memory buffer size are silently ineffective', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { contextSize: 31 } })

    await import('../config.js')

    expect(warn).toHaveBeenCalledWith(
      { contextSize: 31, bufferSize: 30 },
      'Memory context size above passive buffer size is silently ineffective'
    )
  })

  it('does not warn when the memory context size equals the buffer size', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { contextSize: 30 } })

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

  it('clamps the extraction interval to the passive buffer size', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_BUFFER_SIZE', '20')
    vi.stubEnv('MEMORY_EXTRACTION_INTERVAL', '30')

    const { config } = await import('../config.js')

    expect(config.memory.extractionInterval).toBe(20)
    expect(warn).toHaveBeenCalledOnce()
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
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3879')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value discord.maxMessageLength must be <= 3878, got: 3879'
    )
  })

  it('accepts DISCORD_MAX_MESSAGE_LENGTH at exactly the tool-footer-adjusted maximum', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '3878')

    const { config } = await import('../config.js')

    expect(config.discord.maxMessageLength).toBe(3878)
  })

  // config.ts states this floor as the literal 3267 because importing either constant there would close a
  // cycle (imageProcessor -> logger -> config). This is the pin that makes the arithmetic fail loudly:
  // raising MAX_ATTACHMENTS without raising the floor would silently start refusing whole turns of plain
  // images, the one type whose cost is already known to be bounded and safe.
  it('floors the attachment ceiling at a full turn of images', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const { MAX_ATTACHMENTS } = await import('../discord/attachments.js')
    const { GEMINI_IMAGE_TOKENS } = await import('../utils/imageProcessor.js')
    const { NUMERIC_BOUNDS } = await import('../config.js')

    expect(NUMERIC_BOUNDS.find((entry) => entry.path === 'gemini.maxAttachmentTokens')?.min).toBe(
      MAX_ATTACHMENTS * GEMINI_IMAGE_TOKENS
    )
  })

  it('bounds every numeric tunable, env-overridable or yaml-only', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()

    const EXPECTED_BOUNDS: ReadonlyArray<{ path: string; min: number; max?: number }> = [
      { path: 'gemini.timeout', min: 1 },
      { path: 'gemini.maxAttachmentTokens', min: 3267, max: 250_000 },
      { path: 'gemini.maxOutputTokens', min: 1 },
      { path: 'gemini.turnDeadlineMs', min: 1 },
      { path: 'gemini.retryBackoffCapMs', min: 1 },
      { path: 'gemini.maxRetries', min: 0 },
      { path: 'gemini.liveMaxRetries', min: 0 },
      { path: 'gemini.extractionMaxRetries', min: 0 },
      { path: 'gemini.retryBackoffBaseMs', min: 0 },
      { path: 'gemini.retryRpmFloor', min: 0 },
      { path: 'gemini.extractionRpmFloor', min: 0 },
      { path: 'gemini.maxLlmCalls', min: 1 },
      { path: 'rateLimit.rpm', min: 1 },
      { path: 'rateLimit.rpd', min: 1 },
      { path: 'session.ttlMs', min: 1 },
      { path: 'session.windowSize', min: 1 },
      { path: 'session.maxRehydrationAge', min: 0 },
      { path: 'session.historyRetentionDays', min: 1 },
      { path: 'discord.maxMessageLength', min: 1, max: 3878 },
      { path: 'discord.maxInFlightAttachmentBytes', min: 31_457_280 },
      { path: 'memory.bufferSize', min: 1 },
      { path: 'memory.contextSize', min: 1 },
      { path: 'memory.extractionInterval', min: 0 },
      { path: 'memory.extractionGapMs', min: 0 },
      { path: 'memory.maxFactsPerUser', min: 1 },
      { path: 'memory.factRetentionDays', min: 1 },
      { path: 'memory.channelMonitorTtlMs', min: 1 },
      { path: 'memory.maxClaimsPerTurn', min: 1 },
      { path: 'memory.retrievalTokenBudget', min: 1 },
      { path: 'memory.recentParticipantLimit', min: 1 },
      { path: 'memory.speakerMinShare', min: 0, max: 1 },
      { path: 'memory.maxActiveClaimsPerUser', min: 1 },
      { path: 'memory.claimRetentionDays', min: 1 },
      { path: 'memory.extractionDailyBudgetRatio', min: 0, max: 1 },
      { path: 'memory.perGuildGapMs', min: 0 },
      { path: 'memory.extractionQueueMaxPerGuild', min: 1 },
      { path: 'metrics.diagnosticsRetentionHours', min: 1 },
      { path: 'metrics.retentionDays', min: 1 },
      { path: 'emoji.probability', min: 0, max: 1 },
      { path: 'emoji.cooldownMs', min: 0 },
      { path: 'reminders.checkIntervalMs', min: 1 },
      { path: 'reminders.maxPerUser', min: 1 },
      { path: 'reminders.staleThresholdMs', min: 1 },
      { path: 'games.hangmanLives', min: 1 },
      { path: 'games.hangmanTimeoutMs', min: 1 },
      { path: 'games.shiritoriTimeoutMs', min: 1 },
      { path: 'games.shinyChance', min: 0, max: 1 },
      { path: 'statusCycleMs', min: 1 }
    ]

    const { NUMERIC_BOUNDS } = await import('../config.js')

    expect(NUMERIC_BOUNDS.map((bound) => bound.path).sort()).toEqual(EXPECTED_BOUNDS.map((bound) => bound.path).sort())
    for (const expected of EXPECTED_BOUNDS) {
      const actual = NUMERIC_BOUNDS.find((bound) => bound.path === expected.path)
      expect(actual?.min).toBe(expected.min)
      expect(actual?.max).toBe(expected.max)
    }
  })

  it('throws if memory.extractionDailyBudgetRatio exceeds 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO', '5')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.extractionDailyBudgetRatio must be <= 1, got: 5'
    )
  })

  it('throws if memory.speakerMinShare exceeds 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '2.5')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.speakerMinShare must be <= 1, got: 2.5'
    )
  })

  it('accepts a ratio at exactly the upper bound of 1', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    vi.stubEnv('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO', '1')

    const { config } = await import('../config.js')

    expect(config.memory.extractionDailyBudgetRatio).toBe(1)
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

  it('throws if memory.factRetentionDays is set to a negative value in config.yml', async () => {
    setRequiredEnvVars()
    clearTunableEnvVars()
    withYamlOverride({ memory: { factRetentionDays: -1 } })

    await expect(() => import('../config.js')).rejects.toThrow(
      'Config value memory.factRetentionDays must be >= 1, got: -1'
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
})
