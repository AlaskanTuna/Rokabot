import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('config module', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
    vi.stubEnv('GEMINI_TIMEOUT', '')
    vi.stubEnv('GEMINI_MAX_RETRIES', '')
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

    expect(config.gemini.model).toBe('gemini-3.1-flash-lite')
    expect(config.gemini.timeout).toBe(45_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.gemini.maxOutputTokens).toBe(500)
    expect(config.gemini.baseRetryDelay).toBe(2000)
    expect(config.gemini.maxLlmCalls).toBe(4)
    expect(config.logging.level).toBe('info')
    expect(config.rateLimit.rpm).toBe(15)
    expect(config.rateLimit.rpd).toBe(500)
    expect(config.session.ttlMs).toBe(500_000)
    expect(config.session.windowSize).toBe(20)
    expect(config.session.maxRehydrationAge).toBe(7_200_000)
    expect(config.session.historyRetentionDays).toBe(7)
    expect(config.discord.maxMessageLength).toBe(1500)

    // Memory
    expect(config.memory.bufferSize).toBe(20)
    expect(config.memory.contextSize).toBe(10)
    expect(config.memory.extractionInterval).toBe(10)
    expect(config.memory.extractionGapMs).toBe(10_000)
    expect(config.memory.maxFactsPerUser).toBe(20)
    expect(config.memory.factRetentionDays).toBe(14)
    expect(config.memory.channelMonitorTtlMs).toBe(86_400_000)

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
  })

  it('env vars override config.yml values', async () => {
    setRequiredEnvVars()
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.stubEnv('RATE_LIMIT_RPM', '30')
    vi.stubEnv('RATE_LIMIT_RPD', '1000')
    vi.stubEnv('SESSION_TTL_MS', '600000')
    vi.stubEnv('SESSION_WINDOW_SIZE', '20')
    vi.stubEnv('GEMINI_MODEL', 'gemini-pro')
    vi.stubEnv('GEMINI_TIMEOUT', '30000')
    vi.stubEnv('GEMINI_MAX_RETRIES', '3')
    vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '4000')

    const { config } = await import('../config.js')

    expect(config.logging.level).toBe('debug')
    expect(config.rateLimit.rpm).toBe(30)
    expect(config.rateLimit.rpd).toBe(1000)
    expect(config.session.ttlMs).toBe(600_000)
    expect(config.session.windowSize).toBe(20)
    expect(config.gemini.model).toBe('gemini-pro')
    expect(config.gemini.timeout).toBe(30_000)
    expect(config.gemini.maxRetries).toBe(3)
    expect(config.discord.maxMessageLength).toBe(4000)
  })

  it('throws if env int override is non-numeric', async () => {
    setRequiredEnvVars()
    vi.stubEnv('RATE_LIMIT_RPM', 'not-a-number')

    await expect(() => import('../config.js')).rejects.toThrow(
      'Environment variable RATE_LIMIT_RPM must be a number, got: not-a-number'
    )
  })
})
