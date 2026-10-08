import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import type { ExtractionEpisode, ExtractionQueueJob } from '../../storage/extractionQueue.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { getClaimSourceChannels } from '../../storage/memoryRecallStore.js'
import { logger } from '../../utils/logger.js'
import { judgeEpisodeOperations } from '../jev/judgments.js'
import { SAFETY_SETTINGS } from '../safetySettings.js'
import { admitEpisode } from './admission.js'
import { JevUnavailableError } from './extractionErrors.js'
import { type RunTrace, timeStage } from './extractionRun.js'
import {
  EXTRACTION_RESPONSE_SCHEMA,
  type ExtractionOutput as EpisodeExtractionOutput,
  type ExtractionOp as EpisodeOperation,
  parseExtractionOutput
} from './extractionSchema.js'
import { resolveGuildFactDate } from './guildFactDates.js'
import { reconcileHiddenRetractions } from './hiddenRetractions.js'
import {
  type ClaimPeriod,
  type ClaimStatus,
  type MemoryClaim,
  appendEvidence,
  assertClaim,
  assertGuildClaim,
  getActiveClaimById,
  getActiveClaims,
  getActiveGuildClaimById,
  getActiveGuildClaims,
  rejectActiveClaimById,
  rejectActiveGuildClaimById,
  replaceActiveClaim,
  replaceActiveGuildClaim,
  retireClaim,
  retractClaim
} from './memoryClaims.js'
import { type PredicateId, normalizePredicate } from './predicates.js'
import { type RecallScope, canRecall } from './privacy.js'
import { sensitiveFactReason } from './privacyGuard.js'
import { proposedPeriod, retractCandidates, sameAsCandidates } from './verificationCandidates.js'

let genaiClient: GoogleGenAI | undefined

function getClient(): GoogleGenAI {
  genaiClient ??= new GoogleGenAI({ apiKey: config.gemini.apiKey })
  return genaiClient
}

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

function episodePrompt(guildId: string, channelId: string, episode: ExtractionEpisode): string {
  const scope = { guildId, channelId }
  const humanIds = [...new Set(episode.messages.filter((message) => !message.isBot).map((message) => message.userId))]
  const claims = humanIds.map((userId) => ({
    userId,
    claims: recallableHere(
      getActiveClaims(guildId, userId).filter(({ needsReview }) => !needsReview),
      scope
    ).map(({ id, predicate, value, period }) =>
      period === 'past' ? { id, predicate, value, period } : { id, predicate, value }
    )
  }))
  const guildClaims = recallableHere(getActiveGuildClaims(guildId), scope).map(
    ({ id, predicate, value, expiresAt }) => ({
      id,
      predicate,
      value,
      expiresAt
    })
  )
  return [
    'You extract durable personal details about users and shared facts about this Discord server from an episode.',
    'Never extract sensitive personal information: real/legal names, age or birthday, address or specific residence, phone numbers, email addresses, social media handles, names of schools, employers, or workplaces, financial information, credentials, or medical/health details.',
    'A member\'s own job, trade or line of work is general_occupation and is never sensitive: record the role itself ("line cook", "freelance illustrator"), never the employer, workplace, or location.',
    'For user facts, use only the supplied user IDs and attribute facts only to the person who stated them, not someone quoted, addressed, or joked about. Use subject {"kind":"guild"} only for a fact established about this server or its members collectively. Context lines are background only and cannot supply a subject or fact.',
    'Use only these guild predicates: upcoming_event, plan, running_joke, place, rule, announcement. For upcoming_event and plan, date the fact from the messages: if they name a calendar day, give the month and day, plus the year only when the messages state it; if they name a month but no day, give just the month, and never invent a day; if they only say today, tomorrow, this week, next week, this month, or next month, give the relative form. Never guess a date the messages do not support, and never decide whether it is in the future.',
    'Add a new claim only for a durable fact. Return noop only when no durable fact, change or retraction came up.',
    'Every user add and update has a tense: current if it is true of them now, past if it was true before but not now ("back when I was a nurse", "I used to play chess"), planned if they intend it.',
    'Use retract when a member says a fact about themselves no longer holds ("I quit chess", "I\'m not vegetarian anymore"), naming the predicate and the value that ended, even if it is not in the current active claims. A switch ("switched from chess to go") is a retract of the old value plus an add of the new one.',
    'If a member restates a current durable fact, return add with the same subject, predicate and exact value as its existing claim. Never add a rewording. Use update with an existing claim ID only when the fact itself changed.',
    'Use remove with an existing claim ID only for a claim that was never true or was attributed to the wrong person; use retract for a fact that has ended.',
    'Never update or remove a claim whose "period" is "past"; to restate history, use add with tense past.',
    'Choose the most specific predicate; use misc only when no other predicate fits. "I draw on weekends" is hobby, not misc; "my cat Mochi" is pets, not misc; "I like spicy food" is likes, not misc.',
    'Return a one-to-two sentence third-person summary.',
    `Allowed human user IDs: ${humanIds.join(', ') || '(none)'}`,
    `Current active claims:\n${JSON.stringify(claims, null, 2)}`,
    `Current active guild facts:\n${JSON.stringify(guildClaims, null, 2)}`,
    `Context (background only, never a subject):\n${episode.context.map(formatEpisodeLine).join('\n') || '(none)'}`,
    `Delta messages:\n${episode.messages.map(formatEpisodeLine).join('\n')}`
  ].join('\n\n')
}

export type ExtractedEpisode = EpisodeExtractionOutput & { promptTokens?: number }

export async function extractEpisode(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
}): Promise<ExtractedEpisode> {
  const response = await getClient().models.generateContent({
    model: config.gemini.extractionModel,
    contents: episodePrompt(input.guildId, input.channelId, input.episode),
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: 700,
      safetySettings: SAFETY_SETTINGS,
      httpOptions: { timeout: config.gemini.timeout }
    }
  })
  if (!response.text) throw new Error('Memory extraction returned no JSON')
  const promptTokens = response.usageMetadata?.promptTokenCount
  return { ...parseExtractionOutput(response.text), ...(promptTokens === undefined ? {} : { promptTokens }) }
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
  inputTokens: number
}

type EpisodeWriteOp = Exclude<EpisodeOperation, { op: 'noop' }>
type GuildWriteOperation = Extract<EpisodeWriteOp, { subject: { kind: 'guild' } }>
type PlannedOperation = {
  index: number
  op: EpisodeWriteOp
  sameAsClaims: MemoryClaim[]
  retractClaims: MemoryClaim[]
  questionKeys: string[]
  expiresAt: number | null
  eventDate: string | null
  dateValid: boolean
}

function isGuildWriteOperation(op: EpisodeWriteOp): op is GuildWriteOperation {
  return op.subject.kind === 'guild'
}

function planVerification(
  ops: readonly EpisodeWriteOp[],
  existing: MemoryClaim[],
  now: number,
  timezone: string | undefined
): PlannedOperation[] {
  return ops.map((op, index) => {
    const sameAsClaims = op.op === 'add' ? sameAsCandidates(existing, op) : []
    const retractClaims = op.op === 'retract' ? retractCandidates(existing, op) : []
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
  return !sensitiveFactReason(op.predicate, op.value)
}

function priorClaimStatus(guildId: string, op: EpisodeWriteOp, period: ClaimPeriod): ClaimStatus | undefined {
  const [subjectUserId, predicate] =
    op.subject.kind === 'guild' ? [null, op.predicate] : [op.subject.userId, normalizePredicate(op.predicate)]
  const row = getDb()
    .prepare(
      'SELECT status FROM memory_claim WHERE guild_id = ? AND subject_kind = ? AND subject_user_id IS ? AND predicate = ? AND value = ? AND period = ?'
    )
    .get(guildId, op.subject.kind, subjectUserId, predicate, op.value, period) as { status: ClaimStatus } | undefined
  return row?.status
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
      inputTokens: 0
    }
  }

  const observedAt = episodeObservedAt(input.episode)
  const humanIds = new Set(input.episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
  const subjectIds = new Set([...input.subjectIds].filter((userId) => humanIds.has(userId)))
  const existing = [
    ...[...subjectIds].flatMap((userId) =>
      getActiveClaims(input.guildId, userId).filter(({ needsReview }) => !needsReview)
    ),
    ...getActiveGuildClaims(input.guildId)
  ]
  const visibleClaims = recallableHere(existing, { guildId: input.guildId, channelId: input.channelId })
  const planned = planVerification(writeOps, visibleClaims, observedAt, config.timezone)
  const lines = input.episode.messages.map(formatEpisodeLine)
  const verification = await judgeEpisodeOperations({ lines, ops: writeOps, existing: visibleClaims })
  const verified = hasCompleteVerification(verification, planned)
  const holds = (key: string) => (verification?.answers[key]?.noul ?? 0) >= config.memory.verifyThreshold
  const results: Array<{
    applied: boolean
    duplicate: boolean
    staged?: boolean
    changed?: boolean
    past?: boolean
    reword?: boolean
    retracted?: number
  }> = []
  const appliedKeys = new Set<string>()
  const verifiedRetracts: Array<{ subjectUserId: string; predicate: PredicateId; value: string }> = []

  getDb().transaction(() => {
    for (const entry of planned) {
      const { op, index, sameAsClaims, retractClaims } = entry
      if (!operationAllowed(op, subjectIds) || !operationSafe(op)) {
        results.push({ applied: false, duplicate: false })
        continue
      }
      if (!entry.dateValid || ('tense' in op && op.tense === 'planned')) {
        results.push({ applied: false, duplicate: false })
        continue
      }

      const target =
        op.op === 'add' || op.op === 'retract'
          ? undefined
          : op.subject.kind === 'guild'
            ? getActiveGuildClaimById(input.guildId, op.existingId)
            : getActiveClaimById(input.guildId, op.subject.userId, op.existingId)
      if (op.op !== 'add' && op.op !== 'retract' && (!target || target.predicate !== op.predicate)) {
        results.push({ applied: false, duplicate: false })
        continue
      }

      if (verified) {
        const durable = verification.answers[`durable_${index}`].noul >= config.memory.verifyThreshold
        const scopedKey = `${op.subject.kind === 'guild' ? 'guild_scoped' : 'attributed'}_${index}`
        const scoped = verification.answers[scopedKey].noul >= config.memory.verifyThreshold
        if (!durable || !scoped) {
          results.push({ applied: false, duplicate: false })
          continue
        }
      } else {
        if (op.op === 'remove' || op.op === 'retract') {
          results.push({ applied: false, duplicate: false })
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
          results.push({ applied: false, duplicate: false })
          continue
        }
      }

      if (op.op === 'retract') {
        verifiedRetracts.push({ subjectUserId: op.subject.userId, predicate: op.predicate, value: op.value })
        let retired = 0
        for (const [claimIndex, claim] of retractClaims.entries()) {
          const key = `retracts_${index}_${claimIndex}`
          if (holds(key) && retireClaim(input.guildId, claim.id, 'retracted', undefined, { transaction: true })) {
            appliedKeys.add(key)
            retired += 1
          }
        }
        results.push({ applied: retired > 0, duplicate: false, changed: retired > 0, retracted: retired })
        continue
      }

      let period = proposedPeriod(op)
      if (verified && 'tense' in op) {
        const stillHolds = holds(`current_${index}`)
        if (op.tense === 'past' && stillHolds) {
          // The speaker still holds it, so there is no history to record: it can only refresh the matching current fact.
          const match = getActiveClaims(input.guildId, op.subject.userId).find(
            (claim) => claim.period === 'current' && claim.predicate === op.predicate && claim.value === op.value
          )
          if (match) {
            appendEvidence(
              match.id,
              { channelId: input.channelId, sourceKind: 'passive', observedAt },
              { transaction: true }
            )
          }
          results.push({ applied: false, duplicate: Boolean(match) })
          continue
        }
        const resolved = op.tense === 'current' && stillHolds ? 'current' : holds(`past_${index}`) ? 'past' : null
        if (resolved === null) {
          results.push({ applied: false, duplicate: false })
          continue
        }
        period = resolved
        if (op.op === 'update' && period === 'current' && target?.period === 'current' && !holds(`changes_${index}`)) {
          appendEvidence(
            target.id,
            { channelId: input.channelId, sourceKind: 'passive', observedAt },
            { transaction: true }
          )
          results.push({ applied: false, duplicate: true, reword: true })
          continue
        }
      }

      // A past mention is written as its own row: it never replaces the claim an update targeted.
      if (op.op === 'add' || (op.op === 'update' && period === 'past')) {
        // Same-as candidates were chosen for the proposed period, so they only apply while Jev kept it.
        if (verified && period === proposedPeriod(op)) {
          const exactSameAs = sameAsClaims.find((claim) => claim.value === op.value)
          if (exactSameAs) {
            const active =
              op.subject.kind === 'guild'
                ? getActiveGuildClaimById(input.guildId, exactSameAs.id)
                : getActiveClaimById(input.guildId, op.subject.userId, exactSameAs.id)
            if (active) {
              appendEvidence(
                active.id,
                { channelId: input.channelId, sourceKind: 'passive', observedAt },
                { transaction: true }
              )
              appliedKeys.add(`same_as_${index}_${sameAsClaims.indexOf(exactSameAs)}`)
              results.push({ applied: false, duplicate: true })
            } else {
              results.push({ applied: false, duplicate: false })
            }
            continue
          }
          const sameAs = sameAsClaims.find((claim, claimIndex) => {
            const answer = verification.answers[`same_as_${index}_${claimIndex}`]
            return answer.noul >= config.memory.verifyThreshold
          })
          if (sameAs) {
            const active =
              op.subject.kind === 'guild'
                ? getActiveGuildClaimById(input.guildId, sameAs.id)
                : getActiveClaimById(input.guildId, op.subject.userId, sameAs.id)
            if (active) {
              appendEvidence(
                active.id,
                { channelId: input.channelId, sourceKind: 'passive', observedAt },
                { transaction: true }
              )
              appliedKeys.add(`same_as_${index}_${sameAsClaims.indexOf(sameAs)}`)
              results.push({ applied: false, duplicate: true })
            } else {
              results.push({ applied: false, duplicate: false })
            }
            continue
          }
          if (sameAsClaims.some((claim) => claim.value === op.value)) {
            results.push({ applied: false, duplicate: false })
            continue
          }
        }

        const priorStatus = priorClaimStatus(input.guildId, op, period)
        if (isGuildWriteOperation(op)) {
          const claim = assertGuildClaim(
            {
              guildId: input.guildId,
              predicate: op.predicate,
              value: op.value,
              expiresAt: entry.expiresAt,
              eventDate: entry.eventDate,
              sourceKind: 'passive',
              channelId: input.channelId,
              observedAt,
              needsReview: !verified,
              status: verified ? 'active' : 'candidate'
            },
            { transaction: true }
          )
          const applied = claim.status === 'active' || claim.status === 'candidate'
          results.push({
            applied,
            duplicate: false,
            staged: !verified && claim.status === 'candidate',
            changed: applied && claim.status !== priorStatus
          })
          continue
        }

        const claim = assertClaim(
          {
            guildId: input.guildId,
            subjectUserId: op.subject.userId,
            predicate: op.predicate,
            value: op.value,
            objectUserId: op.objectUserId,
            sourceKind: 'passive',
            channelId: input.channelId,
            observedAt,
            needsReview: !verified,
            status: verified ? 'active' : 'candidate',
            period
          },
          { transaction: true }
        )
        const applied = claim.status === 'active' || claim.status === 'candidate'
        results.push({
          applied,
          duplicate: false,
          staged: !verified && claim.status === 'candidate',
          changed: applied && claim.status !== priorStatus,
          past: applied && verified && period === 'past'
        })
        continue
      }

      if (op.op === 'update') {
        const replacement = isGuildWriteOperation(op)
          ? replaceActiveGuildClaim(
              {
                guildId: input.guildId,
                existingId: op.existingId,
                predicate: op.predicate,
                value: op.value,
                expiresAt: entry.expiresAt,
                eventDate: entry.eventDate,
                channelId: input.channelId,
                observedAt,
                needsReview: !verified
              },
              { transaction: true }
            )
          : replaceActiveClaim(
              {
                guildId: input.guildId,
                subjectUserId: op.subject.userId,
                existingId: op.existingId,
                predicate: op.predicate,
                value: op.value,
                objectUserId: op.objectUserId,
                channelId: input.channelId,
                observedAt,
                needsReview: !verified
              },
              { transaction: true }
            )
        const duplicate = replacement?.id === op.existingId
        const applied = Boolean(replacement) && !duplicate
        results.push({ applied, duplicate, staged: !verified && Boolean(replacement), changed: applied })
        continue
      }

      const applied = isGuildWriteOperation(op)
        ? rejectActiveGuildClaimById({ guildId: input.guildId, existingId: op.existingId }, { transaction: true })
        : rejectActiveClaimById(
            { guildId: input.guildId, subjectUserId: op.subject.userId, existingId: op.existingId },
            { transaction: true }
          )
      results.push({ applied, duplicate: false, changed: applied })
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
          jobId: input.jobId
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
    inputTokens: verification?.inputTokens ?? 0
  }
}

export type EpisodeRunResult = Readonly<{
  status: 'dropped' | 'completed'
  summary: string | null
  appliedOps: number
  duplicateOps: number
}>

export async function runEpisodePipeline(job: ExtractionQueueJob, trace: RunTrace): Promise<EpisodeRunResult> {
  trace.stage = 'admission'
  const admission = await timeStage(trace, 'admission', () =>
    admitEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode, jobId: job.id })
  )
  trace.outcome = admission.reason
  trace.tokens += admission.inputTokens
  if (admission.probability !== null) {
    trace.admission = { probability: admission.probability, threshold: config.memory.admitThreshold }
  }
  if (!admission.admitted) {
    if (admission.reason === 'trivial' || admission.reason === 'sensitive') trace.stage = 'precheck'
    if (admission.reason === 'jev_unavailable') throw new JevUnavailableError()
    return { status: 'dropped', summary: null, appliedOps: 0, duplicateOps: 0 }
  }

  trace.stage = 'extraction'
  const output = await timeStage(trace, 'extraction', () =>
    extractEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode })
  )
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
  trace.tokens += report.inputTokens

  trace.stage = 'applied'
  trace.outcome = report.appliedOps + report.stagedOps + report.retractedOps > 0 ? 'written' : 'noop'
  return {
    status: 'completed',
    summary: output.summary,
    appliedOps: report.appliedOps,
    duplicateOps: report.duplicateOps
  }
}
