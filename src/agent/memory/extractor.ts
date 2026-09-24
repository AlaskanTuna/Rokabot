import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import type { ExtractionEpisode, ExtractionQueueJob } from '../../storage/extractionQueue.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { getSharedRateLimiter } from '../../utils/rateLimiter.js'
import { classifyGeminiFailure, computeBackoff } from '../geminiReliability.js'
import { judgeEpisodeOperations } from '../jev/judgments.js'
import { SAFETY_SETTINGS } from '../safetySettings.js'
import { isShuttingDown } from '../shutdownSignal.js'
import { admitEpisode } from './admission.js'
import { shouldExtract } from './candidateGate.js'
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

export type ExtractionMessage = Readonly<{
  userId: string
  displayName: string
  content: string
}>

export type ExtractionJob = Readonly<{
  guildId: string
  channelId: string
  messages: readonly ExtractionMessage[]
  botUserId?: string
  admittedBy?: 'jev'
}>

type ExtractionOp = Readonly<{
  op: 'assert' | 'retract'
  userId: string
  predicate: string
  value: string
  objectUserId?: string
}>

type AppliedChange = Readonly<{
  op: 'assert' | 'retract' | 'supersede'
  subjectUserId: string
}>

let genaiClient: GoogleGenAI | undefined

const EXTRACTION_PROMPT = `You are a fact extractor. Given a conversation, extract durable personal details and behavioral signals about USERS only.

Never extract sensitive personal information: real/legal names, age or birthday, address or specific residence, phone numbers, email addresses, social media handles, school or workplace names, financial information, credentials, or medical/health details.

Extract durable identity, lifestyle, interests, social, personality, and opinion facts. Skip temporary states, current moods, single-use reactions, ephemeral technical issues, and facts about the bot. Infer only general, lasting details when the context supports them.

Return ONLY a JSON array of operations with this shape:
[{"op":"assert"|"retract","userId":"supplied Discord user id","predicate":"controlled predicate","value":"fact value","objectUserId":"supplied Discord user id, optional"}]

The only permitted predicates are: ${Object.keys(PREDICATES).join(', ')}
Every userId and objectUserId must be one of the supplied Discord user IDs. Never use a display name as an ID. Return [] when there are no durable facts.

Conversation:
`

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

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function parseOps(text: string): ExtractionOp[] {
  try {
    const cleaned = text
      .replace(/^```json?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (value: unknown): value is ExtractionOp =>
        typeof value === 'object' &&
        value !== null &&
        ((value as ExtractionOp).op === 'assert' || (value as ExtractionOp).op === 'retract') &&
        typeof (value as ExtractionOp).userId === 'string' &&
        typeof (value as ExtractionOp).predicate === 'string' &&
        typeof (value as ExtractionOp).value === 'string' &&
        ((value as ExtractionOp).objectUserId === undefined || typeof (value as ExtractionOp).objectUserId === 'string')
    )
  } catch {
    return []
  }
}

async function generateExtraction(prompt: string): Promise<string | undefined> {
  const limiter = getSharedRateLimiter(config.rateLimit)

  for (let attempt = 0; attempt <= config.gemini.extractionMaxRetries; attempt++) {
    if (isShuttingDown() || !limiter.tryConsumeAboveFloor(config.gemini.extractionRpmFloor)) return undefined

    try {
      const response = await getClient().models.generateContent({
        model: config.gemini.extractionModel,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 400,
          safetySettings: SAFETY_SETTINGS,
          httpOptions: { timeout: 15_000 }
        }
      })
      return response.text?.trim() || undefined
    } catch (error) {
      const failure = classifyGeminiFailure(error)
      if (!failure.retryable || attempt >= config.gemini.extractionMaxRetries) return undefined
      await waitForRetry(
        computeBackoff(attempt, config.gemini.retryBackoffBaseMs, { maxMs: config.gemini.retryBackoffCapMs })
      )
    }
  }

  return undefined
}

function isUnsafeClaimError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Claim value is unsafe'
}

function applyOps(job: ExtractionJob, ops: ExtractionOp[], suppliedUserIds: Set<string>): AppliedChange[] {
  const changes: AppliedChange[] = []

  getDbTransaction(() => {
    for (const op of ops) {
      if (!suppliedUserIds.has(op.userId)) continue
      if (op.objectUserId !== undefined && !suppliedUserIds.has(op.objectUserId)) continue

      const predicate = normalizePredicate(op.predicate)
      try {
        if (op.op === 'retract') {
          if (
            retractClaim(
              { guildId: job.guildId, subjectUserId: op.userId, predicate, value: op.value },
              { transaction: true }
            )
          ) {
            changes.push({ op: 'retract', subjectUserId: op.userId })
          }
          continue
        }

        const superseded =
          cardinalityOf(predicate) === 'single'
            ? getActiveClaims(job.guildId, op.userId).filter(
                (claim) => claim.predicate === predicate && claim.value !== op.value
              )
            : []
        assertClaim(
          {
            guildId: job.guildId,
            subjectUserId: op.userId,
            predicate,
            value: op.value,
            objectUserId: op.objectUserId,
            sourceKind: 'passive',
            channelId: job.channelId
          },
          { transaction: true }
        )
        changes.push({ op: 'assert', subjectUserId: op.userId })
        changes.push(...superseded.map(() => ({ op: 'supersede' as const, subjectUserId: op.userId })))
      } catch (error) {
        if (isUnsafeClaimError(error)) continue
        throw error
      }
    }
  })

  return changes
}

function getDbTransaction(fn: () => void): void {
  getDb().transaction(fn)()
}

function knownClaimKeys(job: ExtractionJob): Set<string> {
  return new Set(
    job.messages
      .filter((message) => message.userId !== job.botUserId)
      .flatMap((message) => getActiveClaims(job.guildId, message.userId).map((claim) => claim.predicate))
  )
}

function recordExtraction(job: ExtractionJob, startedAt: number, nCandidates: number, nChanged: number): void {
  recordMemoryEvent({
    kind: 'extraction',
    guildId: job.guildId,
    channelId: job.channelId,
    durationMs: performance.now() - startedAt,
    nCandidates,
    nChanged,
    op: nChanged === 0 ? 'none' : undefined
  })
}

/** Extracts structured claim operations for a scheduler-provided message batch without throwing. */
export async function runExtraction(job: ExtractionJob): Promise<void> {
  const startedAt = performance.now()
  const gate = shouldExtract(
    job.messages.map((message, index) => ({
      ...message,
      messageId: `legacy-${job.channelId}-${index}`,
      username: '',
      timestamp: 0,
      isBot: false
    })),
    knownClaimKeys(job)
  )
  const jevAdmissionCanOverride =
    job.admittedBy === 'jev' && (gate.reason === 'known claim keywords only' || gate.reason === 'no personal signal')
  if (!gate.extract && !jevAdmissionCanOverride) {
    recordExtraction(job, startedAt, 0, 0)
    return
  }

  if (isShuttingDown()) return

  const prompt = `${EXTRACTION_PROMPT}${job.messages
    .map((message) => `[${message.userId}|${message.displayName}]: ${message.content}`)
    .join('\n')}`
  const text = await generateExtraction(prompt)
  if (!text) {
    recordExtraction(job, startedAt, job.messages.length, 0)
    return
  }

  try {
    const suppliedUserIds = new Set(
      job.messages.map((message) => message.userId).filter((userId) => userId !== job.botUserId)
    )
    const changes = applyOps(job, parseOps(text), suppliedUserIds)
    for (const change of changes) {
      recordMemoryEvent({
        kind: 'claim_change',
        guildId: job.guildId,
        channelId: job.channelId,
        subjectUserId: change.subjectUserId,
        op: change.op
      })
    }
    recordExtraction(job, startedAt, job.messages.length, changes.filter((change) => change.op !== 'supersede').length)
  } catch {
    recordExtraction(job, startedAt, job.messages.length, 0)
  }
}

export { parseOps as _parseOps }
