import { config } from '../../config.js'
import {
  listMediaDigestsForGuild,
  listMediaGuildIds,
  pruneExpiredMediaDigests,
  setMediaDigestEmbedding
} from '../../storage/mediaDigestStore.js'
import {
  listEpisodeGuildIds,
  listEpisodesForGuild,
  pruneExpiredEpisodes,
  setEpisodeEmbedding
} from '../../storage/memoryEpisodeStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import { embedPendingFacts } from './factEmbeddings.js'

export type EpisodeMaintenanceReport = Readonly<{
  deleted: number
  reembedded: number
  failed: number
  mediaDeleted: number
  mediaReembedded: number
  mediaFailed: number
  factsEmbedded: number
  factsFailed: number
}>

export async function pruneEpisodesAndReembed(nowMs = Date.now()): Promise<EpisodeMaintenanceReport> {
  const cutoff = nowMs - config.memory.episodeRetentionDays * 24 * 60 * 60 * 1000
  const deleted = pruneExpiredEpisodes(cutoff)
  let reembedded = 0
  let failed = 0

  for (const guildId of listEpisodeGuildIds()) {
    for (const episode of listEpisodesForGuild(guildId)) {
      if (episode.embedding) continue
      try {
        const embedding = await embedEpisodeText({ text: episode.summary, role: 'RETRIEVAL_DOCUMENT' })
        if (setEpisodeEmbedding({ guildId, id: episode.id, embedding })) reembedded += 1
      } catch (error) {
        failed += 1
        logger.warn({ guildId, episodeId: episode.id, error }, 'Failed to re-embed memory episode')
      }
    }
  }

  const mediaCutoff = nowMs - config.memory.mediaRetentionDays * 24 * 60 * 60 * 1000
  const mediaDeleted = pruneExpiredMediaDigests(mediaCutoff)
  let mediaReembedded = 0
  let mediaFailed = 0

  for (const guildId of listMediaGuildIds()) {
    for (const digest of listMediaDigestsForGuild(guildId)) {
      if (digest.embedding) continue
      try {
        const embedding = await embedEpisodeText({ text: digest.summary, role: 'RETRIEVAL_DOCUMENT' })
        if (setMediaDigestEmbedding({ guildId, id: digest.id, summary: digest.summary, embedding }))
          mediaReembedded += 1
      } catch (error) {
        mediaFailed += 1
        logger.warn({ guildId, mediaDigestId: digest.id, error }, 'Failed to re-embed media digest')
      }
    }
  }

  const facts = await embedPendingFacts()

  return {
    deleted,
    reembedded,
    failed,
    mediaDeleted,
    mediaReembedded,
    mediaFailed,
    factsEmbedded: facts.embedded,
    factsFailed: facts.failed
  }
}
