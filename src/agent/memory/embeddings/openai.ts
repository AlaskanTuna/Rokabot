import type { EmbeddingClient, EmbeddingSettings } from './client.js'
import { isEmbeddingVector } from './fingerprint.js'

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'

export function createOpenAiEmbeddingClient(
  settings: EmbeddingSettings,
  fetchImpl: typeof fetch = fetch
): EmbeddingClient {
  return {
    // text-embedding-3 models embed queries and documents the same way, so the role is unused.
    async embed(text, _role, signal) {
      const timeout = AbortSignal.timeout(settings.timeoutMs)
      const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: settings.model, input: text, encoding_format: 'float' }),
        signal: AbortSignal.any(signal ? [signal, timeout] : [timeout])
      })
      if (!response.ok) throw new Error(`OpenAI embeddings returned HTTP ${response.status}`)
      const reply = (await response.json()) as { data?: Array<{ embedding?: unknown }> }
      const values = reply.data?.[0]?.embedding
      if (!isEmbeddingVector(values, settings.dim)) throw new Error('OpenAI returned an invalid embedding')
      return { values, modelId: settings.model, dim: settings.dim, fingerprint: settings.fingerprint }
    }
  }
}
