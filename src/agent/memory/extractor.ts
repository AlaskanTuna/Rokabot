import { GoogleGenAI } from '@google/genai'
import { config } from '../../config.js'
import { getDb } from '../../storage/database.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import { getSharedRateLimiter } from '../../utils/rateLimiter.js'
import { classifyGeminiFailure, computeBackoff } from '../geminiReliability.js'
import { isShuttingDown } from '../shutdownSignal.js'
import { shouldExtract } from './candidateGate.js'
import { assertClaim, getActiveClaims, retractClaim } from './memoryClaims.js'
import { PREDICATES, cardinalityOf, normalizePredicate } from './predicates.js'

export type ExtractionMessage = Readonly<{
  userId: string
  displayName: string
  content: string
}>

export type ExtractionJob = Readonly<{
  guildId: string
  channelId: string
  messages: readonly ExtractionMessage[]
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
    job.messages.flatMap((message) => getActiveClaims(job.guildId, message.userId).map((claim) => claim.predicate))
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
    job.messages.map((message) => ({ ...message, username: '', timestamp: 0 })),
    knownClaimKeys(job)
  )
  if (!gate.extract) {
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
    const changes = applyOps(job, parseOps(text), new Set(job.messages.map((message) => message.userId)))
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
