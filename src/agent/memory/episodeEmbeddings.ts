import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import type { EpisodeEmbedding } from '../../storage/memoryEpisodeStore.js'

export type EpisodeEmbeddingRole = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

let client: GoogleGenAI | undefined

function getEmbeddingClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey })
  return client
}

export async function embedEpisodeText(input: {
  text: string
  role: EpisodeEmbeddingRole
  signal?: AbortSignal
}): Promise<EpisodeEmbedding> {
  const contents =
    input.role === 'RETRIEVAL_QUERY'
      ? 'task: search result | query: ' + input.text
      : 'title: none | text: ' + input.text
  const response = await getEmbeddingClient().models.embedContent({
    model: config.memory.embeddingModel,
    contents,
    config: {
      outputDimensionality: 768,
      httpOptions: { timeout: config.memory.embeddingTimeoutMs },
      ...(input.signal ? { abortSignal: input.signal } : {})
    }
  })
  const values = response.embeddings?.[0]?.values
  if (!values || values.length !== 768 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Gemini returned an invalid episode embedding')
  }
  return values
}

export function resetEpisodeEmbeddingClientForTest(): void {
  client = undefined
}
