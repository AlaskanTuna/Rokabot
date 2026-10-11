import { GoogleGenAI } from '@google/genai'
import type { EmbeddingClient, EmbeddingSettings } from './client.js'

export function createGeminiEmbeddingClient(settings: EmbeddingSettings): EmbeddingClient {
  let sdk: GoogleGenAI | undefined
  return {
    async embed(text, role, signal) {
      sdk ??= new GoogleGenAI({ apiKey: settings.apiKey })
      const contents = role === 'query' ? 'task: search result | query: ' + text : 'title: none | text: ' + text
      const response = await sdk.models.embedContent({
        model: settings.model,
        contents,
        config: {
          outputDimensionality: settings.dim,
          httpOptions: { timeout: settings.timeoutMs },
          ...(signal ? { abortSignal: signal } : {})
        }
      })
      const values = response.embeddings?.[0]?.values
      if (!values || values.length !== settings.dim || values.some((value) => !Number.isFinite(value))) {
        throw new Error('Gemini returned an invalid episode embedding')
      }
      return { values, modelId: settings.model, dim: settings.dim, fingerprint: settings.fingerprint }
    }
  }
}
