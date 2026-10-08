import { config } from '../../config.js'
import { getClaimEmbeddings } from '../../storage/memoryRecallStore.js'
import { logger } from '../../utils/logger.js'
import { judgeHiddenRetractions } from '../jev/judgments.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import { cosineSimilarity } from './episodeRetriever.js'
import { renderFactSentence } from './factSentences.js'
import { getActiveClaims, retireClaim } from './memoryClaims.js'
import { PREDICATES, type PredicateId } from './predicates.js'

const MAX_HIDDEN_CANDIDATES = 3

type HiddenRetract = Readonly<{ subjectUserId: string; predicate: PredicateId; value: string }>

function userFactSentence(predicate: PredicateId, value: string): string {
  return renderFactSentence({ subjectKind: 'user', predicate, value, eventDate: null })
}

async function reconcileOne(input: {
  guildId: string
  channelId: string
  lines: string[]
  retract: HiddenRetract
  visibleIds: ReadonlySet<number>
}): Promise<number[]> {
  const { retract } = input
  const category = PREDICATES[retract.predicate].category
  const hidden = getActiveClaims(input.guildId, retract.subjectUserId).filter(
    (claim) =>
      claim.period === 'current' &&
      !claim.needsReview &&
      !input.visibleIds.has(claim.id) &&
      PREDICATES[claim.predicate].category === category
  )
  if (hidden.length === 0) return []

  const embeddings = getClaimEmbeddings(hidden.map(({ id }) => id))
  const statement = userFactSentence(retract.predicate, retract.value)
  const queryEmbedding = await embedEpisodeText({ text: statement, role: 'RETRIEVAL_QUERY' })
  const candidates = hidden
    .flatMap((claim) => {
      const embedding = embeddings.get(claim.id)
      const similarity = embedding ? cosineSimilarity(queryEmbedding, embedding) : null
      return similarity === null ? [] : [{ claim, similarity }]
    })
    .sort((left, right) => right.similarity - left.similarity || left.claim.id - right.claim.id)
    .slice(0, MAX_HIDDEN_CANDIDATES)
  if (candidates.length === 0) return []

  const probabilities = await judgeHiddenRetractions({
    lines: input.lines,
    statement,
    candidates: candidates.map(({ claim }) => ({
      id: claim.id,
      sentence: renderFactSentence(claim)
    }))
  })
  if (!probabilities) return []

  const retired: number[] = []
  for (const { claim } of candidates) {
    if (
      (probabilities[claim.id] ?? 0) >= config.memory.verifyThreshold &&
      retireClaim(input.guildId, claim.id, 'retracted')
    ) {
      retired.push(claim.id)
    }
  }
  return retired
}

/**
 * Retires facts the extractor could not see (learned in a channel this one may not recall) that a verified
 * retraction ends. Never throws; only claim IDs, predicates and counts are logged.
 */
export async function reconcileHiddenRetractions(input: {
  guildId: string
  channelId: string
  lines: string[]
  retracts: readonly HiddenRetract[]
  visibleIds: ReadonlySet<number>
}): Promise<number> {
  if (input.retracts.length === 0) return 0
  if (config.memory.privacy !== 'balanced' && config.memory.privacy !== 'strict') return 0

  let retired = 0
  for (const retract of input.retracts) {
    try {
      const claimIds = await reconcileOne({ ...input, retract })
      retired += claimIds.length
      if (claimIds.length > 0) {
        logger.info(
          {
            guildId: input.guildId,
            channelId: input.channelId,
            predicate: retract.predicate,
            claimIds,
            retracted: claimIds.length
          },
          'Retired hidden facts a member retracted'
        )
      }
    } catch (error) {
      logger.warn(
        {
          guildId: input.guildId,
          channelId: input.channelId,
          predicate: retract.predicate,
          errorName: error instanceof Error ? error.name : 'Error'
        },
        'Failed to reconcile hidden retractions'
      )
    }
  }
  return retired
}
