import { config } from '../../config.js'
import type { ExtractionEpisode } from '../../storage/extractionQueue.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { judgeEpisodeAdmission } from '../jev/judgments.js'
import { precheckEpisode } from './episodePrecheck.js'

export type AdmissionResult = {
  admitted: boolean
  reason: 'sensitive' | 'trivial' | 'jev_unavailable' | 'below_threshold' | 'admitted'
}

export async function admitEpisode(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
}): Promise<AdmissionResult> {
  const precheck = precheckEpisode(input.episode)
  if (precheck) return { admitted: false, reason: precheck }

  const lines = input.episode.messages.map(
    ({ userId, displayName, content }) => `[${userId}|${displayName}]: ${content}`
  )
  const judgment = await judgeEpisodeAdmission({ lines })
  if (!judgment) return { admitted: false, reason: 'jev_unavailable' }

  const admitted = judgment.noul >= config.memory.admitThreshold
  recordJevEvent({
    kind: 'admission',
    guildId: input.guildId,
    channelId: input.channelId,
    question: 'lasting_fact',
    answer: String(judgment.noul),
    probability: judgment.noul,
    confidence: judgment.confidence,
    applied: admitted,
    latencyMs: judgment.latencyMs,
    inputTokens: judgment.inputTokens
  })
  return { admitted, reason: admitted ? 'admitted' : 'below_threshold' }
}
