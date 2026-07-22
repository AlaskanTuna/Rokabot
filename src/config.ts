/** Configuration loader merging .env secrets with config.yml tunables */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

function requiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

interface YamlConfig {
  gemini?: {
    model?: string
    extractionModel?: string
    timeout?: number
    maxRetries?: number
    maxOutputTokens?: number
    baseRetryDelay?: number
    maxLlmCalls?: number
    liveMaxRetries?: number
    retryRpmFloor?: number
    extractionRpmFloor?: number
    extractionMaxRetries?: number
    retryBackoffBaseMs?: number
    retryBackoffCapMs?: number
  }
  rateLimit?: { rpm?: number; rpd?: number }
  session?: { ttl?: number; windowSize?: number; maxRehydrationAge?: number; historyRetentionDays?: number }
  discord?: { maxMessageLength?: number }
  memory?: {
    bufferSize?: number
    contextSize?: number
    extractionInterval?: number
    extractionGapMs?: number
    maxFactsPerUser?: number
    factRetentionDays?: number
    channelMonitorTtlMs?: number
    claimsBackend?: boolean
    maxClaimsPerTurn?: number
    retrievalTokenBudget?: number
    recentParticipantLimit?: number
    speakerMinShare?: number
    maxActiveClaimsPerUser?: number
    claimRetentionDays?: number
    extractionDailyBudgetRatio?: number
    perGuildGapMs?: number
    extractionQueueMaxPerGuild?: number
    vaultExportDir?: string
  }
  metrics?: { retentionDays?: number }
  emoji?: { probability?: number; cooldownMs?: number }
  reminders?: { checkIntervalMs?: number; maxPerUser?: number; staleThresholdMs?: number }
  games?: { hangmanLives?: number; hangmanTimeoutMs?: number; shiritoriTimeoutMs?: number; shinyChance?: number }
  statusCycleMs?: number
  timezone?: string
  logging?: { level?: string }
}

function loadYamlConfig(): YamlConfig {
  const configPath = resolve(import.meta.dirname ?? '.', '..', 'config.yml')
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch {
    throw new Error(`Cannot read config.yml at ${configPath}. Ensure the file exists in the project root.`)
  }

  const parsed = load(raw)
  if (parsed == null || typeof parsed !== 'object') {
    throw new Error('config.yml is empty or malformed — expected a YAML mapping.')
  }
  return parsed as YamlConfig
}

const yaml = loadYamlConfig()

function envInt(key: string): number | undefined {
  const raw = process.env[key]
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`)
  }
  return parsed
}

function envNumber(key: string): number | undefined {
  const raw = process.env[key]
  if (!raw) return undefined
  const parsed = Number(raw)
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`)
  }
  return parsed
}

function envBool(key: string): boolean | undefined {
  const raw = process.env[key]
  if (!raw) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`Environment variable ${key} must be true or false, got: ${raw}`)
}

function envString(key: string): string | undefined {
  return process.env[key] || undefined
}

const geminiModel = envString('GEMINI_MODEL') ?? yaml.gemini?.model ?? 'gemini-2.0-flash-lite'
const memoryBufferSize = envInt('MEMORY_BUFFER_SIZE') ?? yaml.memory?.bufferSize ?? 30
const requestedExtractionInterval = envInt('MEMORY_EXTRACTION_INTERVAL') ?? yaml.memory?.extractionInterval ?? 20
const extractionInterval = Math.min(requestedExtractionInterval, memoryBufferSize)

/** Merged config: env overrides > config.yml > hardcoded defaults */
export const config = {
  discord: {
    token: requiredEnv('DISCORD_TOKEN'),
    clientId: requiredEnv('DISCORD_CLIENT_ID'),
    maxMessageLength: envInt('DISCORD_MAX_MESSAGE_LENGTH') ?? yaml.discord?.maxMessageLength ?? 2000
  },
  gemini: {
    apiKey: requiredEnv('GEMINI_API_KEY'),
    model: geminiModel,
    extractionModel: envString('GEMINI_EXTRACTION_MODEL') ?? yaml.gemini?.extractionModel ?? geminiModel,
    timeout: envInt('GEMINI_TIMEOUT') ?? yaml.gemini?.timeout ?? 15_000,
    maxRetries: envInt('GEMINI_MAX_RETRIES') ?? yaml.gemini?.maxRetries ?? 1,
    maxOutputTokens: envInt('GEMINI_MAX_OUTPUT_TOKENS') ?? yaml.gemini?.maxOutputTokens ?? 300,
    baseRetryDelay: yaml.gemini?.baseRetryDelay ?? 2000,
    maxLlmCalls: yaml.gemini?.maxLlmCalls ?? 4,
    liveMaxRetries: envInt('GEMINI_LIVE_MAX_RETRIES') ?? yaml.gemini?.liveMaxRetries ?? 2,
    retryRpmFloor: envInt('GEMINI_RETRY_RPM_FLOOR') ?? yaml.gemini?.retryRpmFloor ?? 2,
    extractionRpmFloor: envInt('GEMINI_EXTRACTION_RPM_FLOOR') ?? yaml.gemini?.extractionRpmFloor ?? 3,
    extractionMaxRetries: envInt('GEMINI_EXTRACTION_MAX_RETRIES') ?? yaml.gemini?.extractionMaxRetries ?? 1,
    retryBackoffBaseMs: envInt('GEMINI_RETRY_BACKOFF_BASE_MS') ?? yaml.gemini?.retryBackoffBaseMs ?? 1000,
    retryBackoffCapMs: envInt('GEMINI_RETRY_BACKOFF_CAP_MS') ?? yaml.gemini?.retryBackoffCapMs ?? 12_000
  },
  logging: {
    level: envString('LOG_LEVEL') ?? yaml.logging?.level ?? 'info'
  },
  rateLimit: {
    rpm: envInt('RATE_LIMIT_RPM') ?? yaml.rateLimit?.rpm ?? 15,
    rpd: envInt('RATE_LIMIT_RPD') ?? yaml.rateLimit?.rpd ?? 500
  },
  session: {
    ttlMs: envInt('SESSION_TTL_MS') ?? yaml.session?.ttl ?? 300_000,
    windowSize: envInt('SESSION_WINDOW_SIZE') ?? yaml.session?.windowSize ?? 20,
    maxRehydrationAge: yaml.session?.maxRehydrationAge ?? 7_200_000,
    historyRetentionDays: yaml.session?.historyRetentionDays ?? 7
  },
  memory: {
    bufferSize: memoryBufferSize,
    contextSize: yaml.memory?.contextSize ?? 10,
    extractionInterval,
    extractionGapMs: envInt('MEMORY_EXTRACTION_GAP_MS') ?? yaml.memory?.extractionGapMs ?? 20_000,
    maxFactsPerUser: yaml.memory?.maxFactsPerUser ?? 10,
    factRetentionDays: yaml.memory?.factRetentionDays ?? 90,
    channelMonitorTtlMs: yaml.memory?.channelMonitorTtlMs ?? 86_400_000,
    claimsBackend: envBool('MEMORY_CLAIMS_BACKEND') ?? yaml.memory?.claimsBackend ?? false,
    maxClaimsPerTurn: envInt('MEMORY_MAX_CLAIMS_PER_TURN') ?? yaml.memory?.maxClaimsPerTurn ?? 10,
    retrievalTokenBudget: envInt('MEMORY_RETRIEVAL_TOKEN_BUDGET') ?? yaml.memory?.retrievalTokenBudget ?? 350,
    recentParticipantLimit: envInt('MEMORY_RECENT_PARTICIPANT_LIMIT') ?? yaml.memory?.recentParticipantLimit ?? 3,
    speakerMinShare: envNumber('MEMORY_SPEAKER_MIN_SHARE') ?? yaml.memory?.speakerMinShare ?? 0.5,
    maxActiveClaimsPerUser: envInt('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER') ?? yaml.memory?.maxActiveClaimsPerUser ?? 20,
    claimRetentionDays: envInt('MEMORY_CLAIM_RETENTION_DAYS') ?? yaml.memory?.claimRetentionDays ?? 90,
    extractionDailyBudgetRatio:
      envNumber('MEMORY_EXTRACTION_DAILY_BUDGET_RATIO') ?? yaml.memory?.extractionDailyBudgetRatio ?? 0.4,
    perGuildGapMs: envInt('MEMORY_PER_GUILD_GAP_MS') ?? yaml.memory?.perGuildGapMs ?? 20_000,
    extractionQueueMaxPerGuild:
      envInt('MEMORY_EXTRACTION_QUEUE_MAX_PER_GUILD') ?? yaml.memory?.extractionQueueMaxPerGuild ?? 50,
    vaultExportDir: envString('MEMORY_VAULT_EXPORT_DIR') ?? yaml.memory?.vaultExportDir ?? 'data/vault'
  },
  metrics: {
    retentionDays: envInt('METRICS_RETENTION_DAYS') ?? yaml.metrics?.retentionDays ?? 90
  },
  emoji: {
    probability: yaml.emoji?.probability ?? 0.33,
    cooldownMs: yaml.emoji?.cooldownMs ?? 180_000
  },
  reminders: {
    checkIntervalMs: yaml.reminders?.checkIntervalMs ?? 5_000,
    maxPerUser: yaml.reminders?.maxPerUser ?? 5,
    staleThresholdMs: yaml.reminders?.staleThresholdMs ?? 300_000
  },
  games: {
    hangmanLives: yaml.games?.hangmanLives ?? 6,
    hangmanTimeoutMs: yaml.games?.hangmanTimeoutMs ?? 60_000,
    shiritoriTimeoutMs: yaml.games?.shiritoriTimeoutMs ?? 60_000,
    shinyChance: yaml.games?.shinyChance ?? 0.01
  },
  statusCycleMs: yaml.statusCycleMs ?? 900_000,
  timezone: (envString('TZ') ?? yaml.timezone) as string | undefined
} as const

const maxLiveRetryWindow = config.gemini.liveMaxRetries * (config.gemini.timeout + config.gemini.retryBackoffCapMs)

if (requestedExtractionInterval > memoryBufferSize) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    { bufferSize: memoryBufferSize, extractionInterval: requestedExtractionInterval },
    'Memory extraction interval exceeds passive buffer size; clamping to buffer size'
  )
}

if (config.session.ttlMs <= maxLiveRetryWindow) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    { sessionTtlMs: config.session.ttlMs, maxLiveRetryWindow },
    'Session idle TTL may expire before the maximum live retry window'
  )
}
