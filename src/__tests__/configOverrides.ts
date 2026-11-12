import { vi } from 'vitest'

export async function warningMessages(): Promise<string[]> {
  const { startupWarnings } = await import('../config.js')
  return startupWarnings.map((warning) => warning.message)
}

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
export function withYamlOverride(override: Record<string, unknown>) {
  vi.doMock('js-yaml', async (importOriginal) => {
    const actual = await importOriginal<typeof import('js-yaml')>()
    return { ...actual, load: (raw: string) => merge(actual.load(raw), override) }
  })
}

export function setRequiredEnvVars() {
  vi.stubEnv('DISCORD_TOKEN', 'test-token')
  vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
  vi.stubEnv('GEMINI_API_KEY', 'test-api-key')
  vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key')
}

/** Clear any env overrides that dotenv may have loaded from .env */
export function clearTunableEnvVars() {
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
  vi.stubEnv('GEMINI_MAX_ATTACHMENT_TOKENS', '')
  vi.stubEnv('GEMINI_MAX_TOKENS_PER_MINUTE', '')
  vi.stubEnv('GEMINI_LIVE_MAX_RETRIES', '')
  vi.stubEnv('GEMINI_RETRY_RPM_FLOOR', '')
  vi.stubEnv('GEMINI_RETRY_BACKOFF_BASE_MS', '')
  vi.stubEnv('GEMINI_RETRY_BACKOFF_CAP_MS', '')
  vi.stubEnv('GEMINI_TURN_DEADLINE_MS', '')
  vi.stubEnv('GEMINI_SAFETY_THRESHOLD', '')
  vi.stubEnv('MEDIA_WATCHER', '')
  vi.stubEnv('MEDIA_QWEN_MODEL', '')
  vi.stubEnv('MEDIA_TRANSCRIBER_URL', '')
  vi.stubEnv('MODELSCOPE_API_KEY', '')
  vi.stubEnv('EMBEDDINGS_PROVIDER', '')
  vi.stubEnv('OPENAI_API_KEY', '')
  vi.stubEnv('FALLBACK_MODEL', '')
  vi.stubEnv('TYPESAFE_API_KEY', '')
  vi.stubEnv('JEV_MODEL', '')
  vi.stubEnv('JEV_TONE', '')
  vi.stubEnv('JEV_REFERENTS', '')
  vi.stubEnv('JEV_PREFETCH', '')
  vi.stubEnv('MEMORY_BUFFER_SIZE', '')
  vi.stubEnv('MEMORY_MAX_CLAIMS_PER_TURN', '')
  vi.stubEnv('MEMORY_RETRIEVAL_TOKEN_BUDGET', '')
  vi.stubEnv('MEMORY_GUILD_FACTS_TOKEN_BUDGET', '')
  vi.stubEnv('MEMORY_RECENT_PARTICIPANT_LIMIT', '')
  vi.stubEnv('MEMORY_SPEAKER_MIN_SHARE', '')
  vi.stubEnv('MEMORY_MAX_ACTIVE_CLAIMS_PER_USER', '')
  vi.stubEnv('MEMORY_CLAIM_RETENTION_DAYS', '')
  vi.stubEnv('MEMORY_FAILED_EXTRACTION_RETENTION_DAYS', '')
  vi.stubEnv('MEMORY_VAULT_EXPORT_DIR', '')
  vi.stubEnv('MEMORY_PRIVACY', '')
  vi.stubEnv('MEMORY_RECALL', '')
  vi.stubEnv('MEMORY_EXTRACTION_SAMPLE_RATE', '')
  vi.stubEnv('MEMORY_EXTRACTION_SAMPLE_DAYS', '')
  vi.stubEnv('MEMORY_RECLASSIFY_MAX_PER_RUN', '')
  vi.stubEnv('METRICS_RETENTION_DAYS', '')
  vi.stubEnv('DISCORD_MAX_MESSAGE_LENGTH', '')
  vi.stubEnv('DISCORD_MAX_ATTACHMENT_BYTES_PER_TURN', '')
  vi.stubEnv('SOCIAL_POSTS_ENABLED', '')
  vi.stubEnv('UPDATES_NOTIFY', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  vi.stubEnv('LLM_MAIN', '')
  vi.stubEnv('LLM_FALLBACK', '')
  vi.stubEnv('GEMINI_HEDGE_AFTER_MS', '')
  vi.stubEnv('SEARCH_PROVIDER', '')
  vi.stubEnv('EXA_API_KEY', '')
  vi.stubEnv('FORMAT_MODE', '')
  vi.stubEnv('FORMAT_REPAIR', '')
}
