/** Configuration loader merging .env secrets with config.yml tunables */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
// Both are pure leaves — attachmentLimits.ts imports nothing and attachments.ts only node built-ins — so
// reading them here derives the floor instead of restating it, and cannot close a cycle back into config.
import { GEMINI_IMAGE_TOKENS } from './agent/attachmentLimits.js'
import { MAX_ATTACHMENTS } from './discord/attachments.js'

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
    maxAttachmentTokens?: number
    safetyThreshold?: string
    maxLlmCalls?: number
    liveMaxRetries?: number
    retryRpmFloor?: number
    extractionRpmFloor?: number
    extractionMaxRetries?: number
    retryBackoffBaseMs?: number
    retryBackoffCapMs?: number
    turnDeadlineMs?: number
  }
  rateLimit?: { rpm?: number; rpd?: number }
  session?: { ttl?: number; windowSize?: number; maxRehydrationAge?: number; historyRetentionDays?: number }
  discord?: { maxMessageLength?: number; maxInFlightAttachmentBytes?: number }
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
  metrics?: { retentionDays?: number; diagnosticsRetentionHours?: number }
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
  const trimmed = raw.trim()
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`)
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`)
  }
  return parsed
}

function envNumber(key: string): number | undefined {
  const raw = process.env[key]
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
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
    maxMessageLength: envInt('DISCORD_MAX_MESSAGE_LENGTH') ?? yaml.discord?.maxMessageLength ?? 2000,
    maxInFlightAttachmentBytes:
      envInt('DISCORD_MAX_INFLIGHT_ATTACHMENT_BYTES') ?? yaml.discord?.maxInFlightAttachmentBytes ?? 33_554_432
  },
  gemini: {
    apiKey: requiredEnv('GEMINI_API_KEY'),
    model: geminiModel,
    extractionModel: envString('GEMINI_EXTRACTION_MODEL') ?? yaml.gemini?.extractionModel ?? geminiModel,
    timeout: envInt('GEMINI_TIMEOUT') ?? yaml.gemini?.timeout ?? 15_000,
    maxRetries: envInt('GEMINI_MAX_RETRIES') ?? yaml.gemini?.maxRetries ?? 1,
    maxOutputTokens: envInt('GEMINI_MAX_OUTPUT_TOKENS') ?? yaml.gemini?.maxOutputTokens ?? 300,
    maxAttachmentTokens: envInt('GEMINI_MAX_ATTACHMENT_TOKENS') ?? yaml.gemini?.maxAttachmentTokens ?? 50_000,
    safetyThreshold: envString('GEMINI_SAFETY_THRESHOLD') ?? yaml.gemini?.safetyThreshold ?? 'OFF',
    maxLlmCalls: yaml.gemini?.maxLlmCalls ?? 4,
    liveMaxRetries: envInt('GEMINI_LIVE_MAX_RETRIES') ?? yaml.gemini?.liveMaxRetries ?? 2,
    retryRpmFloor: envInt('GEMINI_RETRY_RPM_FLOOR') ?? yaml.gemini?.retryRpmFloor ?? 2,
    extractionRpmFloor: envInt('GEMINI_EXTRACTION_RPM_FLOOR') ?? yaml.gemini?.extractionRpmFloor ?? 3,
    extractionMaxRetries: envInt('GEMINI_EXTRACTION_MAX_RETRIES') ?? yaml.gemini?.extractionMaxRetries ?? 1,
    retryBackoffBaseMs: envInt('GEMINI_RETRY_BACKOFF_BASE_MS') ?? yaml.gemini?.retryBackoffBaseMs ?? 1000,
    retryBackoffCapMs: envInt('GEMINI_RETRY_BACKOFF_CAP_MS') ?? yaml.gemini?.retryBackoffCapMs ?? 12_000,
    turnDeadlineMs: envInt('GEMINI_TURN_DEADLINE_MS') ?? yaml.gemini?.turnDeadlineMs ?? 60_000
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
    claimsBackend: envBool('MEMORY_CLAIMS_BACKEND') ?? yaml.memory?.claimsBackend ?? true,
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
    retentionDays: envInt('METRICS_RETENTION_DAYS') ?? yaml.metrics?.retentionDays ?? 90,
    diagnosticsRetentionHours:
      envInt('METRICS_DIAGNOSTICS_RETENTION_HOURS') ?? yaml.metrics?.diagnosticsRetentionHours ?? 72
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

/**
 * Bounds for every numeric tunable, env-overridable or yaml-only, re-derived from resolved config
 * values so a dropped or mis-wired row shows up in `NUMERIC_BOUNDS`, not just at runtime. min: 1
 * keys silently break the behaviour they gate at zero or below (e.g. gemini.timeout: 0 aborts
 * every request instantly); min: 0 keys have a legitimate "off"/"no floor" meaning at zero (e.g.
 * gemini.maxRetries: 0 means "don't retry"). max is optional and only set on fractions where any
 * value above it is definitionally meaningless (e.g. a share greater than 1).
 */
export const NUMERIC_BOUNDS: ReadonlyArray<{ path: string; value: number; min: number; max?: number }> = [
  { path: 'gemini.timeout', value: config.gemini.timeout, min: 1 },
  { path: 'gemini.maxOutputTokens', value: config.gemini.maxOutputTokens, min: 1 },
  // Floor is a full turn of plain images, derived rather than restated: below it a maximal image turn could
  // be refused,
  // and images are the one type whose cost is already known to be bounded and safe. Ceiling is the measured
  // 250,000 TPM (#125) — a single turn priced above the whole minute's budget can only ever fail on 429.
  {
    path: 'gemini.maxAttachmentTokens',
    value: config.gemini.maxAttachmentTokens,
    min: MAX_ATTACHMENTS * GEMINI_IMAGE_TOKENS,
    max: 250_000
  },
  { path: 'gemini.turnDeadlineMs', value: config.gemini.turnDeadlineMs, min: 1 },
  { path: 'gemini.retryBackoffCapMs', value: config.gemini.retryBackoffCapMs, min: 1 },
  { path: 'gemini.maxRetries', value: config.gemini.maxRetries, min: 0 },
  { path: 'gemini.liveMaxRetries', value: config.gemini.liveMaxRetries, min: 0 },
  { path: 'gemini.extractionMaxRetries', value: config.gemini.extractionMaxRetries, min: 0 },
  { path: 'gemini.retryBackoffBaseMs', value: config.gemini.retryBackoffBaseMs, min: 0 },
  { path: 'gemini.retryRpmFloor', value: config.gemini.retryRpmFloor, min: 0 },
  { path: 'gemini.extractionRpmFloor', value: config.gemini.extractionRpmFloor, min: 0 },
  { path: 'gemini.maxLlmCalls', value: config.gemini.maxLlmCalls, min: 1 },
  { path: 'rateLimit.rpm', value: config.rateLimit.rpm, min: 1 },
  { path: 'rateLimit.rpd', value: config.rateLimit.rpd, min: 1 },
  { path: 'session.ttlMs', value: config.session.ttlMs, min: 1 },
  { path: 'session.windowSize', value: config.session.windowSize, min: 1 },
  { path: 'session.maxRehydrationAge', value: config.session.maxRehydrationAge, min: 0 },
  { path: 'session.historyRetentionDays', value: config.session.historyRetentionDays, min: 1 },
  // 4000 (Components V2 shared TextDisplay budget) − MAX_TOOL_FOOTER_CHARS (122, derived in
  // src/discord/messageBuilder.ts) = 3878; this bot never sends via content.
  { path: 'discord.maxMessageLength', value: config.discord.maxMessageLength, min: 1, max: 3878 },
  // min is the largest a single turn can be (MAX_ATTACHMENTS x MAX_DOCUMENT_SIZE_BYTES): below that, a
  // full-sized turn could never be admitted even on an idle bot, so it would be refused forever rather
  // than merely delayed. Asserted from the constants themselves in the byteBudget tests.
  { path: 'discord.maxInFlightAttachmentBytes', value: config.discord.maxInFlightAttachmentBytes, min: 31_457_280 },
  { path: 'memory.bufferSize', value: config.memory.bufferSize, min: 1 },
  { path: 'memory.contextSize', value: config.memory.contextSize, min: 1 },
  { path: 'memory.extractionInterval', value: config.memory.extractionInterval, min: 0 },
  { path: 'memory.extractionGapMs', value: config.memory.extractionGapMs, min: 0 },
  { path: 'memory.maxFactsPerUser', value: config.memory.maxFactsPerUser, min: 1 },
  { path: 'memory.factRetentionDays', value: config.memory.factRetentionDays, min: 1 },
  { path: 'memory.channelMonitorTtlMs', value: config.memory.channelMonitorTtlMs, min: 1 },
  { path: 'memory.maxClaimsPerTurn', value: config.memory.maxClaimsPerTurn, min: 1 },
  { path: 'memory.retrievalTokenBudget', value: config.memory.retrievalTokenBudget, min: 1 },
  { path: 'memory.recentParticipantLimit', value: config.memory.recentParticipantLimit, min: 1 },
  { path: 'memory.speakerMinShare', value: config.memory.speakerMinShare, min: 0, max: 1 },
  { path: 'memory.maxActiveClaimsPerUser', value: config.memory.maxActiveClaimsPerUser, min: 1 },
  { path: 'memory.claimRetentionDays', value: config.memory.claimRetentionDays, min: 1 },
  { path: 'memory.extractionDailyBudgetRatio', value: config.memory.extractionDailyBudgetRatio, min: 0, max: 1 },
  { path: 'memory.perGuildGapMs', value: config.memory.perGuildGapMs, min: 0 },
  { path: 'memory.extractionQueueMaxPerGuild', value: config.memory.extractionQueueMaxPerGuild, min: 1 },
  { path: 'metrics.retentionDays', value: config.metrics.retentionDays, min: 1 },
  { path: 'metrics.diagnosticsRetentionHours', value: config.metrics.diagnosticsRetentionHours, min: 1 },
  { path: 'emoji.probability', value: config.emoji.probability, min: 0, max: 1 },
  { path: 'emoji.cooldownMs', value: config.emoji.cooldownMs, min: 0 },
  { path: 'reminders.checkIntervalMs', value: config.reminders.checkIntervalMs, min: 1 },
  { path: 'reminders.maxPerUser', value: config.reminders.maxPerUser, min: 1 },
  { path: 'reminders.staleThresholdMs', value: config.reminders.staleThresholdMs, min: 1 },
  { path: 'games.hangmanLives', value: config.games.hangmanLives, min: 1 },
  { path: 'games.hangmanTimeoutMs', value: config.games.hangmanTimeoutMs, min: 1 },
  { path: 'games.shiritoriTimeoutMs', value: config.games.shiritoriTimeoutMs, min: 1 },
  { path: 'games.shinyChance', value: config.games.shinyChance, min: 0, max: 1 },
  { path: 'statusCycleMs', value: config.statusCycleMs, min: 1 }
]

for (const { path, value, min, max } of NUMERIC_BOUNDS) {
  // TS sees `value: number` and reads this as unreachable, but the `as YamlConfig` cast at :79
  // makes that type a fiction for YAML-sourced values — a quoted scalar, `.nan`, or `.inf` all
  // reach here as a genuine non-number or non-finite number and must be rejected before either
  // comparison below, since both `<` and `>` are false against NaN and Infinity passes any min.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Config value ${path} must be a finite number, got: ${String(value)} (${typeof value})`)
  }
  if (value < min) {
    throw new Error(`Config value ${path} must be >= ${min}, got: ${value}`)
  }
  if (max !== undefined && value > max) {
    throw new Error(`Config value ${path} must be <= ${max}, got: ${value}`)
  }
}

export function deriveAchievableRetries(
  liveMaxRetries: number,
  retryBackoffBaseMs: number,
  retryBackoffCapMs: number,
  jitterFactor: number
) {
  if (retryBackoffBaseMs === 0) return liveMaxRetries

  let retryLatencyMs = 0
  for (let retryIndex = 0; retryIndex < liveMaxRetries; retryIndex++) {
    const backoffMs = Math.min(retryBackoffBaseMs * 2 ** retryIndex, retryBackoffCapMs) * jitterFactor
    const delayMs = Math.min(backoffMs, Math.max(0, retryBackoffCapMs - retryLatencyMs))

    if (delayMs <= 0 && retryLatencyMs >= retryBackoffCapMs) return retryIndex
    retryLatencyMs += delayMs
  }

  return liveMaxRetries
}

// Worst-case duration tail, checked against the session TTL.
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

// Equality is only safe in steady state; the scheduler (reminderScheduler.ts:11) has no leading tick, so the
// first tick after a restart has no predecessor and sweeps (reminderStore.ts:84) whatever fell due during
// downtime, and setInterval drift means the real gap is >= checkIntervalMs, not ==.
if (config.reminders.staleThresholdMs <= config.reminders.checkIntervalMs) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    {
      staleThresholdMs: config.reminders.staleThresholdMs,
      checkIntervalMs: config.reminders.checkIntervalMs
    },
    'Reminder stale threshold can sweep a reminder before any scheduler tick can deliver it'
  )
}

if (config.memory.contextSize > config.memory.bufferSize) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    { contextSize: config.memory.contextSize, bufferSize: config.memory.bufferSize },
    'Memory context size above passive buffer size is silently ineffective'
  )
}

// The deadline budget asks whether the last attempt is guaranteed, so it uses maximum jitter.
const maxJitterAchievableRetries = deriveAchievableRetries(
  config.gemini.liveMaxRetries,
  config.gemini.retryBackoffBaseMs,
  config.gemini.retryBackoffCapMs,
  1
)

// The cap-reachability warning asks whether the configured count is impossible, so it uses minimum jitter.
const minJitterAchievableRetries = deriveAchievableRetries(
  config.gemini.liveMaxRetries,
  config.gemini.retryBackoffBaseMs,
  config.gemini.retryBackoffCapMs,
  0.5
)

const requiredMs =
  (maxJitterAchievableRetries + 1) * config.gemini.timeout +
  Math.min(
    config.gemini.retryBackoffCapMs,
    Array.from({ length: maxJitterAchievableRetries }, (_, retryIndex) =>
      Math.min(config.gemini.retryBackoffBaseMs * 2 ** retryIndex, config.gemini.retryBackoffCapMs)
    ).reduce((total, backoffMs) => total + backoffMs, 0)
  )

if (config.gemini.liveMaxRetries > minJitterAchievableRetries) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    {
      liveMaxRetries: config.gemini.liveMaxRetries,
      achievableRetries: minJitterAchievableRetries,
      retryBackoffBaseMs: config.gemini.retryBackoffBaseMs,
      retryBackoffCapMs: config.gemini.retryBackoffCapMs
    },
    'Configured live retry count can never be reached because the cumulative backoff cap fires first'
  )
}

// Last-attempt reachability tail, checked against the turn deadline; necessary but not sufficient because attempts are modeled
// at timeout and requestTimeoutMs cannot interrupt hung attempts.
if (config.gemini.turnDeadlineMs < requiredMs) {
  const { logger } = await import('./utils/logger.js')
  logger.warn(
    {
      turnDeadlineMs: config.gemini.turnDeadlineMs,
      timeout: config.gemini.timeout,
      liveMaxRetries: config.gemini.liveMaxRetries,
      retryBackoffBaseMs: config.gemini.retryBackoffBaseMs,
      retryBackoffCapMs: config.gemini.retryBackoffCapMs,
      requiredMs
    },
    'Turn deadline is smaller than the requiredMs budget needed for all liveMaxRetries + 1 attempts, so the last attempt(s) can never be admitted'
  )
}
