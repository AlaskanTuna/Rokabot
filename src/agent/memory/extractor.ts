import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import type { ExtractionEpisode, ExtractionQueueJob } from '../../storage/extractionQueue.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { getClaimSourceChannels } from '../../storage/memoryRecallStore.js'
import { logger } from '../../utils/logger.js'
import { judgeEpisodeOperations } from '../jev/judgments.js'
import { generateObject } from '../llm/generateObject.js'
import type { ProviderId } from '../llm/profiles.js'
import { promptTokenTotal } from '../llm/usage.js'
import { MAX_FACT_VALUE_LEN, isSafeFactScalar } from '../promptSafety.js'
import { admitEpisode } from './admission.js'
import { JevUnavailableError } from './extractionErrors.js'
import { type RunTrace, timeStage } from './extractionRun.js'
import {
  EXTRACTION_RESPONSE_SCHEMA,
  type ExtractionOutput as EpisodeExtractionOutput,
  ExtractionOutputSchema,
  ExtractionTransportSchema
} from './extractionSchema.js'
import { resolveGuildFactDate } from './guildFactDates.js'
import { reconcileHiddenRetractions } from './hiddenRetractions.js'
import { admitThreshold, verifyThreshold } from './judgeThresholds.js'
import type { EvidenceProvenance, MemoryClaim } from './memoryClaims.js'
import {
  getActiveClaimById,
  getActiveClaims,
  getActiveGuildClaimById,
  getActiveGuildClaims,
  retractClaim
} from './memoryClaims.js'
import { readItemFacts } from './memoryItems.js'
import {
  type EpisodeWriteOp,
  type OperationApplierContext,
  type OperationResult,
  type PlannedOperation,
  applyAddOperation,
  applyRemoveOperation,
  applyRetractOperation,
  applyUpdateOperation
} from './operationAppliers.js'
import { cardinalityOf } from './predicates.js'
import { type RecallScope, canRecall } from './privacy.js'
import { sensitiveFactReason } from './privacyGuard.js'
import { proposedPeriod, retractCandidates, sameAsCandidates } from './verificationCandidates.js'

function formatEpisodeLine(message: ExtractionEpisode['messages'][number]): string {
  const role = message.isBot ? ' (bot context only)' : ''
  return `[${message.userId}|${message.displayName}${role}]: ${message.content}`
}

function episodeObservedAt(episode: ExtractionEpisode): number {
  const latestTimestamp = episode.messages.reduce(
    (latest, message) => Math.max(latest, message.timestamp),
    Number.NEGATIVE_INFINITY
  )
  return Number.isFinite(latestTimestamp) ? latestTimestamp : Date.now()
}

/** Under `balanced` and `strict`, keeps only the items this channel may recall; `relaxed` and `off` skip the lookup. */
function recallableHere<T extends { id: number }>(items: T[], scope: RecallScope): T[] {
  const level = config.memory.privacy
  if (level !== 'balanced' && level !== 'strict') return items
  const sources = getClaimSourceChannels(items.map(({ id }) => id))
  return items.filter(({ id }) => canRecall(sources.get(id) ?? [null], scope, level))
}

function compareContentKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function episodePrompt(
  guildId: string,
  channelId: string,
  episode: ExtractionEpisode
): { prompt: string; claimIdByRef: Map<number, number> } {
  const scope = { guildId, channelId }
  const humanIds = [...new Set(episode.messages.filter((message) => !message.isBot).map((message) => message.userId))]
  const claimIdByRef = new Map<number, number>()
  let nextRef = 1
  const claims = humanIds.map((userId) => ({
    userId,
    claims: (config.memory.store === 'item'
      ? readItemFacts(scope, { subjectKind: 'user', subjectUserId: userId }).filter(
          (claim): claim is Extract<MemoryClaim, { subjectKind: 'user' }> => claim.subjectKind === 'user'
        )
      : recallableHere(
          getActiveClaims(guildId, userId).filter(({ needsReview }) => !needsReview),
          scope
        )
    )
      .map(({ id, predicate, value, period }) => ({ id, predicate, value, period }))
      .sort((left, right) => {
        const key = ({ predicate, value, period }: { predicate: string; value: string; period: string }) =>
          JSON.stringify(period === 'past' ? { predicate, value, period } : { predicate, value })
        return compareContentKey(key(left), key(right))
      })
      .map(({ id, predicate, value, period }) => {
        const ref = nextRef++
        claimIdByRef.set(ref, id)
        return period === 'past' ? { id: ref, predicate, value, period } : { id: ref, predicate, value }
      })
  }))
  const guildClaims = (
    config.memory.store === 'item'
      ? readItemFacts(scope, { subjectKind: 'guild' }).filter(
          (claim): claim is Extract<MemoryClaim, { subjectKind: 'guild' }> => claim.subjectKind === 'guild'
        )
      : recallableHere(getActiveGuildClaims(guildId), scope)
  )
    .map(({ id, predicate, value, expiresAt }) => ({ id, predicate, value, expiresAt }))
    .sort((left, right) => {
      const key = ({ predicate, value, expiresAt }: { predicate: string; value: string; expiresAt: number | null }) =>
        JSON.stringify({ predicate, value, expiresAt })
      return compareContentKey(key(left), key(right))
    })
    .map(({ id, predicate, value, expiresAt }) => {
      const ref = nextRef++
      claimIdByRef.set(ref, id)
      return { id: ref, predicate, value, expiresAt }
    })
  const prompt = [
    'You extract durable personal details about users and shared facts about this Discord server from an episode.',
    'Never extract sensitive personal information: real/legal names, age or birthday, address or specific residence, phone numbers, email addresses, social media handles, names of schools, employers, or workplaces, financial information, credentials, or medical/health details.',
    'A member\'s own job, trade or line of work is general_occupation and is never sensitive: record the role itself ("line cook", "freelance illustrator"), never the employer, workplace, or location.',
    'For user facts, use only the supplied user IDs and attribute facts only to the person who stated them, not someone quoted, addressed, or joked about. Use subject {"kind":"guild"} only for a fact established about this server or its members collectively. Context lines are background only and cannot supply a subject or fact.',
    'Use only these guild predicates: upcoming_event, plan, running_joke, place, rule, announcement. For upcoming_event and plan, date the fact from the messages: if they name a calendar day, give the month and day, plus the year only when the messages state it; if they name a month but no day, give just the month, and never invent a day; if they only say today, tomorrow, this week, next week, this month, or next month, give the relative form. Never guess a date the messages do not support, and never decide whether it is in the future.',
    'Every add and update gives sourceLine: the # of the delta message that states the fact. Context lines have no # and are never cited.',
    'Add a new claim only for a durable fact. Return noop only when no durable fact, change or retraction came up.',
    'Every user add and update has a tense: current if it is true of them now, past if it was true before but not now ("back when I was a nurse", "I used to play chess"), planned if they intend it.',
    'Use retract when a member says a fact about themselves no longer holds ("I quit chess", "I\'m not vegetarian anymore"), naming the predicate and the value that ended, even if it is not in the current active claims. A switch ("switched from chess to go") is a retract of the old value plus an add of the new one.',
    'When retracting a fact listed in the active claims, use its listed predicate.',
    'If a member restates a current durable fact, return add with the same subject, predicate and exact value as its existing claim. Never add a rewording. Use update with an existing claim ID only when the fact itself changed.',
    'Use remove with an existing claim ID only for a claim that was never true or was attributed to the wrong person; use retract for a fact that has ended.',
    'Never update or remove a claim whose "period" is "past"; to restate history, use add with tense past.',
    'Choose the most specific predicate; use misc only when no other predicate fits. "I draw on weekends" is hobby, not misc; "my cat Mochi" is pets, not misc; "I like spicy food" is likes, not misc. A game or sport they play is hobby, not favorite_game, unless they call it their favorite.',
    'Return a one-to-two sentence third-person summary saying who said or did what. Name people by display name and never write a user ID. Never mention whether a durable fact came up.',
    `Allowed human user IDs: ${humanIds.join(', ') || '(none)'}`,
    `Current active claims:\n${JSON.stringify(claims, null, 2)}`,
    `Current active guild facts:\n${JSON.stringify(guildClaims, null, 2)}`,
    `Context (background only, never a subject):\n${episode.context.map(formatEpisodeLine).join('\n') || '(none)'}`,
    `Delta messages:\n${episode.messages.map((message, index) => `#${index + 1} ${formatEpisodeLine(message)}`).join('\n')}`
  ].join('\n\n')
  return { prompt, claimIdByRef }
}

export type ExtractedEpisode = EpisodeExtractionOutput & {
  invalidOps: number
  promptTokens?: number
  extractionProvider: ProviderId
  extractionModel: string
  extractionFallback: boolean
}

function extractionAnsweredOnFallback(provider: ProviderId, model: string): boolean {
  const main = config.llm.main
  const mainModel = main.key === 'legacy-gemini' ? config.gemini.extractionModel : main.model
  return provider !== main.provider || model !== mainModel
}

export async function extractEpisode(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
}): Promise<ExtractedEpisode> {
  const prompt = episodePrompt(input.guildId, input.channelId, input.episode)
  const { value, provider, model, usage } = await generateObject({
    schema: ExtractionTransportSchema,
    requestSchema: ExtractionOutputSchema,
    prompt: prompt.prompt,
    workload: 'extraction',
    maxOutputTokens: 700,
    legacyResponseSchema: EXTRACTION_RESPONSE_SCHEMA
  })
  let invalidOps = value.invalidOps
  const ops: EpisodeExtractionOutput['ops'] = []
  for (const op of value.ops) {
    if (!('existingId' in op)) {
      ops.push(op)
      continue
    }
    const id = prompt.claimIdByRef.get(op.existingId)
    if (id === undefined) {
      invalidOps += 1
      continue
    }
    ops.push({ ...op, existingId: id })
  }
  return {
    ...value,
    ops,
    invalidOps,
    promptTokens: promptTokenTotal(usage),
    extractionProvider: provider,
    extractionModel: model,
    extractionFallback: extractionAnsweredOnFallback(provider, model)
  }
}

export type OperationApplicationReport = {
  appliedOps: number
  droppedOps: number
  duplicateOps: number
  stagedOps: number
  changedOps: number
  pastOps: number
  rewordOps: number
  retractedOps: number
  judgedOutOps: number
  uncited: number
  inputTokens: number
}

function planProvenance(op: EpisodeWriteOp, episode: ExtractionEpisode, jobId: number | undefined): EvidenceProvenance {
  if (op.op !== 'add' && op.op !== 'update') return { jobId }
  const line = 'sourceLine' in op && op.sourceLine !== undefined ? episode.messages[op.sourceLine - 1] : undefined
  // A bad citation only loses the message link: the op applies exactly as it would cited.
  if (!line || line.isBot || (op.subject.kind === 'user' && line.userId !== op.subject.userId)) return { jobId }
  return { jobId, sourceMessageId: line.messageId, speakerUserId: line.userId }
}

function planVerification(
  ops: readonly EpisodeWriteOp[],
  existing: MemoryClaim[],
  episode: ExtractionEpisode,
  jobId: number | undefined,
  now: number,
  timezone: string | undefined
): PlannedOperation[] {
  return ops.map((op, index) => {
    const sameAsClaims = op.op === 'add' ? sameAsCandidates(existing, op) : []
    const retractClaims = op.op === 'retract' ? retractCandidates(existing, op) : []
    const provenance = planProvenance(op, episode, jobId)
    const expires =
      op.subject.kind === 'guild' &&
      op.op !== 'remove' &&
      (op.predicate === 'upcoming_event' || op.predicate === 'plan')
        ? op.date
          ? resolveGuildFactDate(op.date, now, timezone)
          : null
        : null
    const requiresDate =
      op.subject.kind === 'guild' &&
      op.op !== 'remove' &&
      (op.predicate === 'upcoming_event' || op.predicate === 'plan')
    return {
      index,
      op,
      sameAsClaims,
      retractClaims,
      provenance,
      expiresAt: expires?.expiresAt ?? null,
      eventDate: expires?.eventDate ?? null,
      dateValid: !requiresDate || expires !== null,
      questionKeys: [
        `durable_${index}`,
        `${op.subject.kind === 'guild' ? 'guild_scoped' : 'attributed'}_${index}`,
        ...('tense' in op ? [`current_${index}`, `past_${index}`] : []),
        ...('tense' in op && op.op === 'update' ? [`changes_${index}`] : []),
        ...sameAsClaims.map((_, claimIndex) => `same_as_${index}_${claimIndex}`),
        ...retractClaims.map((_, claimIndex) => `retracts_${index}_${claimIndex}`)
      ]
    }
  })
}

function hasCompleteVerification(
  verification: Awaited<ReturnType<typeof judgeEpisodeOperations>>,
  planned: PlannedOperation[]
): verification is NonNullable<Awaited<ReturnType<typeof judgeEpisodeOperations>>> {
  return Boolean(
    verification &&
      planned.every((entry) =>
        entry.questionKeys.every((key) => {
          const score = verification.answers[key]?.noul
          return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1
        })
      )
  )
}

function operationAllowed(op: EpisodeWriteOp, subjectIds: Set<string>): boolean {
  if (op.subject.kind === 'guild') return true
  const objectUserId = 'objectUserId' in op ? op.objectUserId : undefined
  return subjectIds.has(op.subject.userId) && (!objectUserId || subjectIds.has(objectUserId))
}

function operationSafe(op: EpisodeWriteOp): boolean {
  return isSafeFactScalar(op.value, MAX_FACT_VALUE_LEN) && !sensitiveFactReason(op.predicate, op.value)
}

function keyApplied(
  key: string,
  result: { applied: boolean; duplicate: boolean },
  appliedKeys: ReadonlySet<string>
): boolean {
  if (key.startsWith('same_as_') || key.startsWith('retracts_')) return appliedKeys.has(key)
  if (key.startsWith('changes_')) return result.applied
  return result.applied || result.duplicate
}

export async function verifyAndApplyOperations(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  output: EpisodeExtractionOutput
  subjectIds: Set<string>
  jobId?: number
}): Promise<OperationApplicationReport> {
  const writeOps = input.output.ops.filter((op): op is EpisodeWriteOp => op.op !== 'noop')
  if (writeOps.length === 0) {
    return {
      appliedOps: 0,
      droppedOps: 0,
      duplicateOps: 0,
      stagedOps: 0,
      changedOps: 0,
      pastOps: 0,
      rewordOps: 0,
      retractedOps: 0,
      judgedOutOps: 0,
      uncited: 0,
      inputTokens: 0
    }
  }

  const observedAt = episodeObservedAt(input.episode)
  const humanIds = new Set(input.episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
  const subjectIds = new Set([...input.subjectIds].filter((userId) => humanIds.has(userId)))
  const scope = { guildId: input.guildId, channelId: input.channelId }
  const existing =
    config.memory.store === 'item'
      ? [
          ...[...subjectIds].flatMap((userId) => readItemFacts(scope, { subjectKind: 'user', subjectUserId: userId })),
          ...readItemFacts(scope, { subjectKind: 'guild' })
        ]
      : [
          ...[...subjectIds].flatMap((userId) =>
            getActiveClaims(input.guildId, userId).filter(({ needsReview }) => !needsReview)
          ),
          ...getActiveGuildClaims(input.guildId)
        ]
  const visibleClaims = config.memory.store === 'item' ? existing : recallableHere(existing, scope)
  const planned = planVerification(writeOps, visibleClaims, input.episode, input.jobId, observedAt, config.timezone)
  const lines = input.episode.messages.map(formatEpisodeLine)
  const verification = await judgeEpisodeOperations({ lines, ops: writeOps, existing: visibleClaims })
  const verified = hasCompleteVerification(verification, planned)
  const threshold = verifyThreshold()
  const holds = (key: string) => (verification?.answers[key]?.noul ?? 0) >= threshold
  const results: OperationResult[] = []
  const appliedKeys = new Set<string>()
  const verifiedRetracts: OperationApplierContext['verifiedRetracts'] = []

  // A multi-value retraction frees its cap slot before the adds, or the cap evicts an unrelated fact. A single-value
  // retraction goes last, so a switch sent as retract-then-add lets the add supersede the old value and inherit its pin.
  const retractsFirst = ({ op }: PlannedOperation) =>
    op.op === 'retract' && op.subject.kind === 'user' && cardinalityOf(op.predicate) === 'multi'
  const applyOrder = [
    ...planned.filter(retractsFirst),
    ...planned.filter(({ op }) => op.op !== 'retract'),
    ...planned.filter((entry) => entry.op.op === 'retract' && !retractsFirst(entry))
  ]
  const ctx: OperationApplierContext = {
    guildId: input.guildId,
    channelId: input.channelId,
    observedAt,
    verified,
    verification,
    threshold,
    holds,
    appliedKeys,
    verifiedRetracts
  }
  getDb().transaction(() => {
    for (const entry of applyOrder) {
      const { op, index } = entry
      if (!operationAllowed(op, subjectIds) || !operationSafe(op)) {
        results[index] = { applied: false, duplicate: false }
        continue
      }
      if (!entry.dateValid || ('tense' in op && op.tense === 'planned')) {
        results[index] = { applied: false, duplicate: false }
        continue
      }

      const target =
        op.op === 'add' || op.op === 'retract'
          ? undefined
          : op.subject.kind === 'guild'
            ? getActiveGuildClaimById(input.guildId, op.existingId)
            : getActiveClaimById(input.guildId, op.subject.userId, op.existingId)
      if (op.op !== 'add' && op.op !== 'retract' && (!target || target.predicate !== op.predicate)) {
        results[index] = { applied: false, duplicate: false }
        continue
      }

      if (verified) {
        const durable = verification.answers[`durable_${index}`].noul >= threshold
        const scopedKey = `${op.subject.kind === 'guild' ? 'guild_scoped' : 'attributed'}_${index}`
        const scoped = verification.answers[scopedKey].noul >= threshold
        if (!durable || !scoped) {
          results[index] = { applied: false, duplicate: false, judgedOut: true }
          continue
        }
      } else {
        if (op.op === 'remove' || op.op === 'retract') {
          results[index] = { applied: false, duplicate: false }
          continue
        }
        const current =
          op.subject.kind === 'guild'
            ? getActiveGuildClaims(input.guildId)
            : getActiveClaims(input.guildId, op.subject.userId)
        const proposed = proposedPeriod(op)
        const sameValue = current.find(
          (claim) => claim.predicate === op.predicate && claim.value === op.value && claim.period === proposed
        )
        if (sameValue || (op.op === 'update' && target?.value === op.value && target.period === proposed)) {
          results[index] = { applied: false, duplicate: false }
          continue
        }
      }

      if (op.op === 'retract') {
        results[index] = applyRetractOperation(op, entry, ctx)
      } else if (op.op === 'add') {
        results[index] = applyAddOperation(op, entry, ctx)
      } else if (op.op === 'update') {
        results[index] = applyUpdateOperation(op, entry, target, ctx)
      } else {
        results[index] = applyRemoveOperation(op, ctx)
      }
    }
  })()

  const stagedOps = results.filter(({ staged }) => staged).length
  if (stagedOps > 0) {
    logger.info(
      { guildId: input.guildId, channelId: input.channelId, stagedOps },
      'Staged unverified memory operations'
    )
  }

  const hiddenRetracted = await reconcileHiddenRetractions({
    guildId: input.guildId,
    channelId: input.channelId,
    lines,
    retracts: verifiedRetracts,
    visibleIds: new Set(visibleClaims.map(({ id }) => id))
  })

  if (verified && verification) {
    for (const entry of planned) {
      const result = results[entry.index]
      for (const key of entry.questionKeys) {
        const answer = verification.answers[key]
        recordJevEvent({
          kind: 'verification',
          guildId: input.guildId,
          channelId: input.channelId,
          question: key,
          answer: String(answer.noul),
          probability: answer.noul,
          confidence: answer.confidence,
          applied: keyApplied(key, result, appliedKeys),
          latencyMs: verification.latencyMs,
          inputTokens: verification.inputTokens,
          jobId: input.jobId,
          judge: verification.judge
        })
      }
    }
  }

  return {
    appliedOps: results.filter(({ applied }) => applied).length,
    droppedOps: results.filter(({ applied, duplicate }) => !applied && !duplicate).length,
    duplicateOps: results.filter(({ duplicate }) => duplicate).length,
    stagedOps,
    changedOps: results.filter(({ changed }) => changed).length,
    pastOps: results.filter(({ past }) => past).length,
    rewordOps: results.filter(({ reword }) => reword).length,
    retractedOps: results.reduce((total, { retracted }) => total + (retracted ?? 0), hiddenRetracted),
    judgedOutOps: results.filter(({ judgedOut }) => judgedOut).length,
    uncited: planned.filter(
      (entry) => (entry.op.op === 'add' || entry.op.op === 'update') && entry.provenance.sourceMessageId === undefined
    ).length,
    inputTokens: verification?.inputTokens ?? 0
  }
}

export type EpisodeRunResult = Readonly<{
  status: 'dropped' | 'completed'
  summary: string | null
  appliedOps: number
  duplicateOps: number
  opsRejected: boolean
}>

export async function runEpisodePipeline(job: ExtractionQueueJob, trace: RunTrace): Promise<EpisodeRunResult> {
  trace.stage = 'admission'
  const admission = await timeStage(trace, 'admission', () =>
    admitEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode, jobId: job.id })
  )
  trace.outcome = admission.reason
  trace.tokens += admission.inputTokens
  if (admission.probability !== null) {
    trace.admission = { probability: admission.probability, threshold: admitThreshold() }
  }
  if (!admission.admitted) {
    if (admission.reason === 'trivial' || admission.reason === 'sensitive') {
      trace.stage = 'precheck'
      trace.precheckPattern = admission.precheckPattern ?? null
    }
    if (admission.reason === 'jev_unavailable') throw new JevUnavailableError()
    return { status: 'dropped', summary: null, appliedOps: 0, duplicateOps: 0, opsRejected: false }
  }

  trace.stage = 'extraction'
  const output = await timeStage(trace, 'extraction', () =>
    extractEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode })
  )
  trace.models.extraction = output.extractionModel
  trace.extractionProvider = output.extractionProvider
  trace.extractionFallback = output.extractionFallback
  trace.ops.invalid = output.invalidOps
  trace.ops.proposed = output.ops.filter((op) => op.op !== 'noop').length
  trace.tokens += output.promptTokens ?? 0

  trace.stage = 'verification'
  const subjectIds = new Set(job.episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
  const report = await timeStage(trace, 'verification', () =>
    verifyAndApplyOperations({
      guildId: job.guildId,
      channelId: job.channelId,
      episode: job.episode,
      output,
      subjectIds,
      jobId: job.id
    })
  )
  trace.ops.applied = report.appliedOps
  trace.ops.duplicate = report.duplicateOps
  trace.ops.staged = report.stagedOps
  trace.ops.dropped = report.droppedOps
  trace.ops.changed = report.changedOps
  trace.ops.past = report.pastOps
  trace.ops.reword = report.rewordOps
  trace.ops.retracted = report.retractedOps
  trace.ops.uncited = report.uncited
  trace.tokens += report.inputTokens

  trace.stage = 'applied'
  trace.outcome = report.appliedOps + report.stagedOps + report.retractedOps > 0 ? 'written' : 'noop'
  return {
    status: 'completed',
    summary: output.summary,
    appliedOps: report.appliedOps,
    duplicateOps: report.duplicateOps,
    // Only Jev's own rejection counts. A rule, a missing target on a retry or a judge outage says nothing about the facts.
    opsRejected: trace.ops.proposed > 0 && report.judgedOutOps === trace.ops.proposed && report.retractedOps === 0
  }
}
