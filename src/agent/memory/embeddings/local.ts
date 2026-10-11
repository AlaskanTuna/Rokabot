import { logger } from '../../../utils/logger.js'
import type { EmbeddingClient, EmbeddingSettings } from './client.js'
import { isEmbeddingVector } from './fingerprint.js'

type SidecarReply = { model?: unknown; dim?: unknown; vectors?: unknown; truncated?: unknown }

export function createLocalEmbeddingClient(
  settings: EmbeddingSettings,
  fetchImpl: typeof fetch = fetch
): EmbeddingClient {
  const url = `${settings.sidecarUrl.replace(/\/+$/, '')}/embed`
  return {
    async embed(text, role, signal) {
      const timeout = AbortSignal.timeout(settings.timeoutMs)
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: [text], role }),
        signal: AbortSignal.any(signal ? [signal, timeout] : [timeout])
      })
      if (!response.ok) throw new Error(`Embedding sidecar returned HTTP ${response.status}`)
      const reply = (await response.json()) as SidecarReply
      if (reply.model !== settings.model) {
        throw new Error(`Embedding sidecar serves ${String(reply.model)}, but embeddings.model is ${settings.model}`)
      }
      const values = Array.isArray(reply.vectors) ? reply.vectors[0] : undefined
      if (reply.dim !== settings.dim || !isEmbeddingVector(values, settings.dim)) {
        throw new Error('Embedding sidecar returned an invalid embedding')
      }
      if (Array.isArray(reply.truncated) && reply.truncated[0] === true) {
        logger.info({ role, chars: text.length }, 'Embedding input was cut to the 512-token model limit')
      }
      return { values, modelId: settings.model, dim: settings.dim, fingerprint: settings.fingerprint }
    }
  }
}
