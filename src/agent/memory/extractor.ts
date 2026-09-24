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
import {
  type MemoryClaim,
  appendEvidence,
  assertClaim,
  getActiveClaimById,
  getActiveClaims,
  rejectActiveClaimById,
  replaceActiveClaim,
  retractClaim
} from './memoryClaims.js'
import { PREDICATES, cardinalityOf, normalizePredicate } from './predicates.js'
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
  return [
    'You extract durable personal details about users from a Discord episode. Never create facts about the bot or group.',
    'Never extract sensitive personal information: real/legal names, age or birthday, address or specific residence, phone numbers, email addresses, social media handles, school or workplace names, financial information, credentials, or medical/health details.',
    'Use only the supplied user IDs. Attribute facts only to the person who stated them, not someone quoted, addressed, or joked about. Context lines are background only and cannot supply a subject or fact.',
    'Add a new claim only for a durable fact. Use update or remove with an existing claim ID instead of adding a rewording. Return noop when nothing changed.',
    'Return a one-to-two sentence third-person summary.',
    `Allowed human user IDs: ${humanIds.join(', ') || '(none)'}`,
    `Current active claims:\n${JSON.stringify(claims, null, 2)}`,
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
type PlannedOperation = {
  index: number
  op: EpisodeWriteOp
  sameAsClaims: MemoryClaim[]
  questionKeys: string[]
}

function planVerification(ops: readonly EpisodeWriteOp[], existing: MemoryClaim[]): PlannedOperation[] {
  return ops.map((op, index) => {
    const sameAsClaims =
      op.op === 'add'
        ? existing.filter((claim) => claim.subjectUserId === op.subject.userId && claim.predicate === op.predicate)
        : []
    return {
      index,
      op,
      sameAsClaims,
      questionKeys: [
        `durable_${index}`,
        `attributed_${index}`,
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
  const existing = [...subjectIds].flatMap((userId) => getActiveClaims(input.guildId, userId))
  const planned = planVerification(writeOps, existing)
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

      const target = op.op === 'add' ? undefined : getActiveClaimById(input.guildId, op.subject.userId, op.existingId)
      if (op.op !== 'add' && (!target || target.predicate !== op.predicate)) {
        results.push({ applied: false, duplicate: false })
        continue
      }

      if (verified) {
        const durable = verification.answers[`durable_${index}`].noul >= config.memory.verifyThreshold
        const attributed = verification.answers[`attributed_${index}`].noul >= config.memory.verifyThreshold
        if (!durable || !attributed) {
          results.push({ applied: false, duplicate: false })
          continue
        }
      } else {
        if (op.op === 'remove') {
          results.push({ applied: false, duplicate: false })
          continue
        }
        const current = getActiveClaims(input.guildId, op.subject.userId)
        const sameValue = current.find((claim) => claim.predicate === op.predicate && claim.value === op.value)
        if (sameValue || (op.op === 'update' && target?.value === op.value)) {
          results.push({ applied: false, duplicate: false })
          continue
        }
      }

      if (op.op === 'add') {
        if (verified) {
          const sameAs = sameAsClaims.find((claim, claimIndex) => {
            const answer = verification.answers[`same_as_${index}_${claimIndex}`]
            return answer.noul >= config.memory.verifyThreshold
          })
          if (sameAs) {
            const active = getActiveClaimById(input.guildId, op.subject.userId, sameAs.id)
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
        const replacement = replaceActiveClaim(
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

      const applied = rejectActiveClaimById(
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
