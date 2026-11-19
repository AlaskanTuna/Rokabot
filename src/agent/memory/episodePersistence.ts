import type { ExtractionEpisode } from '../../storage/extractionQueue.js'
import { saveMemoryEpisode } from '../../storage/memoryEpisodeStore.js'
import type { EmbeddingVector } from '../../storage/memoryEpisodeStore.js'
import { logger } from '../../utils/logger.js'
import { embedEpisodeText } from './episodeEmbeddings.js'
import type { EpisodeRunResult } from './extractor.js'
import { type SummaryVerdict, validateEpisodeSummary } from './summaryValidation.js'

export async function persistEpisodeResult(input: {
  job: { id: number; guildId: string; channelId: string; episode: ExtractionEpisode }
  result: EpisodeRunResult
}): Promise<SummaryVerdict> {
  const { job, result } = input
  if (result.status !== 'completed' || result.summary === null) {
    return { kept: false, dropReason: null, judged: false, inputTokens: 0 }
  }

  const verdict = await validateEpisodeSummary({
    summary: result.summary,
    opsRejected: result.opsRejected,
    guildId: job.guildId,
    channelId: job.channelId,
    jobId: job.id
  })
  if (!verdict.kept) return verdict

  let embedding: EmbeddingVector | null = null
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
  return verdict
}
