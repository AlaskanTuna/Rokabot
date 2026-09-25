import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import type { ExtractionEpisode, ExtractionQueueJob } from '../../storage/extractionQueue.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { judgeEpisodeOperations } from '../jev/judgments.js'
import { SAFETY_SETTINGS } from '../safetySettings.js'
import { admitEpisode } from './admission.js'
import {
  EXTRACTION_RESPONSE_SCHEMA,
  type ExtractionOutput as EpisodeExtractionOutput,
  type ExtractionOp as EpisodeOperation,
  parseExtractionOutput
} from './extractionSchema.js'
import { resolveGuildFactDate } from './guildFactDates.js'
import {
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
  retractClaim
} from './memoryClaims.js'
import { sensitiveFactReason } from './privacyGuard.js'

let genaiClient: GoogleGenAI | undefined

function getClient(): GoogleGenAI {
  genaiClient ??= new GoogleGenAI({ apiKey: config.gemini.apiKey })
  return genaiClient
}

function formatEpisodeLine(message: ExtractionEpisode['messages'][number]): string {
  const role = message.isBot ? ' (bot context only)' : ''
  return `[${message.userId}|${message.displayName}${role}]: ${message.content}`
}

function episodePrompt(guildId: string, episode: ExtractionEpisode): string {
  const humanIds = [...new Set(episode.messages.filter((message) => !message.isBot).map((message) => message.userId))]
  const claims = humanIds.map((userId) => ({
    userId,
    claims: getActiveClaims(guildId, userId).map(({ id, predicate, value }) => ({ id, predicate, value }))
  }))
  const guildClaims = getActiveGuildClaims(guildId).map(({ id, predicate, value, expiresAt }) => ({
    id,
    predicate,
    value,
    expiresAt
  }))
  return [
    'You extract durable personal details about users and shared facts about this Discord server from an episode.',
    'Never extract sensitive personal information: real/legal names, age or birthday, address or specific residence, phone numbers, email addresses, social media handles, school or workplace names, financial information, credentials, or medical/health details.',
    'For user facts, use only the supplied user IDs and attribute facts only to the person who stated them, not someone quoted, addressed, or joked about. Use subject {"kind":"guild"} only for a fact established about this server or its members collectively. Context lines are background only and cannot supply a subject or fact.',
    'Use only these guild predicates: upcoming_event, plan, running_joke, place, rule, announcement. For upcoming_event and plan, include calendar date components supported by the messages; do not guess dates or decide whether they are in the future.',
    'Add a new claim only for a durable fact. If a member restates a current durable fact, return add with the same subject, predicate, and exact value as its existing claim. Never add a rewording. Use update or remove with an existing claim ID for an actual change. Return noop only when no durable fact came up.',
    'Return a one-to-two sentence third-person summary.',
    `Allowed human user IDs: ${humanIds.join(', ') || '(none)'}`,
    `Current active claims:\n${JSON.stringify(claims, null, 2)}`,
    `Current active guild facts:\n${JSON.stringify(guildClaims, null, 2)}`,
    `Context (background only, never a subject):\n${episode.context.map(formatEpisodeLine).join('\n') || '(none)'}`,
    `Delta messages:\n${episode.messages.map(formatEpisodeLine).join('\n')}`
  ].join('\n\n')
}

export async function extractEpisode(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
}): Promise<EpisodeExtractionOutput> {
  const response = await getClient().models.generateContent({
    model: config.gemini.extractionModel,
    contents: episodePrompt(input.guildId, input.episode),
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
  return parseExtractionOutput(response.text)
}

export type OperationApplicationReport = {
  appliedOps: number
  droppedOps: number
  duplicateOps: number
}

type EpisodeWriteOp = Exclude<EpisodeOperation, { op: 'noop' }>
type GuildWriteOperation = Extract<EpisodeWriteOp, { subject: { kind: 'guild' } }>
type PlannedOperation = {
  index: number
  op: EpisodeWriteOp
  sameAsClaims: MemoryClaim[]
  questionKeys: string[]
  expiresAt: number | null
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
    const sameAsClaims =
      op.op === 'add'
        ? existing.filter((claim) => {
            if (claim.subjectKind !== op.subject.kind || claim.predicate !== op.predicate) return false
            return op.subject.kind === 'guild' || claim.subjectUserId === op.subject.userId
          })
        : []
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
      expiresAt: expires?.expiresAt ?? null,
      dateValid: !requiresDate || expires !== null,
      questionKeys: [
        `durable_${index}`,
        `${op.subject.kind === 'guild' ? 'guild_scoped' : 'attributed'}_${index}`,
        ...sameAsClaims.map((_, claimIndex) => `same_as_${index}_${claimIndex}`)
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

export async function verifyAndApplyOperations(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  output: EpisodeExtractionOutput
  subjectIds: Set<string>
}): Promise<OperationApplicationReport> {
  const writeOps = input.output.ops.filter((op): op is EpisodeWriteOp => op.op !== 'noop')
  if (writeOps.length === 0) return { appliedOps: 0, droppedOps: 0, duplicateOps: 0 }

  const humanIds = new Set(input.episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
  const subjectIds = new Set([...input.subjectIds].filter((userId) => humanIds.has(userId)))
  const existing = [
    ...[...subjectIds].flatMap((userId) => getActiveClaims(input.guildId, userId)),
    ...getActiveGuildClaims(input.guildId)
  ]
  const planned = planVerification(writeOps, existing, Date.now(), config.timezone)
  const verification = await judgeEpisodeOperations({
    lines: input.episode.messages.map(formatEpisodeLine),
    ops: writeOps,
    existing
  })
  const verified = hasCompleteVerification(verification, planned)
  const results: Array<{ applied: boolean; duplicate: boolean }> = []
  const appliedEvidence = new Set<string>()

  getDb().transaction(() => {
    for (const entry of planned) {
      const { op, index, sameAsClaims } = entry
      if (!operationAllowed(op, subjectIds) || !operationSafe(op)) {
        results.push({ applied: false, duplicate: false })
        continue
      }
      if (!entry.dateValid) {
        results.push({ applied: false, duplicate: false })
        continue
      }

      const target =
        op.op === 'add'
          ? undefined
          : op.subject.kind === 'guild'
            ? getActiveGuildClaimById(input.guildId, op.existingId)
            : getActiveClaimById(input.guildId, op.subject.userId, op.existingId)
      if (op.op !== 'add' && (!target || target.predicate !== op.predicate)) {
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
        if (op.op === 'remove') {
          results.push({ applied: false, duplicate: false })
          continue
        }
        const current =
          op.subject.kind === 'guild'
            ? getActiveGuildClaims(input.guildId)
            : getActiveClaims(input.guildId, op.subject.userId)
        const sameValue = current.find((claim) => claim.predicate === op.predicate && claim.value === op.value)
        if (sameValue || (op.op === 'update' && target?.value === op.value)) {
          results.push({ applied: false, duplicate: false })
          continue
        }
      }

      if (op.op === 'add') {
        if (verified) {
          const exactSameAs = sameAsClaims.find((claim) => claim.value === op.value)
          if (exactSameAs) {
            const active =
              op.subject.kind === 'guild'
                ? getActiveGuildClaimById(input.guildId, exactSameAs.id)
                : getActiveClaimById(input.guildId, op.subject.userId, exactSameAs.id)
            if (active) {
              appendEvidence(active.id, { channelId: input.channelId, sourceKind: 'passive' }, { transaction: true })
              appliedEvidence.add(`same_as_${index}_${sameAsClaims.indexOf(exactSameAs)}`)
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
              appendEvidence(active.id, { channelId: input.channelId, sourceKind: 'passive' }, { transaction: true })
              appliedEvidence.add(`same_as_${index}_${sameAsClaims.indexOf(sameAs)}`)
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

        if (isGuildWriteOperation(op)) {
          const claim = assertGuildClaim(
            {
              guildId: input.guildId,
              predicate: op.predicate,
              value: op.value,
              expiresAt: entry.expiresAt,
              sourceKind: 'passive',
              channelId: input.channelId,
              needsReview: !verified
            },
            { transaction: true }
          )
          results.push({ applied: claim.status === 'active', duplicate: false })
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
            needsReview: !verified
          },
          { transaction: true }
        )
        results.push({ applied: claim.status === 'active', duplicate: false })
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
                channelId: input.channelId,
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
                needsReview: !verified
              },
              { transaction: true }
            )
        const duplicate = replacement?.id === op.existingId
        results.push({ applied: Boolean(replacement) && !duplicate, duplicate })
        continue
      }

      const applied = isGuildWriteOperation(op)
        ? rejectActiveGuildClaimById({ guildId: input.guildId, existingId: op.existingId }, { transaction: true })
        : rejectActiveClaimById(
            { guildId: input.guildId, subjectUserId: op.subject.userId, existingId: op.existingId },
            { transaction: true }
          )
      results.push({ applied, duplicate: false })
    }
  })()

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
          applied: key.startsWith('same_as_') ? appliedEvidence.has(key) : result.applied || result.duplicate,
          latencyMs: verification.latencyMs,
          inputTokens: verification.inputTokens
        })
      }
    }
  }

  return {
    appliedOps: results.filter(({ applied }) => applied).length,
    droppedOps: results.filter(({ applied, duplicate }) => !applied && !duplicate).length,
    duplicateOps: results.filter(({ duplicate }) => duplicate).length
  }
}

export type EpisodeRunResult = Readonly<{
  status: 'dropped' | 'completed'
  summary: string | null
  appliedOps: number
  duplicateOps: number
}>

export async function runEpisodePipeline(job: ExtractionQueueJob): Promise<EpisodeRunResult> {
  const admission = await admitEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode })
  if (!admission.admitted) return { status: 'dropped', summary: null, appliedOps: 0, duplicateOps: 0 }

  const output = await extractEpisode({ guildId: job.guildId, channelId: job.channelId, episode: job.episode })
  const subjectIds = new Set(job.episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
  const report = await verifyAndApplyOperations({
    guildId: job.guildId,
    channelId: job.channelId,
    episode: job.episode,
    output,
    subjectIds
  })
  return {
    status: 'completed',
    summary: output.summary,
    appliedOps: report.appliedOps,
    duplicateOps: report.duplicateOps
  }
}
