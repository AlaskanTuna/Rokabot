import { listActiveClaimsForEmbedding, setClaimEmbedding } from '../../storage/memoryRecallStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import { renderFactSentence } from './factSentences.js'

let running: Promise<{ embedded: number; failed: number }> | null = null

/** Embeds active facts that have no embedding or whose sentence changed. One sweep at a time. */
export function embedPendingFacts(input: { limit?: number } = {}): Promise<{ embedded: number; failed: number }> {
  running ??= sweep(input.limit).finally(() => {
    running = null
  })
  return running
}

async function sweep(limit = Number.POSITIVE_INFINITY): Promise<{ embedded: number; failed: number }> {
  const pending = listActiveClaimsForEmbedding()
    .map((claim) => ({ claim, sentence: renderFactSentence(claim) }))
    .filter(({ claim, sentence }) => !claim.hasEmbedding || claim.embeddingText !== sentence)
    .slice(0, limit)
  let embedded = 0
  let failed = 0
  for (const { claim, sentence } of pending) {
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
