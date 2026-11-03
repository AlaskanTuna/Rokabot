import type { EmbeddingResult } from '../../src/agent/memory/embeddings/client.js'
import { LOCAL_EMBEDDING_MODEL, embeddingFingerprint } from '../../src/storage/vectorProvenance.js'

export const GEMINI_FINGERPRINT = embeddingFingerprint('gemini', 'gemini-embedding-2', 768)
export const LOCAL_FINGERPRINT = embeddingFingerprint('local', LOCAL_EMBEDDING_MODEL, 384)

export function geminiVector(values: readonly number[]): EmbeddingResult {
  return { values: [...values], modelId: 'gemini-embedding-2', dim: 768, fingerprint: GEMINI_FINGERPRINT }
}

export function localVector(values: readonly number[]): EmbeddingResult {
  return { values: [...values], modelId: LOCAL_EMBEDDING_MODEL, dim: 384, fingerprint: LOCAL_FINGERPRINT }
}
