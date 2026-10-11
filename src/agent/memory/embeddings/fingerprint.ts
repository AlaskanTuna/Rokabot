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
