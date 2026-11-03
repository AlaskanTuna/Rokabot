import {
  type CompatibleCapabilities,
  MODEL_PROFILES,
  type ModelProfile,
  type ProviderId,
  profileFor
} from './profiles.js'

export interface ResolvedModel {
  /** The llm.models key, e.g. 'haiku'; 'legacy-gemini' / 'legacy-fallback' when synthesised. */
  key: string
  provider: ProviderId
  model: string
  profile: ModelProfile
  /** Empty for a keyless openai-compatible server, which is then sent no Authorization header. */
  apiKey: string
  baseUrl?: string
  timeoutMs: number
  maxOutputTokens: number
  effort?: string
  limits?: { rpm?: number; rpd?: number; tpm?: number }
  /** Declared by an openai-compatible entry; the named Chat Completions providers keep their built-in ones. */
  maxTokensParam?: CompatibleCapabilities['maxTokensParam']
  extraBody?: Record<string, unknown>
}

export interface LlmConfig {
  main: ResolvedModel
  fallback: ResolvedModel | null
  hedgeAfterMs: number
  stickyMs: number
  monthlyBudgetUsd: Partial<Record<ProviderId, number>>
  modelscopeDailyMagicubes: number
}

export interface LegacyModelSettings {
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

// Limits and the Magicube default arrive from src/config.ts, which owns them, so this leaf keeps no runtime
// import back into it.
export function legacyLlm(
  settings: LegacyModelSettings,
  resolveLimits: (provider: ProviderId, own: ResolvedModel['limits']) => ResolvedModel['limits'],
  modelscopeDailyMagicubes: number
): LlmConfig {
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
    modelscopeDailyMagicubes
  }
}
