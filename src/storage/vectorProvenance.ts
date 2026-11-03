import type Database from 'better-sqlite3'

export const UNKNOWN_FINGERPRINT = 'unknown'

export type VectorTable = 'memory_episode' | 'media_digest' | 'memory_claim'

const PROVENANCE_COLUMNS = [
  ['embedding_model_id', 'TEXT'],
  ['embedding_dim', 'INTEGER'],
  ['embedding_fingerprint', 'TEXT']
] as const

/**
 * Runs at every startup, so a vector with no recorded provenance was stored without it (by pre-1C code or after a
 * rollback); it is marked unknown rather than guessed, and its dimension is still knowable from its bytes. Idempotent,
 * and a no-op for a table that does not exist yet.
 */
export function ensureVectorProvenanceColumns(database: Database.Database, table: VectorTable): void {
  const columns = new Set(
    (database.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)
  )
  if (!columns.has('embedding')) return
  database.transaction(() => {
    for (const [name, type] of PROVENANCE_COLUMNS) {
      if (!columns.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
    database
      .prepare(
        `UPDATE ${table} SET embedding_dim = length(embedding) / 4, embedding_fingerprint = ?
         WHERE embedding IS NOT NULL AND embedding_fingerprint IS NULL`
      )
      .run(UNKNOWN_FINGERPRINT)
  })()
}

export type EmbeddingProvider = 'local' | 'gemini' | 'openai'

// The sidecar names its model by repository, revision and quantisation, so a rebuilt image is a new embedding space.
export const LOCAL_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small@761b726d-q8'

export const DEFAULT_EMBEDDING_MODELS: Readonly<Record<EmbeddingProvider, string>> = {
  local: LOCAL_EMBEDDING_MODEL,
  gemini: 'gemini-embedding-2',
  openai: 'text-embedding-3-small'
}

// How each provider prepares text. A vector made under another recipe is not comparable, even from the same model.
const RECIPES: Readonly<Record<EmbeddingProvider, string>> = {
  gemini: 'gemini-task-prefix',
  openai: 'raw',
  local: 'e5-prefix-mean-l2'
}

export function embeddingDimensions(provider: EmbeddingProvider, model: string): number | undefined {
  // Every Gemini request asks for outputDimensionality 768, whatever the model (#223).
  if (provider === 'gemini') return 768
  if (provider === 'openai') return model === 'text-embedding-3-small' ? 1536 : undefined
  return model === LOCAL_EMBEDDING_MODEL ? 384 : undefined
}

export function embeddingFingerprint(provider: EmbeddingProvider, model: string, dim: number): string {
  return `${provider}:${model}:${dim}:${RECIPES[provider]}`
}

export function isEmbeddingVector(value: unknown, dim: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === dim &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

// A config from before the embeddings block keeps today's Gemini vectors while it has a Gemini key; a block that
// leaves out the provider, or a setup without a Gemini key, uses the local sidecar.
export function defaultEmbeddingProvider(input: { hasBlock: boolean; hasGeminiKey: boolean }): EmbeddingProvider {
  return !input.hasBlock && input.hasGeminiKey ? 'gemini' : 'local'
}
