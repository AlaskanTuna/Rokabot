import { type EmbeddingResult, getEmbeddingClient } from './embeddings/client.js'

export type EpisodeEmbeddingRole = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

export function embedEpisodeText(input: {
  text: string
  role: EpisodeEmbeddingRole
  signal?: AbortSignal
}): Promise<EmbeddingResult> {
  return getEmbeddingClient().embed(input.text, input.role === 'RETRIEVAL_QUERY' ? 'query' : 'document', input.signal)
}
