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
import { isShuttingDown } from '../shutdownSignal.js'
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

const MAX_CONSECUTIVE_FAILURES = 5

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// One document per backfillGapMs keeps the sidecar's single inference thread free for turn queries. Five failures in
// a row mean the provider is down, so the rest waits for the next pass instead of failing one by one.
class BackfillPace {
  private left = config.embeddings.backfillBatchSize
  private failures = 0
  private started = false

  get remaining(): number {
    return this.failures < MAX_CONSECUTIVE_FAILURES && !isShuttingDown() ? this.left : 0
  }

  async next(): Promise<boolean> {
    if (this.remaining === 0) return false
    if (this.started) await delay(config.embeddings.backfillGapMs)
    this.started = true
    this.left -= 1
    return true
  }

  settle(succeeded: boolean): void {
    this.failures = succeeded ? 0 : this.failures + 1
  }
}

let running: Promise<EpisodeMaintenanceReport> | null = null

/**
 * Prunes expired rows, then embeds every retained document with no vector readable in the configured embedding
 * space. One pass runs at a time; the next pass resumes from the provenance each row records.
 */
export function pruneEpisodesAndReembed(nowMs = Date.now()): Promise<EpisodeMaintenanceReport> {
  running ??= runPass(nowMs).finally(() => {
    running = null
  })
  return running
}

async function runPass(nowMs: number): Promise<EpisodeMaintenanceReport> {
  const embedOn = config.memory.privacy !== 'off'
  const pace = new BackfillPace()
  const cutoff = nowMs - config.memory.episodeRetentionDays * 24 * 60 * 60 * 1000
  const deleted = pruneExpiredEpisodes(cutoff)
  let reembedded = 0
  let failed = 0

  for (const guildId of embedOn ? listEpisodeGuildIds() : []) {
    for (const episode of listEpisodesForGuild(guildId)) {
      if (episode.embedding) continue
      if (!(await pace.next())) break
      try {
        const embedding = await embedEpisodeText({ text: episode.summary, role: 'RETRIEVAL_DOCUMENT' })
        if (setEpisodeEmbedding({ guildId, id: episode.id, summary: episode.summary, embedding })) reembedded += 1
        pace.settle(true)
      } catch (error) {
        failed += 1
        pace.settle(false)
        logger.warn({ guildId, episodeId: episode.id, error }, 'Failed to re-embed memory episode')
      }
    }
  }

  const mediaCutoff = nowMs - config.memory.mediaRetentionDays * 24 * 60 * 60 * 1000
  const mediaDeleted = pruneExpiredMediaDigests(mediaCutoff)
  let mediaReembedded = 0
  let mediaFailed = 0

  for (const guildId of embedOn ? listMediaGuildIds() : []) {
    for (const digest of listMediaDigestsForGuild(guildId)) {
      if (digest.embedding) continue
      if (!(await pace.next())) break
      try {
        const embedding = await embedEpisodeText({ text: digest.summary, role: 'RETRIEVAL_DOCUMENT' })
        if (setMediaDigestEmbedding({ guildId, id: digest.id, summary: digest.summary, embedding }))
          mediaReembedded += 1
        pace.settle(true)
      } catch (error) {
        mediaFailed += 1
        pace.settle(false)
        logger.warn({ guildId, mediaDigestId: digest.id, error }, 'Failed to re-embed media digest')
      }
    }
  }

  const facts =
    embedOn && pace.remaining > 0
      ? await embedPendingFacts({ limit: pace.remaining, gapMs: config.embeddings.backfillGapMs })
      : { embedded: 0, failed: 0 }

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
