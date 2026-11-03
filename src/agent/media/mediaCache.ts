import { config } from '../../config.js'
import {
  findMediaDigest,
  recordMediaOccurrence,
  saveMediaDigest,
  setMediaDigestEmbedding
} from '../../storage/mediaDigestStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from '../memory/episodeEmbeddings.js'
import type { MediaAttachment } from './attachments.js'
import { renderCompactDigest, renderDigestBlock } from './digest.js'
import { HALVES_MAX_DURATION_SEC, HALVES_MIN_DURATION_SEC, planHalves } from './plan.js'
import type { MediaDigest } from './types.js'

// countTokens on a YouTube URI is a measured estimate, not the bill, so a duration derived from it is planned
// against a smaller budget rather than stretched: the timeline bins stay on the real video.
export const ESTIMATED_DURATION_HEADROOM = 1.15

/** A server turn whose watched media is remembered. Absent for DMs, group DMs and `/ask`. */
export interface MediaMemoryScope {
  guildId: string
  channelId: string
  messageId: string
  userId: string
}

// Judged at the smaller estimated-duration budget, so a skim is only redone when any later share could do better.
function halvesCouldCover(durationSec: number): boolean {
  return (
    durationSec > HALVES_MIN_DURATION_SEC &&
    durationSec <= HALVES_MAX_DURATION_SEC &&
    config.gemini.maxLlmCalls - 2 >= 2 &&
    planHalves({ durationSec, budgetTokens: config.gemini.maxAttachmentTokens / ESTIMATED_DURATION_HEADROOM }) !== null
  )
}

export function remembered(scope: MediaMemoryScope, contentKey: string): { id: number; digest: MediaDigest } | null {
  try {
    const stored = findMediaDigest(scope.guildId, contentKey)
    if (!stored) return null
    const digest = JSON.parse(stored.digestJson) as MediaDigest
    // A partial watch is worth redoing; a later share may get the whole thing.
    if (digest.mode === 'opening' || digest.incomplete) return null
    // A skim of a video that two halves could cover whole is worth redoing when a share can afford the halves.
    if (digest.mode === 'skim' && halvesCouldCover(digest.durationSec)) return null
    // Throws on a row that has drifted from the digest shape, which then counts as a miss.
    renderDigestBlock(digest)
    renderCompactDigest(digest)
    return { id: stored.id, digest }
  } catch (error) {
    logger.warn({ error, contentKey }, 'Could not read remembered media')
    return null
  }
}

export function recordShare(scope: MediaMemoryScope, attachment: MediaAttachment, digestId: number): void {
  try {
    recordMediaOccurrence({
      digestId,
      guildId: scope.guildId,
      channelId: scope.channelId,
      messageId: attachment.sourceMessageId ?? scope.messageId,
      sharedByUserId: scope.userId,
      sourceAuthorId: attachment.sourceAuthorId ?? null,
      origin: attachment.origin ?? 'upload'
    })
  } catch (error) {
    logger.warn({ error, digestId }, 'Could not record shared media')
  }
}

export function remember(
  scope: MediaMemoryScope,
  attachment: MediaAttachment,
  contentKey: string,
  digest: MediaDigest
) {
  try {
    const saved = saveMediaDigest({
      guildId: scope.guildId,
      contentKey,
      kind: digest.kind,
      label: digest.label,
      summary: digest.observations.summary,
      digestJson: JSON.stringify(digest)
    })
    if (!saved) return
    recordShare(scope, attachment, saved.id)
    // Off the reply path; a failed embedding stays NULL until maintenance repairs it.
    void embedEpisodeText({ text: saved.summary, role: 'RETRIEVAL_DOCUMENT' })
      .then((embedding) =>
        setMediaDigestEmbedding({ guildId: scope.guildId, id: saved.id, summary: saved.summary, embedding })
      )
      .catch((error) => logger.warn({ error, digestId: saved.id }, 'Could not embed remembered media'))
  } catch (error) {
    logger.warn({ error, contentKey }, 'Could not remember watched media')
  }
}
