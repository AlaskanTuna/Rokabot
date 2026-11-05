import { recordJevEvent } from '../../storage/jevEventStore.js'
import { judgeEpisodeSummary } from '../jev/judgments.js'
import { BOILERPLATE } from './extractionRun.js'
import { summaryThreshold } from './judgeThresholds.js'

export type SummaryDropReason = 'ops_rejected' | 'numeric_id' | 'boilerplate' | 'incomplete'

export type SummaryVerdict = Readonly<{
  kept: boolean
  dropReason: SummaryDropReason | null
  judged: boolean
  inputTokens: number
}>

// A snowflake ID is a Discord user ID, never something a reader with no context could use.
const NUMERIC_ID = /\b\d{15,}\b/

export async function validateEpisodeSummary(input: {
  summary: string
  opsRejected: boolean
  guildId: string
  channelId: string
  jobId: number
}): Promise<SummaryVerdict> {
  if (input.opsRejected) {
    return { kept: false, dropReason: 'ops_rejected', judged: false, inputTokens: 0 }
  }
  if (NUMERIC_ID.test(input.summary)) {
    return { kept: false, dropReason: 'numeric_id', judged: false, inputTokens: 0 }
  }
  if (BOILERPLATE.test(input.summary)) {
    return { kept: false, dropReason: 'boilerplate', judged: false, inputTokens: 0 }
  }

  const judgment = await judgeEpisodeSummary({ summary: input.summary })
  if (!judgment) return { kept: true, dropReason: null, judged: false, inputTokens: 0 }

  const kept = judgment.noul >= summaryThreshold()
  recordJevEvent({
    kind: 'verification',
    guildId: input.guildId,
    channelId: input.channelId,
    question: 'summary_complete',
    answer: String(judgment.noul),
    probability: judgment.noul,
    confidence: null,
    applied: kept,
    latencyMs: judgment.latencyMs,
    inputTokens: judgment.inputTokens,
    jobId: input.jobId,
    judge: judgment.judge
  })
  return {
    kept,
    dropReason: kept ? null : 'incomplete',
    judged: true,
    inputTokens: judgment.inputTokens
  }
}
