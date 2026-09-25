import type { ExtractionEpisode } from '../../storage/extractionQueue.js'
import { saveMemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import type { EpisodeEmbedding } from '../../storage/memoryEpisodeStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import type { EpisodeRunResult } from './extractor.js'

export async function persistEpisodeResult(input: {
  job: { id: number; guildId: string; channelId: string; episode: ExtractionEpisode }
  result: EpisodeRunResult
}): Promise<void> {
  const { job, result } = input
  if (result.status !== 'completed' || result.summary === null) return

  let embedding: EpisodeEmbedding | null = null
  try {
    embedding = await embedEpisodeText({ text: result.summary, role: 'RETRIEVAL_DOCUMENT' })
  } catch (error) {
    logger.warn(
      { guildId: job.guildId, channelId: job.channelId, jobId: job.id, error },
      'Failed to embed memory episode'
    )
  }

  saveMemoryEpisode({
    id: job.id,
    guildId: job.guildId,
    channelId: job.channelId,
    startedAt: job.episode.startedAt,
    endedAt: job.episode.endedAt,
    summary: result.summary,
    embedding
  })
}
