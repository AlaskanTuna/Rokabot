import { config } from '../../config.js'
import { listActiveClaimsForEmbedding, setClaimEmbedding } from '../../storage/memoryRecallStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import { renderFactSentence } from './factSentences.js'

/** Keeps a large backfill from spending the embedding quota that per-turn query embeddings share. */
const FACT_EMBED_GAP_MS = 250

let running: Promise<{ embedded: number; failed: number }> | null = null

/** Embeds active facts that have no embedding or whose sentence changed. One sweep at a time. */
export function embedPendingFacts(
  input: { limit?: number; gapMs?: number } = {}
): Promise<{ embedded: number; failed: number }> {
  if (config.memory.privacy === 'off') return Promise.resolve({ embedded: 0, failed: 0 })
  running ??= sweep(input.gapMs ?? FACT_EMBED_GAP_MS, input.limit)
    .catch((error: unknown) => {
      logger.warn({ error }, 'Failed to list memory facts for embedding')
      return { embedded: 0, failed: 0 }
    })
    .finally(() => {
      running = null
    })
  return running
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sweep(gapMs: number, limit = Number.POSITIVE_INFINITY): Promise<{ embedded: number; failed: number }> {
  const pending = listActiveClaimsForEmbedding()
    .map((claim) => ({ claim, sentence: renderFactSentence(claim) }))
    .filter(({ claim, sentence }) => !claim.hasEmbedding || claim.embeddingText !== sentence)
    .slice(0, limit)
  let embedded = 0
  let failed = 0
  for (const [index, { claim, sentence }] of pending.entries()) {
    if (index > 0) await delay(gapMs)
    try {
      const embedding = await embedEpisodeText({ text: sentence, role: 'RETRIEVAL_DOCUMENT' })
      if (setClaimEmbedding({ id: claim.id, embeddingText: sentence, embedding })) embedded += 1
    } catch (error) {
      failed += 1
      logger.warn({ claimId: claim.id, error }, 'Failed to embed memory fact')
    }
  }
  return { embedded, failed }
}
