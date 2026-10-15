/** Configuration loader merging .env secrets with config.yml tunables */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
// All four are pure leaves — attachmentLimits.ts, llm/profiles.ts and embeddings/fingerprint.ts import nothing,
// attachments.ts only node built-ins — so reading them here derives values instead of restating them, and cannot
// close a cycle back into config.
import { GEMINI_IMAGE_TOKENS, MAX_DOCUMENT_SIZE_BYTES } from './agent/attachmentLimits.js'
import { MODEL_PROFILES, type ModelProfile, type ProviderId, profileFor } from './agent/llm/profiles.js'
import {
  DEFAULT_EMBEDDING_MODELS,
  type EmbeddingProvider,
  defaultEmbeddingProvider,
  embeddingDimensions,
  embeddingFingerprint
} from './agent/memory/embeddings/fingerprint.js'
import { MAX_ATTACHMENTS } from './discord/attachments.js'

function requiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

interface YamlConfig {
  jev?: {
    model?: string
    timeoutMs?: number
    memoryTimeoutMs?: number
    tone?: string
    referents?: string
    prefetch?: string
    toneMinProbability?: number
    prefetchMinNoul?: number
    prefetchWaitMs?: number
    referentMinConfidence?: number
  }
  gemini?: {
    model?: string
    extractionModel?: string
    timeout?: number
    maxRetries?: number
    maxOutputTokens?: number
    maxAttachmentTokens?: number
    maxTokensPerMinute?: number
    safetyThreshold?: string
    maxLlmCalls?: number
    hedgeAfterMs?: number
    liveMaxRetries?: number
    retryRpmFloor?: number
    retryBackoffBaseMs?: number
    retryBackoffCapMs?: number
    turnDeadlineMs?: number
  }
  fallback?: { model?: string; baseUrl?: string; timeoutMs?: number; stickyMs?: number }
  llm?: {
    main?: string
    fallback?: string | null
    hedgeAfterMs?: number
    stickyMs?: number
    monthlyBudgetUsd?: Record<string, number>
    modelscopeDailyMagicubes?: number
    models?: Record<
      string,
      {
        provider?: string
        model?: string
        effort?: string
        timeoutMs?: number
        maxOutputTokens?: number
        baseUrl?: string
        limits?: { rpm?: number; rpd?: number; tpm?: number }
      }
    >
  }
  rateLimit?: { rpm?: number; rpd?: number }
  session?: { ttl?: number; windowSize?: number; maxRehydrationAge?: number; historyRetentionDays?: number }
  discord?: {
    maxMessageLength?: number
    maxAttachmentBytesPerTurn?: number
    maxInFlightAttachmentBytes?: number
  }
  socialPosts?: {
    enabled?: boolean
    maxLookupsPerTurn?: number
    timeoutMs?: number
    maxTextChars?: number
    cacheTtlMs?: number
    maxCacheEntries?: number
    maxReplies?: number
    maxRepliesOnRequest?: number
    maxReplyChars?: number
    ytDlpPath?: string
  }
  media?: {
    watcher?: string
    watchTimeoutMs?: number
    digestMaxOutputTokens?: number
    skimClips?: number
    skimClipSeconds?: number
    maxStreamedUploadBytes?: number
    uploadTimeoutMs?: number
    qwen?: {
      model?: string
      secondsPerFrame?: number
      minFrames?: number
      maxFrames?: number
      frameHeight?: number
      timeoutMs?: number
    }
    transcriber?: { url?: string; timeoutMs?: number; maxSpeechSec?: number; maxAudioSec?: number }
  }
  memory?: {
    bufferSize?: number
    contextSize?: number
    channelMonitorTtlMs?: number
    maxClaimsPerTurn?: number
    retrievalTokenBudget?: number
    guildFactsTokenBudget?: number
    recentParticipantLimit?: number
    speakerMinShare?: number
    maxActiveClaimsPerUser?: number
    stableClaimRetentionDays?: number
    claimRetentionDays?: number
    failedExtractionRetentionDays?: number
    transientClaimRetentionDays?: number
    deadClaimRetentionDays?: number
    salienceHalfLifeDays?: number
    recallCooldownMs?: number
    episodeLullMs?: number
    episodeMaxMessages?: number
    admitThreshold?: number
    verifyThreshold?: number
    modelAdmitThreshold?: number
    modelVerifyThreshold?: number
    episodeRecallK?: number
    episodeTokenBudget?: number
    episodeMinSimilarity?: number
    episodeRetentionDays?: number
    mediaRecallK?: number
    mediaTokenBudget?: number
    mediaMinSimilarity?: number
    mediaRetentionDays?: number
    embeddingModel?: string
    embeddingTimeoutMs?: number
    privacy?: string
    recall?: string
    recallTokenBudget?: number
    recallCoreFacts?: number
    factMinSimilarity?: number
    serverFactMinSimilarity?: number
    vaultExportDir?: string
    extractionSampleRate?: number
    extractionSampleDays?: number
    reclassifyMaxPerRun?: number
  }
  embeddings?: {
    provider?: string
    model?: string
    timeoutMs?: number
    sidecarUrl?: string
    backfillBatchSize?: number
    backfillGapMs?: number
    minSimilarity?: Record<string, { episode?: number; media?: number; fact?: number; serverFact?: number }>
  }
  metrics?: { retentionDays?: number; diagnosticsRetentionHours?: number }
  report?: {
    maxPerUserPerHour?: number
    maxAttachmentBytes?: number
    historyMessages?: number
    historyMaxAgeMs?: number
  }
  emoji?: { probability?: number; cooldownMs?: number }
  reminders?: { checkIntervalMs?: number; maxPerUser?: number; staleThresholdMs?: number }
  games?: { hangmanLives?: number; hangmanTimeoutMs?: number; shiritoriTimeoutMs?: number; shinyChance?: number }
  statusCycleMs?: number
  timezone?: string
  logging?: { level?: string }
}

function loadYamlConfig(): YamlConfig {
  const configPath = process.env.ROKABOT_CONFIG_PATH || resolve(import.meta.dirname ?? '.', '..', 'config.yml')
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

function envString(key: string): string | undefined {
  return process.env[key] || undefined
}

function envBoolean(key: string): boolean | undefined {
  const raw = process.env[key]?.trim().toLowerCase()
  if (!raw) return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`Environment variable ${key} must be true or false`)
}

export type JevMode = 'off' | 'shadow' | 'on'
export type MemoryPrivacy = 'relaxed' | 'balanced' | 'strict' | 'off'
export type MemoryRecallMode = 'legacy' | 'shadow' | 'unified'
export type MediaWatcher = 'gemini' | 'qwen' | 'direct' | 'off'
export type MemoryJudge = 'jev' | 'model' | 'none'

// Jev judges whenever its key is set. Without it the main model judges, except on the legacy config (no `llm:`
// block), which keeps today's behaviour of judging nothing.
function memoryJudge(): MemoryJudge {
  if (envString('TYPESAFE_API_KEY')) return 'jev'
  return yaml.llm ? 'model' : 'none'
}

function jevMode(key: 'tone' | 'referents' | 'prefetch', envKey: string): JevMode {
  const envValue = envString(envKey)
  const value = envValue ?? yaml.jev?.[key] ?? 'shadow'
  if (value === 'off' || value === 'shadow' || value === 'on') return value
  const source = envValue ? `Environment variable ${envKey}` : `Config value jev.${key}`
  throw new Error(`${source} must be off, shadow or on, got: ${String(value)}`)
}

function mediaWatcher(): MediaWatcher {
  const envValue = envString('MEDIA_WATCHER')
  const value = envValue ?? yaml.media?.watcher ?? 'gemini'
  if (value === 'gemini' || value === 'qwen' || value === 'direct' || value === 'off') return value
  const source = envValue ? 'Environment variable MEDIA_WATCHER' : 'Config value media.watcher'
  throw new Error(`${source} must be gemini, qwen, direct or off, got: ${String(value)}`)
}

// Only the watcher's `gemini` mode requires the key, though the qwen watcher still falls back to Gemini on failure.
export function geminiKeyRequired(roles: {
  main: ProviderId
  fallback: ProviderId | null
  embeddings: EmbeddingProvider
  watcher: MediaWatcher
}): boolean {
  return (
    roles.main === 'gemini' ||
    roles.fallback === 'gemini' ||
    roles.embeddings === 'gemini' ||
    roles.watcher === 'gemini'
  )
}

function memoryEnum<T extends string>(key: 'privacy' | 'recall', envKey: string, values: readonly T[], fallback: T): T {
  const envValue = envString(envKey)
  const value = envValue ?? yaml.memory?.[key] ?? fallback
  if ((values as readonly string[]).includes(String(value))) return value as T
  const source = envValue ? `Environment variable ${envKey}` : `Config value memory.${key}`
  const allowed = `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`
  throw new Error(`${source} must be ${allowed}, got: ${String(value)}`)
}

export interface ResolvedModel {
  /** The llm.models key, e.g. 'haiku'; 'legacy-gemini' / 'legacy-fallback' when synthesised. */
  key: string
  provider: ProviderId
  model: string
  profile: ModelProfile
  apiKey: string
  baseUrl?: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: string
  limits?: { rpm?: number; rpd?: number; tpm?: number }
}

export interface LlmConfig {
  main: ResolvedModel
  fallback: ResolvedModel | null
  hedgeAfterMs: number
  stickyMs: number
  monthlyBudgetUsd: Partial<Record<ProviderId, number>>
  modelscopeDailyMagicubes: number
}

interface LegacyModelSettings {
  gemini: { apiKey: string; model: string; timeout: number; maxOutputTokens: number; hedgeAfterMs: number }
  fallback: { apiKey: string | undefined; model: string; baseUrl: string; timeoutMs: number; stickyMs: number }
}

// Inherits the family's tested capabilities so a GEMINI_MODEL or FALLBACK_MODEL override keeps working as it
// does today; D12's tested-profile rule applies to llm.models entries only.
function legacyProfile(provider: ProviderId, model: string): ModelProfile {
  const family = MODEL_PROFILES.find((profile) => profile.provider === provider)
  if (!family) throw new Error(`No ${provider} profile to synthesise the legacy route from`)
  return profileFor(provider, model) ?? { ...family, model }
}

function legacyLlm(settings: LegacyModelSettings): LlmConfig {
  return {
    main: {
      key: 'legacy-gemini',
      provider: 'gemini',
      model: settings.gemini.model,
      profile: legacyProfile('gemini', settings.gemini.model),
      apiKey: settings.gemini.apiKey,
      timeoutMs: settings.gemini.timeout,
      maxOutputTokens: settings.gemini.maxOutputTokens,
      limits: resolveLimits('gemini', undefined)
    },
    fallback: settings.fallback.apiKey
      ? {
          key: 'legacy-fallback',
          provider: 'modelscope',
          model: settings.fallback.model,
          profile: legacyProfile('modelscope', settings.fallback.model),
          apiKey: settings.fallback.apiKey,
          baseUrl: settings.fallback.baseUrl,
          timeoutMs: settings.fallback.timeoutMs,
          maxOutputTokens: settings.gemini.maxOutputTokens,
          limits: resolveLimits('modelscope', undefined)
        }
      : null,
    hedgeAfterMs: settings.gemini.hedgeAfterMs,
    stickyMs: settings.fallback.stickyMs,
    monthlyBudgetUsd: {},
    modelscopeDailyMagicubes: yaml.llm?.modelscopeDailyMagicubes ?? 250
  }
}

const PROVIDER_KEY_ENV: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY'
}
const DEFAULT_MONTHLY_BUDGET_USD: Partial<Record<ProviderId, number>> = { anthropic: 5, openai: 5 }

type YamlModels = NonNullable<NonNullable<YamlConfig['llm']>['models']>

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_KEY_ENV, value)
}

function resolveRole(
  models: YamlModels | undefined,
  settings: LegacyModelSettings,
  role: 'main' | 'fallback',
  key: string,
  fromEnv: boolean
): ResolvedModel {
  const source = fromEnv ? `Environment variable LLM_${role.toUpperCase()}` : `Config value llm.${role}`
  const entry = models?.[key]
  if (!entry) throw new Error(`${source} must name a key under llm.models, got: ${key}`)
  const at = `Config value llm.models.${key}`
  if (!isProviderId(entry.provider)) {
    throw new Error(`${at}.provider must be gemini, anthropic, openai or modelscope, got: ${String(entry.provider)}`)
  }
  const profile = profileFor(entry.provider, String(entry.model))
  if (!profile) throw new Error(`${at}.model has no tested ${entry.provider} profile, got: ${String(entry.model)}`)
  if (!profile.verified)
    throw new Error(`${at}.model ${profile.model} is an untested candidate and cannot be llm.${role}`)
  const efforts = profile.thinking.efforts
  if (entry.effort !== undefined && !efforts.includes(entry.effort)) {
    throw new Error(
      efforts.length === 0
        ? `${at}.effort is not accepted by ${profile.model}, got: ${entry.effort}`
        : `${at}.effort must be one of ${efforts.join(', ')}, got: ${entry.effort}`
    )
  }
  const keyEnv = PROVIDER_KEY_ENV[entry.provider]
  const apiKey = entry.provider === 'gemini' ? settings.gemini.apiKey : envString(keyEnv)
  if (!apiKey) throw new Error(`Missing required environment variable: ${keyEnv} (llm.${role} uses ${entry.provider})`)
  return {
    key,
    provider: entry.provider,
    model: profile.model,
    profile,
    apiKey,
    baseUrl: entry.baseUrl ?? (entry.provider === 'modelscope' ? settings.fallback.baseUrl : undefined),
    timeoutMs: entry.timeoutMs ?? settings.gemini.timeout,
    maxOutputTokens: entry.maxOutputTokens ?? settings.gemini.maxOutputTokens,
    effort: entry.effort ?? profile.thinking.defaultEffort,
    limits: resolveLimits(entry.provider, entry.limits)
  }
}

function resolveLlm(settings: LegacyModelSettings): LlmConfig {
  const block = yaml.llm
  const envMain = envString('LLM_MAIN')
  const envFallback = envString('LLM_FALLBACK')
  if (!block) {
    if (envMain) throw new Error(`Environment variable LLM_MAIN needs an llm: block in config.yml, got: ${envMain}`)
    if (envFallback && envFallback !== 'none') {
      throw new Error(`Environment variable LLM_FALLBACK needs an llm: block in config.yml, got: ${envFallback}`)
    }
    const legacy = legacyLlm(settings)
    return envFallback === 'none' ? { ...legacy, fallback: null } : legacy
  }

  const mainKey = envMain ?? block.main
  if (!mainKey) throw new Error('Config value llm.main is required when config.yml has an llm: block')
  const fallbackKey = envFallback === 'none' ? null : (envFallback ?? block.fallback ?? null)
  return {
    main: resolveRole(block.models, settings, 'main', mainKey, envMain !== undefined),
    fallback:
      fallbackKey === null
        ? null
        : resolveRole(block.models, settings, 'fallback', fallbackKey, envFallback !== undefined),
    hedgeAfterMs: block.hedgeAfterMs ?? 0,
    stickyMs: block.stickyMs ?? 300_000,
    monthlyBudgetUsd: block.monthlyBudgetUsd ?? DEFAULT_MONTHLY_BUDGET_USD,
    modelscopeDailyMagicubes: block.modelscopeDailyMagicubes ?? 250
  }
}

const geminiModel = envString('GEMINI_MODEL') ?? yaml.gemini?.model ?? 'gemini-2.0-flash-lite'
const memoryBufferSize = envInt('MEMORY_BUFFER_SIZE') ?? yaml.memory?.bufferSize ?? 30
const rateLimit = {
  rpm: envInt('RATE_LIMIT_RPM') ?? yaml.rateLimit?.rpm ?? 15,
  rpd: envInt('RATE_LIMIT_RPD') ?? yaml.rateLimit?.rpd ?? 500
}
const geminiMaxTokensPerMinute = envInt('GEMINI_MAX_TOKENS_PER_MINUTE') ?? yaml.gemini?.maxTokensPerMinute ?? 125_000

type ModelLimits = NonNullable<ResolvedModel['limits']>

/**
 * A Gemini entry inherits `rateLimit` and `gemini.maxTokensPerMinute`, so the synthesised legacy route keeps exactly
 * the limits it has always had. Other providers are limited only where their entry says so.
 */
function resolveLimits(provider: ProviderId, own: ModelLimits | undefined): ModelLimits | undefined {
  const limits: ModelLimits = {
    ...(provider === 'gemini' ? { rpm: rateLimit.rpm, rpd: rateLimit.rpd, tpm: geminiMaxTokensPerMinute } : {}),
    ...own
  }
  return Object.keys(limits).length > 0 ? limits : undefined
}

const requestedEpisodeMaxMessages = yaml.memory?.episodeMaxMessages ?? 25
const episodeMaxMessages = Math.min(requestedEpisodeMaxMessages, memoryBufferSize - 3)

function embeddingProvider(): EmbeddingProvider {
  const envValue = envString('EMBEDDINGS_PROVIDER')
  const value =
    envValue ??
    yaml.embeddings?.provider ??
    defaultEmbeddingProvider({
      hasBlock: Boolean(yaml.embeddings),
      hasGeminiKey: envString('GEMINI_API_KEY') !== undefined
    })
  if (value === 'local' || value === 'gemini' || value === 'openai') return value
  const source = envValue ? 'Environment variable EMBEDDINGS_PROVIDER' : 'Config value embeddings.provider'
  throw new Error(`${source} must be local, gemini or openai, got: ${String(value)}`)
}

const EMBEDDING_KEYS: Readonly<Record<EmbeddingProvider, string | undefined>> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  local: undefined
}

function resolveEmbeddings() {
  const provider = embeddingProvider()
  // memory.embeddingModel is deprecated and only ever named a Gemini model.
  const legacyModel = provider === 'gemini' ? yaml.memory?.embeddingModel : undefined
  const model = yaml.embeddings?.model ?? legacyModel ?? DEFAULT_EMBEDDING_MODELS[provider]
  const dim = embeddingDimensions(provider, model)
  if (dim === undefined) {
    throw new Error(`Config value embeddings.model is not a tested ${provider} embedding model, got: ${model}`)
  }
  const apiKeyName = EMBEDDING_KEYS[provider]
  return {
    provider,
    model,
    dim,
    fingerprint: embeddingFingerprint(provider, model, dim),
    timeoutMs: yaml.embeddings?.timeoutMs ?? yaml.memory?.embeddingTimeoutMs ?? 1500,
    sidecarUrl: yaml.embeddings?.sidecarUrl ?? 'http://embeddings:8080',
    apiKey: apiKeyName ? requiredEnv(apiKeyName) : undefined,
    backfillBatchSize: yaml.embeddings?.backfillBatchSize ?? 3600,
    backfillGapMs: yaml.embeddings?.backfillGapMs ?? 1000
  }
}

const embeddings = resolveEmbeddings()
const similarityFloors = yaml.embeddings?.minSimilarity?.[embeddings.fingerprint]

const baseConfig = {
  jev: {
    apiKey: envString('TYPESAFE_API_KEY'),
    model: envString('JEV_MODEL') ?? yaml.jev?.model ?? 'jev-1.13.0',
    timeoutMs: yaml.jev?.timeoutMs ?? 1200,
    memoryTimeoutMs: yaml.jev?.memoryTimeoutMs ?? 5000,
    tone: jevMode('tone', 'JEV_TONE'),
    referents: jevMode('referents', 'JEV_REFERENTS'),
    prefetch: jevMode('prefetch', 'JEV_PREFETCH'),
    toneMinProbability: yaml.jev?.toneMinProbability ?? 0.3,
    prefetchMinNoul: yaml.jev?.prefetchMinNoul ?? 0.7,
    prefetchWaitMs: yaml.jev?.prefetchWaitMs ?? 4000,
    referentMinConfidence: yaml.jev?.referentMinConfidence ?? 0.8
  },
  discord: {
    token: requiredEnv('DISCORD_TOKEN'),
    clientId: requiredEnv('DISCORD_CLIENT_ID'),
    maxMessageLength: envInt('DISCORD_MAX_MESSAGE_LENGTH') ?? yaml.discord?.maxMessageLength ?? 2000,
    maxAttachmentBytesPerTurn:
      envInt('DISCORD_MAX_ATTACHMENT_BYTES_PER_TURN') ?? yaml.discord?.maxAttachmentBytesPerTurn ?? 10_485_760,
    maxInFlightAttachmentBytes:
      envInt('DISCORD_MAX_INFLIGHT_ATTACHMENT_BYTES') ?? yaml.discord?.maxInFlightAttachmentBytes ?? 33_554_432
  },
  socialPosts: {
    enabled: envBoolean('SOCIAL_POSTS_ENABLED') ?? yaml.socialPosts?.enabled ?? true,
    maxLookupsPerTurn: yaml.socialPosts?.maxLookupsPerTurn ?? 1,
    timeoutMs: yaml.socialPosts?.timeoutMs ?? 6000,
    maxTextChars: yaml.socialPosts?.maxTextChars ?? 1500,
    cacheTtlMs: yaml.socialPosts?.cacheTtlMs ?? 900_000,
    maxCacheEntries: yaml.socialPosts?.maxCacheEntries ?? 256,
    maxReplies: yaml.socialPosts?.maxReplies ?? 5,
    maxRepliesOnRequest: yaml.socialPosts?.maxRepliesOnRequest ?? 50,
    maxReplyChars: yaml.socialPosts?.maxReplyChars ?? 280,
    ytDlpPath: yaml.socialPosts?.ytDlpPath ?? 'yt-dlp'
  },
  media: {
    watcher: mediaWatcher(),
    watchTimeoutMs: yaml.media?.watchTimeoutMs ?? 20_000,
    digestMaxOutputTokens: yaml.media?.digestMaxOutputTokens ?? 2400,
    skimClips: yaml.media?.skimClips ?? 8,
    skimClipSeconds: yaml.media?.skimClipSeconds ?? 10,
    maxStreamedUploadBytes: yaml.media?.maxStreamedUploadBytes ?? 52_428_800,
    uploadTimeoutMs: yaml.media?.uploadTimeoutMs ?? 45_000,
    qwen: {
      apiKey: envString('MODELSCOPE_API_KEY'),
      // Read from the legacy fallback block so a custom ModelScope endpoint still reaches the watcher.
      baseUrl: yaml.fallback?.baseUrl ?? 'https://api-inference.modelscope.ai/v1',
      model: envString('MEDIA_QWEN_MODEL') ?? yaml.media?.qwen?.model ?? 'Qwen/Qwen3.5-35B-A3B',
      secondsPerFrame: yaml.media?.qwen?.secondsPerFrame ?? 4,
      minFrames: yaml.media?.qwen?.minFrames ?? 16,
      maxFrames: yaml.media?.qwen?.maxFrames ?? 32,
      frameHeight: yaml.media?.qwen?.frameHeight ?? 360,
      timeoutMs: yaml.media?.qwen?.timeoutMs ?? 30_000
    },
    transcriber: {
      url: envString('MEDIA_TRANSCRIBER_URL') ?? yaml.media?.transcriber?.url ?? '',
      timeoutMs: yaml.media?.transcriber?.timeoutMs ?? 45_000,
      maxSpeechSec: yaml.media?.transcriber?.maxSpeechSec ?? 120,
      maxAudioSec: yaml.media?.transcriber?.maxAudioSec ?? 180
    }
  },
  gemini: {
    apiKey: envString('GEMINI_API_KEY') ?? '',
    model: geminiModel,
    extractionModel: envString('GEMINI_EXTRACTION_MODEL') ?? yaml.gemini?.extractionModel ?? geminiModel,
    timeout: envInt('GEMINI_TIMEOUT') ?? yaml.gemini?.timeout ?? 15_000,
    maxRetries: envInt('GEMINI_MAX_RETRIES') ?? yaml.gemini?.maxRetries ?? 1,
    maxOutputTokens: envInt('GEMINI_MAX_OUTPUT_TOKENS') ?? yaml.gemini?.maxOutputTokens ?? 300,
    maxAttachmentTokens: envInt('GEMINI_MAX_ATTACHMENT_TOKENS') ?? yaml.gemini?.maxAttachmentTokens ?? 125_000,
    maxTokensPerMinute: geminiMaxTokensPerMinute,
    safetyThreshold: envString('GEMINI_SAFETY_THRESHOLD') ?? yaml.gemini?.safetyThreshold ?? 'OFF',
    maxLlmCalls: yaml.gemini?.maxLlmCalls ?? 4,
    hedgeAfterMs: envInt('GEMINI_HEDGE_AFTER_MS') ?? yaml.gemini?.hedgeAfterMs ?? 5_000,
    liveMaxRetries: envInt('GEMINI_LIVE_MAX_RETRIES') ?? yaml.gemini?.liveMaxRetries ?? 2,
    retryRpmFloor: envInt('GEMINI_RETRY_RPM_FLOOR') ?? yaml.gemini?.retryRpmFloor ?? 2,
    retryBackoffBaseMs: envInt('GEMINI_RETRY_BACKOFF_BASE_MS') ?? yaml.gemini?.retryBackoffBaseMs ?? 1000,
    retryBackoffCapMs: envInt('GEMINI_RETRY_BACKOFF_CAP_MS') ?? yaml.gemini?.retryBackoffCapMs ?? 12_000,
    turnDeadlineMs: envInt('GEMINI_TURN_DEADLINE_MS') ?? yaml.gemini?.turnDeadlineMs ?? 60_000
  },
  fallback: {
    apiKey: envString('MODELSCOPE_API_KEY'),
    model: envString('FALLBACK_MODEL') ?? yaml.fallback?.model ?? 'Qwen/Qwen3.5-122B-A10B',
    baseUrl: yaml.fallback?.baseUrl ?? 'https://api-inference.modelscope.ai/v1',
    timeoutMs: yaml.fallback?.timeoutMs ?? 15_000,
    stickyMs: yaml.fallback?.stickyMs ?? 300_000
  },
  logging: {
    level: envString('LOG_LEVEL') ?? yaml.logging?.level ?? 'info'
  },
  rateLimit,
  session: {
    ttlMs: envInt('SESSION_TTL_MS') ?? yaml.session?.ttl ?? 300_000,
    windowSize: envInt('SESSION_WINDOW_SIZE') ?? yaml.session?.windowSize ?? 20,
    maxRehydrationAge: yaml.session?.maxRehydrationAge ?? 7_200_000,
    historyRetentionDays: yaml.session?.historyRetentionDays ?? 7
  },
  memory: {
    bufferSize: memoryBufferSize,
    contextSize: yaml.memory?.contextSize ?? 10,
    channelMonitorTtlMs: yaml.memory?.channelMonitorTtlMs ?? 86_400_000,
    maxClaimsPerTurn: envInt('MEMORY_MAX_CLAIMS_PER_TURN') ?? yaml.memory?.maxClaimsPerTurn ?? 10,
    retrievalTokenBudget: envInt('MEMORY_RETRIEVAL_TOKEN_BUDGET') ?? yaml.memory?.retrievalTokenBudget ?? 350,
    guildFactsTokenBudget: envInt('MEMORY_GUILD_FACTS_TOKEN_BUDGET') ?? yaml.memory?.guildFactsTokenBudget ?? 150,
    recentParticipantLimit: envInt('MEMORY_RECENT_PARTICIPANT_LIMIT') ?? yaml.memory?.recentParticipantLimit ?? 3,
    speakerMinShare: envNumber('MEMORY_SPEAKER_MIN_SHARE') ?? yaml.memory?.speakerMinShare ?? 0.5,
    maxActiveClaimsPerUser: envInt('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER') ?? yaml.memory?.maxActiveClaimsPerUser ?? 20,
    stableClaimRetentionDays: yaml.memory?.stableClaimRetentionDays ?? 180,
    claimRetentionDays: envInt('MEMORY_CLAIM_RETENTION_DAYS') ?? yaml.memory?.claimRetentionDays ?? 30,
    failedExtractionRetentionDays:
      envInt('MEMORY_FAILED_EXTRACTION_RETENTION_DAYS') ?? yaml.memory?.failedExtractionRetentionDays ?? 7,
    transientClaimRetentionDays: yaml.memory?.transientClaimRetentionDays ?? 14,
    deadClaimRetentionDays: yaml.memory?.deadClaimRetentionDays ?? 30,
    salienceHalfLifeDays: yaml.memory?.salienceHalfLifeDays ?? 30,
    recallCooldownMs: yaml.memory?.recallCooldownMs ?? 21_600_000,
    episodeLullMs: yaml.memory?.episodeLullMs ?? 180_000,
    episodeMaxMessages,
    admitThreshold: yaml.memory?.admitThreshold ?? 0.5,
    verifyThreshold: yaml.memory?.verifyThreshold ?? 0.5,
    modelAdmitThreshold: yaml.memory?.modelAdmitThreshold ?? 0.7,
    modelVerifyThreshold: yaml.memory?.modelVerifyThreshold ?? 0.7,
    judge: memoryJudge(),
    episodeRecallK: yaml.memory?.episodeRecallK ?? 3,
    episodeTokenBudget: yaml.memory?.episodeTokenBudget ?? 200,
    episodeMinSimilarity: similarityFloors?.episode ?? yaml.memory?.episodeMinSimilarity ?? 0.7,
    episodeRetentionDays: yaml.memory?.episodeRetentionDays ?? 90,
    mediaRecallK: yaml.memory?.mediaRecallK ?? 2,
    mediaTokenBudget: yaml.memory?.mediaTokenBudget ?? 400,
    mediaMinSimilarity: similarityFloors?.media ?? yaml.memory?.mediaMinSimilarity ?? 0.7,
    mediaRetentionDays: yaml.memory?.mediaRetentionDays ?? 90,
    embeddingModel: embeddings.model,
    embeddingTimeoutMs: embeddings.timeoutMs,
    privacy: memoryEnum('privacy', 'MEMORY_PRIVACY', ['relaxed', 'balanced', 'strict', 'off'], 'relaxed'),
    recall: memoryEnum('recall', 'MEMORY_RECALL', ['legacy', 'shadow', 'unified'], 'shadow'),
    recallTokenBudget: yaml.memory?.recallTokenBudget ?? 600,
    recallCoreFacts: yaml.memory?.recallCoreFacts ?? 3,
    factMinSimilarity: similarityFloors?.fact ?? yaml.memory?.factMinSimilarity ?? 0.65,
    serverFactMinSimilarity: similarityFloors?.serverFact ?? yaml.memory?.serverFactMinSimilarity ?? 0.65,
    vaultExportDir: envString('MEMORY_VAULT_EXPORT_DIR') ?? yaml.memory?.vaultExportDir ?? 'data/vault',
    extractionSampleRate: envNumber('MEMORY_EXTRACTION_SAMPLE_RATE') ?? yaml.memory?.extractionSampleRate ?? 0.1,
    extractionSampleDays: envInt('MEMORY_EXTRACTION_SAMPLE_DAYS') ?? yaml.memory?.extractionSampleDays ?? 14,
    reclassifyMaxPerRun: envInt('MEMORY_RECLASSIFY_MAX_PER_RUN') ?? yaml.memory?.reclassifyMaxPerRun ?? 20
  },
  embeddings,
  metrics: {
    retentionDays: envInt('METRICS_RETENTION_DAYS') ?? yaml.metrics?.retentionDays ?? 90,
    diagnosticsRetentionHours:
      envInt('METRICS_DIAGNOSTICS_RETENTION_HOURS') ?? yaml.metrics?.diagnosticsRetentionHours ?? 72
  },
  report: {
    maxPerUserPerHour: yaml.report?.maxPerUserPerHour ?? 5,
    maxAttachmentBytes: yaml.report?.maxAttachmentBytes ?? 8_388_608,
    historyMessages: yaml.report?.historyMessages ?? 20,
    historyMaxAgeMs: yaml.report?.historyMaxAgeMs ?? 7_200_000
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

const llm = resolveLlm(baseConfig)

// A legacy config (no llm: block) has a Gemini main, so the key stays required there with this same message.
if (
  geminiKeyRequired({
    main: llm.main.provider,
    fallback: llm.fallback?.provider ?? null,
    embeddings: embeddings.provider,
    watcher: baseConfig.media.watcher
  })
) {
  requiredEnv('GEMINI_API_KEY')
}

/** Merged config: env overrides > config.yml > hardcoded defaults */
export const config = { ...baseConfig, llm } as const

function modelBounds(role: 'main' | 'fallback', model: ResolvedModel) {
  return [
    { path: `llm.${role}.timeoutMs`, value: model.timeoutMs, min: 1 },
    // Config can lower a profile's limit; it cannot raise it.
    { path: `llm.${role}.maxOutputTokens`, value: model.maxOutputTokens, min: 1, max: model.profile.maxOutputTokens }
  ]
}

/**
 * Rows for the limits a configured route carries. The synthesised legacy routes get none: their limits are the
 * `rateLimit` and `gemini.maxTokensPerMinute` values already bounded here, and a row would name a path nobody wrote.
 * A main route must fund one whole reply turn, because the Discord guard reserves `maxLlmCalls` requests and admits an
 * attachment turn only when a whole `maxAttachmentTokens` fits in the minute.
 */
function routeLimitBounds(
  route: ResolvedModel | null,
  isMain: boolean
): Array<{ path: string; value: number; min: number }> {
  if (!route?.limits || route.key.startsWith('legacy-')) return []
  const path = `llm.models.${route.key}.limits`
  const { rpm, rpd, tpm } = route.limits
  return [
    ...(rpm === undefined ? [] : [{ path: `${path}.rpm`, value: rpm, min: isMain ? config.gemini.maxLlmCalls : 1 }]),
    ...(rpd === undefined ? [] : [{ path: `${path}.rpd`, value: rpd, min: 1 }]),
    ...(tpm === undefined
      ? []
      : [{ path: `${path}.tpm`, value: tpm, min: isMain ? config.gemini.maxAttachmentTokens : 1 }])
  ]
}

/**
 * Bounds for every numeric tunable, env-overridable or yaml-only, re-derived from resolved config
 * values so a dropped or mis-wired row shows up in `NUMERIC_BOUNDS`, not just at runtime. min: 1
 * keys silently break the behaviour they gate at zero or below (e.g. gemini.timeout: 0 aborts
 * every request instantly); min: 0 keys have a legitimate "off"/"no floor" meaning at zero (e.g.
 * gemini.maxRetries: 0 means "don't retry"). max is optional and only set on fractions where any
 * value above it is definitionally meaningless (e.g. a share greater than 1).
 */
export const NUMERIC_BOUNDS: ReadonlyArray<{ path: string; value: number; min: number; max?: number }> = [
  { path: 'jev.timeoutMs', value: config.jev.timeoutMs, min: 1 },
  { path: 'jev.memoryTimeoutMs', value: config.jev.memoryTimeoutMs, min: 1 },
  { path: 'fallback.timeoutMs', value: config.fallback.timeoutMs, min: 1 },
  { path: 'fallback.stickyMs', value: config.fallback.stickyMs, min: 0 },
  { path: 'jev.toneMinProbability', value: config.jev.toneMinProbability, min: 0, max: 1 },
  { path: 'jev.prefetchMinNoul', value: config.jev.prefetchMinNoul, min: 0, max: 1 },
  { path: 'jev.prefetchWaitMs', value: config.jev.prefetchWaitMs, min: 0 },
  { path: 'jev.referentMinConfidence', value: config.jev.referentMinConfidence, min: 0, max: 1 },
  { path: 'gemini.timeout', value: config.gemini.timeout, min: 1 },
  { path: 'socialPosts.maxLookupsPerTurn', value: config.socialPosts.maxLookupsPerTurn, min: 1, max: 1 },
  { path: 'socialPosts.timeoutMs', value: config.socialPosts.timeoutMs, min: 1, max: 30_000 },
  { path: 'socialPosts.maxTextChars', value: config.socialPosts.maxTextChars, min: 1, max: 10_000 },
  { path: 'socialPosts.cacheTtlMs', value: config.socialPosts.cacheTtlMs, min: 0 },
  { path: 'socialPosts.maxCacheEntries', value: config.socialPosts.maxCacheEntries, min: 1, max: 10_000 },
  { path: 'socialPosts.maxReplies', value: config.socialPosts.maxReplies, min: 1, max: 10 },
  { path: 'socialPosts.maxRepliesOnRequest', value: config.socialPosts.maxRepliesOnRequest, min: 1, max: 50 },
  { path: 'socialPosts.maxReplyChars', value: config.socialPosts.maxReplyChars, min: 40, max: 1000 },
  { path: 'media.watchTimeoutMs', value: config.media.watchTimeoutMs, min: 5000, max: 60_000 },
  { path: 'media.digestMaxOutputTokens', value: config.media.digestMaxOutputTokens, min: 400, max: 4000 },
  { path: 'media.skimClips', value: config.media.skimClips, min: 3, max: 9 },
  { path: 'media.skimClipSeconds', value: config.media.skimClipSeconds, min: 2, max: 30 },
  {
    path: 'media.maxStreamedUploadBytes',
    value: config.media.maxStreamedUploadBytes,
    min: 10_485_760,
    max: 104_857_600
  },
  { path: 'media.uploadTimeoutMs', value: config.media.uploadTimeoutMs, min: 10_000, max: 120_000 },
  { path: 'media.qwen.secondsPerFrame', value: config.media.qwen.secondsPerFrame, min: 0.5, max: 30 },
  { path: 'media.qwen.minFrames', value: config.media.qwen.minFrames, min: 4, max: 32 },
  { path: 'media.qwen.maxFrames', value: config.media.qwen.maxFrames, min: 4, max: 32 },
  { path: 'media.qwen.frameHeight', value: config.media.qwen.frameHeight, min: 144, max: 720 },
  { path: 'media.qwen.timeoutMs', value: config.media.qwen.timeoutMs, min: 5000, max: 90_000 },
  { path: 'media.transcriber.timeoutMs', value: config.media.transcriber.timeoutMs, min: 5000, max: 120_000 },
  { path: 'media.transcriber.maxSpeechSec', value: config.media.transcriber.maxSpeechSec, min: 10, max: 600 },
  { path: 'media.transcriber.maxAudioSec', value: config.media.transcriber.maxAudioSec, min: 30, max: 900 },
  { path: 'gemini.maxOutputTokens', value: config.gemini.maxOutputTokens, min: 1 },
  // Floor is a full turn of plain images, derived rather than restated: below it a maximal image turn could
  // be refused,
  // and images are the one type whose cost is already known to be bounded and safe.
  //
  // Ceiling matches `maxTokensPerMinute`'s ceiling rather than the measured 250,000 TPM, because that knob
  // takes its FLOOR from this one. At 250,000 an operator could set an attachment ceiling that leaves
  // `maxTokensPerMinute` with no legal value at all — floor above ceiling — and both rows would still read
  // as valid on their own. Nothing above 125,000 could ever be admitted anyway, since a turn is only let in
  // when the minute can fund a whole one.
  {
    path: 'gemini.maxAttachmentTokens',
    value: config.gemini.maxAttachmentTokens,
    min: MAX_ATTACHMENTS * GEMINI_IMAGE_TOKENS,
    max: 125_000
  },
  // Floor is one maximal attachment turn: a budget smaller than the per-turn ceiling could never admit an
  // attachment at all, so the two knobs would silently contradict each other.
  //
  // Ceiling is HALF the measured 250,000 TPM (#125), not the whole of it. The bucket's capacity is its rate,
  // so a rolling minute gets both: an adversary finds it empty, spends the full budget, and spends what
  // drains in on top, for up to 2x the configured value inside one 60s window. Simulated against this
  // module's exact drain arithmetic with maximal 55,626-token turns under rpm 15, the worst rolling minute
  // is 389,382 tokens at a setting of 200,000 — the guard permitting 156% of the ceiling it exists to defend.
  // Bounding the knob at 125,000 makes the worst case 250,000 by construction rather than by hope.
  {
    path: 'gemini.maxTokensPerMinute',
    value: config.gemini.maxTokensPerMinute,
    min: config.gemini.maxAttachmentTokens,
    max: 125_000
  },
  { path: 'gemini.turnDeadlineMs', value: config.gemini.turnDeadlineMs, min: 1 },
  { path: 'gemini.retryBackoffCapMs', value: config.gemini.retryBackoffCapMs, min: 1 },
  { path: 'gemini.maxRetries', value: config.gemini.maxRetries, min: 0 },
  { path: 'gemini.liveMaxRetries', value: config.gemini.liveMaxRetries, min: 0 },
  { path: 'gemini.retryBackoffBaseMs', value: config.gemini.retryBackoffBaseMs, min: 0 },
  { path: 'gemini.retryRpmFloor', value: config.gemini.retryRpmFloor, min: 0 },
  { path: 'gemini.maxLlmCalls', value: config.gemini.maxLlmCalls, min: 1 },
  // min: 0 because zero is the documented off switch, not a misconfiguration.
  { path: 'gemini.hedgeAfterMs', value: config.gemini.hedgeAfterMs, min: 0 },
  // Floor is one turn's worth, derived: `rpm` is counted in requests and a turn reserves `maxLlmCalls` of
  // them, so anything below that admits no turn at all and the bot answers nothing while reporting itself
  // rate-limited. Found by a harness fixture at `rpm: 2` going silent the moment reservations landed (#167).
  { path: 'rateLimit.rpm', value: config.rateLimit.rpm, min: config.gemini.maxLlmCalls },
  { path: 'rateLimit.rpd', value: config.rateLimit.rpd, min: 1 },
  ...routeLimitBounds(config.llm.main, true),
  ...routeLimitBounds(config.llm.fallback, false),
  { path: 'llm.modelscopeDailyMagicubes', value: config.llm.modelscopeDailyMagicubes, min: 1 },
  { path: 'session.ttlMs', value: config.session.ttlMs, min: 1 },
  { path: 'session.windowSize', value: config.session.windowSize, min: 1 },
  { path: 'session.maxRehydrationAge', value: config.session.maxRehydrationAge, min: 0 },
  { path: 'session.historyRetentionDays', value: config.session.historyRetentionDays, min: 1 },
  // 4000 (Components V2 shared TextDisplay budget) − MAX_TOOL_FOOTER_CHARS (73, derived in
  // src/discord/messageBuilder.ts) = 3927; this bot never sends via content.
  { path: 'discord.maxMessageLength', value: config.discord.maxMessageLength, min: 1, max: 3927 },
  {
    path: 'discord.maxAttachmentBytesPerTurn',
    value: config.discord.maxAttachmentBytesPerTurn,
    min: MAX_DOCUMENT_SIZE_BYTES,
    max: 31_457_280
  },
  // This floor matches the maximum value for maxAttachmentBytesPerTurn, so an idle bot can admit a maximal turn.
  { path: 'discord.maxInFlightAttachmentBytes', value: config.discord.maxInFlightAttachmentBytes, min: 31_457_280 },
  { path: 'embeddings.timeoutMs', value: config.embeddings.timeoutMs, min: 1 },
  { path: 'embeddings.backfillBatchSize', value: config.embeddings.backfillBatchSize, min: 1, max: 100_000 },
  { path: 'embeddings.backfillGapMs', value: config.embeddings.backfillGapMs, min: 0, max: 60_000 },
  { path: 'memory.bufferSize', value: config.memory.bufferSize, min: 1 },
  { path: 'memory.contextSize', value: config.memory.contextSize, min: 1 },
  { path: 'memory.channelMonitorTtlMs', value: config.memory.channelMonitorTtlMs, min: 1 },
  { path: 'memory.maxClaimsPerTurn', value: config.memory.maxClaimsPerTurn, min: 1 },
  { path: 'memory.retrievalTokenBudget', value: config.memory.retrievalTokenBudget, min: 1 },
  { path: 'memory.guildFactsTokenBudget', value: config.memory.guildFactsTokenBudget, min: 0 },
  { path: 'memory.recentParticipantLimit', value: config.memory.recentParticipantLimit, min: 1 },
  { path: 'memory.speakerMinShare', value: config.memory.speakerMinShare, min: 0, max: 1 },
  { path: 'memory.maxActiveClaimsPerUser', value: config.memory.maxActiveClaimsPerUser, min: 1 },
  { path: 'memory.stableClaimRetentionDays', value: config.memory.stableClaimRetentionDays, min: 1 },
  { path: 'memory.claimRetentionDays', value: config.memory.claimRetentionDays, min: 1 },
  { path: 'memory.failedExtractionRetentionDays', value: config.memory.failedExtractionRetentionDays, min: 1 },
  { path: 'memory.transientClaimRetentionDays', value: config.memory.transientClaimRetentionDays, min: 1 },
  { path: 'memory.deadClaimRetentionDays', value: config.memory.deadClaimRetentionDays, min: 1 },
  { path: 'memory.salienceHalfLifeDays', value: config.memory.salienceHalfLifeDays, min: 1 },
  { path: 'memory.recallCooldownMs', value: config.memory.recallCooldownMs, min: 0 },
  { path: 'memory.episodeLullMs', value: config.memory.episodeLullMs, min: 1 },
  {
    path: 'memory.episodeMaxMessages',
    value: config.memory.episodeMaxMessages,
    min: 1,
    max: config.memory.bufferSize - 3
  },
  { path: 'memory.admitThreshold', value: config.memory.admitThreshold, min: 0, max: 1 },
  { path: 'memory.verifyThreshold', value: config.memory.verifyThreshold, min: 0, max: 1 },
  { path: 'memory.modelAdmitThreshold', value: config.memory.modelAdmitThreshold, min: 0, max: 1 },
  { path: 'memory.modelVerifyThreshold', value: config.memory.modelVerifyThreshold, min: 0, max: 1 },
  { path: 'memory.episodeRecallK', value: config.memory.episodeRecallK, min: 1, max: 10 },
  { path: 'memory.episodeTokenBudget', value: config.memory.episodeTokenBudget, min: 1 },
  { path: 'memory.episodeMinSimilarity', value: config.memory.episodeMinSimilarity, min: 0, max: 1 },
  { path: 'memory.episodeRetentionDays', value: config.memory.episodeRetentionDays, min: 1 },
  { path: 'memory.mediaRecallK', value: config.memory.mediaRecallK, min: 0, max: 5 },
  { path: 'memory.mediaTokenBudget', value: config.memory.mediaTokenBudget, min: 100, max: 1500 },
  { path: 'memory.mediaMinSimilarity', value: config.memory.mediaMinSimilarity, min: 0, max: 1 },
  { path: 'memory.mediaRetentionDays', value: config.memory.mediaRetentionDays, min: 1, max: 365 },
  { path: 'memory.embeddingTimeoutMs', value: config.memory.embeddingTimeoutMs, min: 1 },
  { path: 'memory.recallTokenBudget', value: config.memory.recallTokenBudget, min: 200, max: 2000 },
  { path: 'memory.recallCoreFacts', value: config.memory.recallCoreFacts, min: 0, max: 5 },
  { path: 'memory.factMinSimilarity', value: config.memory.factMinSimilarity, min: 0, max: 1 },
  { path: 'memory.serverFactMinSimilarity', value: config.memory.serverFactMinSimilarity, min: 0, max: 1 },
  { path: 'memory.extractionSampleRate', value: config.memory.extractionSampleRate, min: 0, max: 1 },
  { path: 'memory.extractionSampleDays', value: config.memory.extractionSampleDays, min: 1, max: 90 },
  { path: 'memory.reclassifyMaxPerRun', value: config.memory.reclassifyMaxPerRun, min: 0, max: 100 },
  { path: 'metrics.retentionDays', value: config.metrics.retentionDays, min: 1 },
  { path: 'metrics.diagnosticsRetentionHours', value: config.metrics.diagnosticsRetentionHours, min: 1 },
  { path: 'report.maxPerUserPerHour', value: config.report.maxPerUserPerHour, min: 1 },
  { path: 'report.maxAttachmentBytes', value: config.report.maxAttachmentBytes, min: 1 },
  { path: 'report.historyMessages', value: config.report.historyMessages, min: 1 },
  { path: 'report.historyMaxAgeMs', value: config.report.historyMaxAgeMs, min: 0 },
  { path: 'emoji.probability', value: config.emoji.probability, min: 0, max: 1 },
  { path: 'emoji.cooldownMs', value: config.emoji.cooldownMs, min: 0 },
  { path: 'reminders.checkIntervalMs', value: config.reminders.checkIntervalMs, min: 1 },
  { path: 'reminders.maxPerUser', value: config.reminders.maxPerUser, min: 1 },
  { path: 'reminders.staleThresholdMs', value: config.reminders.staleThresholdMs, min: 1 },
  { path: 'games.hangmanLives', value: config.games.hangmanLives, min: 1 },
  { path: 'games.hangmanTimeoutMs', value: config.games.hangmanTimeoutMs, min: 1 },
  { path: 'games.shiritoriTimeoutMs', value: config.games.shiritoriTimeoutMs, min: 1 },
  { path: 'games.shinyChance', value: config.games.shinyChance, min: 0, max: 1 },
  { path: 'statusCycleMs', value: config.statusCycleMs, min: 1 },
  { path: 'llm.hedgeAfterMs', value: config.llm.hedgeAfterMs, min: 0 },
  { path: 'llm.stickyMs', value: config.llm.stickyMs, min: 0 },
  // Synthesised legacy values are already bounded as gemini.* and fallback.*, so only a block adds rows.
  ...(yaml.llm
    ? [
        ...modelBounds('main', config.llm.main),
        ...(config.llm.fallback ? modelBounds('fallback', config.llm.fallback) : []),
        ...Object.entries(config.llm.monthlyBudgetUsd).map(([provider, value]) => ({
          path: `llm.monthlyBudgetUsd.${provider}`,
          value: value as number,
          min: 0
        }))
      ]
    : [])
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

if (config.embeddings.provider !== 'gemini' && !similarityFloors) {
  // logger.ts imports this module, so awaiting the import here would deadlock startup.
  void import('./utils/logger.js').then(({ logger }) =>
    logger.warn(
      { fingerprint: config.embeddings.fingerprint },
      'No embeddings.minSimilarity entry for this fingerprint, so recall uses the Gemini floors in memory.*MinSimilarity'
    )
  )
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
