import { config } from '../../config.js'
import type { ExtractionQueueJob } from '../../storage/extractionQueue.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { logger } from '../../utils/logger.js'
import type { ExtractionErrorClassification } from './extractionErrors.js'

export type RunStage = 'precheck' | 'admission' | 'extraction' | 'verification' | 'applied'
export type RunOutcome =
  | 'admitted'
  | 'trivial'
  | 'sensitive'
  | 'below_threshold'
  | 'jev_unavailable'
  | 'noop'
  | 'written'
  | 'error'
export type RunTrace = {
  jobId: number
  attempt: number
  guildId: string
  channelId: string
  startedAt: number
  firstMessageId: string | null
  lastMessageId: string | null
  messageCount: number
  humanCount: number
  stage: RunStage
  outcome: RunOutcome
  errorClass?: ExtractionErrorClassification
  errorStatus?: number
  admission?: { probability: number; threshold: number }
  ops: { proposed: number; applied: number; duplicate: number; staged: number; dropped: number; changed: number }
  summary: { kept: boolean; chars: number; boilerplate: boolean }
  stageMs: Partial<Record<'admission' | 'extraction' | 'verification' | 'persistence', number>>
  tokens: number
  models: { extraction: string; jev: string; embedding: string }
}

const BOILERPLATE = /\bno (?:new )?(?:durable|lasting|personal)\b/i

export function startRunTrace(job: ExtractionQueueJob, attempt: number): RunTrace {
  const messages = job.episode.messages
  return {
    jobId: job.id,
    attempt,
    guildId: job.guildId,
    channelId: job.channelId,
    startedAt: Date.now(),
    firstMessageId: messages[0]?.messageId ?? null,
    lastMessageId: messages.at(-1)?.messageId ?? null,
    messageCount: messages.length,
    humanCount: messages.filter((message) => !message.isBot).length,
    stage: 'precheck',
    outcome: 'admitted',
    ops: { proposed: 0, applied: 0, duplicate: 0, staged: 0, dropped: 0, changed: 0 },
    summary: { kept: false, chars: 0, boilerplate: false },
    stageMs: {},
    tokens: 0,
    models: {
      extraction: config.gemini.extractionModel,
      jev: config.jev.model,
      embedding: config.memory.embeddingModel
    }
  }
}

export async function timeStage<T>(
  trace: RunTrace,
  stage: keyof RunTrace['stageMs'],
  work: () => Promise<T>
): Promise<T> {
  const started = Date.now()
  try {
    return await work()
  } finally {
    trace.stageMs[stage] = Date.now() - started
  }
}

export function noteSummary(trace: RunTrace, summary: string | null, kept: boolean): void {
  trace.summary = { kept, chars: summary?.length ?? 0, boilerplate: summary ? BOILERPLATE.test(summary) : false }
}

export function noteError(trace: RunTrace, errorClass: ExtractionErrorClassification, error: unknown): void {
  if (errorClass !== 'unjudged') trace.outcome = 'error'
  trace.errorClass = errorClass
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === 'number') trace.errorStatus = status
}

export function finishRunTrace(trace: RunTrace): void {
  try {
    const { guildId, channelId, startedAt, tokens, ops, ...detail } = trace
    recordMemoryEvent({
      kind: 'extraction_run',
      guildId,
      channelId,
      durationMs: Date.now() - startedAt,
      nCandidates: ops.proposed,
      nSelected: ops.applied,
      nChanged: ops.changed,
      tokensEst: tokens,
      detail: JSON.stringify({ ...detail, ops })
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record extraction run')
  }
}
