import type { Event, Session } from '@google/adk'
import type { Part } from '@google/genai'
import { character } from '../character/index.js'
import { config } from '../config.js'
import { recordJevEvent } from '../storage/jevEventStore.js'
import type { EpisodeEmbedding } from '../storage/memoryEpisodeStore.js'
import { recordMemoryEvent } from '../storage/metricsStore.js'
import type { WindowMessage } from '../storage/sessionStore.js'
import { getChannelUsers, loadHistory } from '../storage/sessionStore.js'
import { getAllUserNames, getUserName } from '../storage/userNames.js'
import { logger } from '../utils/logger.js'
import { getLocalDate, getLocalHour } from '../utils/timezone.js'
import { estimateTokens } from '../utils/tokens.js'
import { judgeTurn } from './jev/judgments.js'
import type { TurnJudgment, TurnJudgmentInput } from './jev/judgments.js'
import { embedEpisodeText } from './memory/episodeEmbeddings.js'
import { buildEpisodeRecallBlock } from './memory/episodeRetriever.js'
import { resolveReferences } from './memory/identityResolver.js'
import { buildMediaRecallBlock } from './memory/mediaRecall.js'
import { touchRecalled } from './memory/memoryClaims.js'
import type { MemoryScope } from './memory/memoryScope.js'
import { getMessages as getBufferMessages } from './memory/passiveBuffer.js'
import type { RecallScope } from './memory/privacy.js'
import { type RecallInput, type RecallResult, recallForTurn } from './memory/recall.js'
import { type GateRun, runRecallGate } from './memory/recallGateRun.js'
import { formatGuildFactDate, retrieveForTurn, retrieveGuildFacts } from './memory/retriever.js'
import { assembleSystemPrompt } from './promptAssembler.js'
import { buildFactsEnvelope, buildOverheardBlock } from './promptSafety.js'
import type { ToneKey } from './prompts/tones.js'
import { buildReplyShapePrompt } from './replyShape.js'
import { recordSearchCitations } from './searchCitations.js'
import { buildLookedUpBlock, decidePrefetch, runPrefetchForJudgment, settlePrefetch } from './searchPrefetch.js'
import type { PrefetchResult } from './searchPrefetch.js'
import { ensureSession, resetIdleTimer } from './session.js'
import { detectTone } from './toneDetector.js'

const SAFETY_STEER_ADDENDUM = character.prompts.safetySteer

export interface TurnContextOptions {
  channelId: string
  guildId: string
  userMessage: string
  displayName: string
  username: string
  userId: string
  mentionedUserIds?: string[]
  /** `/ask` passes `none`: no retrieval, no facts, no memory tools, no `context_build` telemetry (#207). */
  memoryScope: MemoryScope
}

export interface StartTurnEntryWorkInput {
  channelId: string
  guildId: string
  userId: string
  speakerName: string
  message: string
  lookupQuery?: string
  mentionedUserIds?: string[]
  includeEpisodeRecall?: boolean
  memoryScope: MemoryScope
}

export type PendingTurnJudgment = Promise<TurnJudgment | null>

export interface TurnEntryWork {
  judgment: PendingTurnJudgment
  prefetch: Promise<PrefetchResult>
  queryEmbedding?: Promise<EpisodeEmbedding | null>
  needsLookup?: number | null
  cancel(): void
}

interface TurnContextEntryOptions extends TurnContextOptions {
  turnEntryWork: TurnEntryWork
  mediaWork?: Promise<unknown>
}

function formatServerFact(fact: ReturnType<typeof retrieveGuildFacts>['facts'][number]): string {
  const eventDate = formatGuildFactDate(fact)
  return `- ${fact.predicate}${eventDate ? ` (${eventDate})` : ''}: ${fact.value}`
}

function buildEntryJudgmentInput(input: StartTurnEntryWorkInput): TurnJudgmentInput {
  const history = loadHistory(input.channelId, 3, config.session.maxRehydrationAge)
  const ambiguous =
    input.memoryScope !== 'none' && config.jev.referents !== 'off'
      ? resolveReferences({
          guildId: input.guildId,
          text: input.message,
          speakerId: input.userId,
          mentionedUserIds: input.mentionedUserIds ?? [],
          scope: { guildId: input.guildId, channelId: input.channelId }
        }).ambiguous.map(({ alias, candidateIds }) => ({
          alias,
          candidates: candidateIds.map((userId) => ({
            userId,
            displayName: getUserName(userId)?.displayName ?? userId
          }))
        }))
      : []

  return {
    speakerName: input.speakerName,
    message: input.message,
    recentLines: history.map(({ role, displayName, content }) => {
      const speaker = role === 'assistant' ? character.name : displayName || input.speakerName
      return '[' + speaker + ']: ' + content
    }),
    ambiguous,
    includeTone: config.jev.tone !== 'off',
    includeLookup: config.jev.prefetch !== 'off'
  }
}

export function startTurnEntryWork(input: StartTurnEntryWorkInput): TurnEntryWork {
  const controller = new AbortController()
  const embeddingController = new AbortController()
  const queryEmbedding = input.includeEpisodeRecall
    ? Promise.resolve()
        .then(() =>
          embeddingController.signal.aborted
            ? null
            : embedEpisodeText({
                text: input.message,
                role: 'RETRIEVAL_QUERY',
                signal: embeddingController.signal
              }).then(({ values }) => values)
        )
        .catch(() => null)
    : undefined
  let judgmentInput: TurnJudgmentInput
  try {
    judgmentInput = buildEntryJudgmentInput(input)
  } catch (error) {
    logger.warn({ channelId: input.channelId, error }, 'Failed to prepare Jev judgment')
    return {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' }, outcome: null }),
      queryEmbedding,
      needsLookup: null,
      cancel: () => {
        controller.abort()
        embeddingController.abort()
      }
    }
  }
  const shouldAsk = judgmentInput.includeTone || judgmentInput.ambiguous.length > 0 || judgmentInput.includeLookup
  let needsLookup: number | null = null
  const judgment = shouldAsk
    ? Promise.resolve()
        .then(() => (controller.signal.aborted ? null : judgeTurn(judgmentInput, { signal: controller.signal })))
        .then((settled) => {
          needsLookup = settled?.needsLookup ?? null
          return settled
        })
        .catch(() => {
          needsLookup = null
          return null
        })
    : Promise.resolve(null)
  const prefetch = judgment
    .then((settled) =>
      runPrefetchForJudgment(
        settled,
        {
          mode: config.jev.prefetch,
          minimumNoul: config.jev.prefetchMinNoul,
          channelId: input.channelId
        },
        { query: input.lookupQuery ?? input.message, signal: controller.signal }
      )
    )
    .catch(() => ({ decision: { fire: false, reason: 'no_judgment' as const }, outcome: null }))

  return {
    judgment,
    prefetch,
    queryEmbedding,
    get needsLookup() {
      return needsLookup
    },
    cancel: () => {
      controller.abort()
      embeddingController.abort()
    }
  }
}

/** The query embedding, or `null` once `embeddingTimeoutMs` passes; the one wait every recall path shares. */
function awaitQueryEmbedding(pending: Promise<EpisodeEmbedding | null>): Promise<EpisodeEmbedding | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), config.memory.embeddingTimeoutMs)
  })
  return Promise.race([pending, timeout])
    .catch(() => null)
    .finally(() => {
      if (timer) clearTimeout(timer)
    })
}

/** The query embedding within `ms`, or null; the gate waits less than the legacy sections do. */
function embeddingWithin(
  pending: Promise<EpisodeEmbedding | null> | undefined,
  ms: number
): Promise<EpisodeEmbedding | null> {
  if (!pending || ms <= 0) return Promise.resolve(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
    timer.unref()
  })
  return Promise.race([pending, timeout])
    .catch(() => null)
    .finally(() => {
      if (timer) clearTimeout(timer)
    })
}

async function awaitRecallSection(
  embedding: Promise<EpisodeEmbedding | null>,
  buildBlock: (queryEmbedding: EpisodeEmbedding) => string
): Promise<string> {
  try {
    const queryEmbedding = await embedding
    const block = queryEmbedding ? buildBlock(queryEmbedding) : ''
    return block ? `\n\n${block}` : ''
  } catch {
    return ''
  }
}

type TimedRecall = { result: RecallResult; durationMs: number }

function runRecall(input: RecallInput, channelId: string): TimedRecall | null {
  const startedAt = performance.now()
  try {
    const result = recallForTurn(input)
    return { result, durationMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    logger.warn({ channelId, error }, 'Failed to recall memories for the turn')
    return null
  }
}

function shadowGateDetail(
  gated: GateRun,
  timing: {
    turnStartedAt: number
    toneReadyAt: number | null
    embeddingReadyAt: number
    contextReadyAt: number
    mediaReadyAt: number
    deadlineAt: number
  }
) {
  const { turnStartedAt, toneReadyAt, embeddingReadyAt, contextReadyAt, mediaReadyAt, deadlineAt } = timing
  return {
    ...gated.detail,
    startMs: Math.round(gated.startedAt - turnStartedAt),
    toneReadyMs: toneReadyAt === null ? null : Math.round(toneReadyAt - turnStartedAt),
    embeddingReadyMs: Math.round(embeddingReadyAt - turnStartedAt),
    contextReadyMs: Math.round(contextReadyAt - turnStartedAt),
    mediaReadyMs: Math.round(mediaReadyAt - turnStartedAt),
    deadlineMs: Math.round(deadlineAt - turnStartedAt),
    projectedAddedMs: Math.round(
      Math.max(0, Math.min(gated.settledAt, deadlineAt) - Math.max(contextReadyAt, mediaReadyAt))
    )
  }
}

export type TurnPrefetch = { block: string; usedTool: boolean; result: PrefetchResult | null }

function prefetchStatusOf(judgment: TurnJudgment, result: PrefetchResult | null): string {
  if (result) return result.outcome?.status ?? (result.decision.fire ? 'gave_up' : result.decision.reason)
  const decision = decidePrefetch(judgment, config.jev.prefetch, config.jev.prefetchMinNoul)
  return decision.reason === 'fired' ? 'gave_up' : decision.reason
}

export async function awaitTurnPrefetch(turnEntryWork: TurnEntryWork, channelId: string): Promise<TurnPrefetch> {
  if (config.jev.prefetch !== 'on') return { block: '', usedTool: false, result: null }
  const result = await settlePrefetch(turnEntryWork.prefetch, config.jev.prefetchWaitMs)
  if (!result) {
    turnEntryWork.cancel()
    logger.info({ channelId, status: 'gave_up' }, 'Search prefetch not used this turn')
    return { block: '', usedTool: false, result: null }
  }
  const { outcome } = result
  if (!outcome || outcome.status !== 'ready') {
    logger.info({ channelId, status: outcome?.status ?? result.decision.reason }, 'Search prefetch not used this turn')
    return { block: '', usedTool: false, result }
  }
  recordSearchCitations(outcome.sources)
  return { block: buildLookedUpBlock(outcome), usedTool: true, result }
}

export function applyJevTone(
  ruleTone: ToneKey,
  judgment: TurnJudgment | null,
  mode: 'off' | 'shadow' | 'on',
  minimumProbability: number
): ToneKey {
  const tone = judgment?.tone
  if (mode !== 'on' || !tone || tone.probability === null) return ruleTone
  return tone.probability >= minimumProbability ? tone.tone : ruleTone
}

/** Convert ADK session events to WindowMessages for tone detection */
function eventsToWindowMessages(events: Event[]): WindowMessage[] {
  return events
    .filter((e) => e.content?.parts?.some((p: Part) => p.text && !p.thought))
    .map((e) => ({
      role: (e.author === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      displayName: '',
      content: (e.content?.parts ?? [])
        .filter((p: Part) => p.text && !p.thought)
        .map((p: Part) => p.text)
        .join(' '),
      timestamp: e.timestamp ?? 0
    }))
}

export async function createTurnContext(options: TurnContextEntryOptions) {
  const turnStartedAt = performance.now()
  const deadlineAt = turnStartedAt + config.memory.recallGateDeadlineMs
  const mediaReady = options.mediaWork
    ? options.mediaWork.then(
        () => performance.now(),
        () => performance.now()
      )
    : Promise.resolve(turnStartedAt)
  let markContextReady!: (readyAt: number) => void
  // If context creation throws, leaving this unresolved drops only that turn's shadow row.
  const contextReady = new Promise<number>((resolve) => {
    markContextReady = resolve
  })
  let toneReadyAt: number | null = null
  let embeddingReadyAt = turnStartedAt
  const { channelId, guildId, userMessage, displayName, username, userId, memoryScope } = options
  const session = await ensureSession(channelId)
  resetIdleTimer(channelId)

  const fakeMessages = eventsToWindowMessages(session.events ?? [])
  const hour = getLocalHour()
  const ruleTone = detectTone(
    [...fakeMessages, { role: 'user', displayName, content: userMessage, timestamp: Date.now() }],
    hour
  )
  let tone = ruleTone
  let references: ReturnType<typeof resolveReferences> = { resolved: [], ambiguous: [] }

  if (memoryScope !== 'none') {
    try {
      references = resolveReferences({
        guildId,
        text: userMessage,
        speakerId: userId,
        mentionedUserIds: options.mentionedUserIds ?? [],
        scope: { guildId, channelId }
      })
      if (references.resolved.length > 0 || references.ambiguous.length > 0) {
        logger.info(
          {
            channelId,
            resolvedReferences: references.resolved.length,
            ambiguousReferences: references.ambiguous.length
          },
          'Resolved message references'
        )
      }
    } catch (error) {
      logger.warn({ channelId, error }, 'Failed to resolve message references')
    }
  }

  const toneActive = config.jev.tone !== 'off'
  const referentsActive = config.jev.referents !== 'off' && references.ambiguous.length > 0
  const appliedJevReferents: Array<{ alias: string; userId: string; displayName: string }> = []
  const scope: RecallScope | undefined = guildId && !guildId.startsWith('dm:') ? { guildId, channelId } : undefined
  const namedRecallIds = () => [
    ...new Set([
      ...references.resolved.map(({ userId: referenceId }) => referenceId),
      ...appliedJevReferents.map(({ userId: referenceId }) => referenceId)
    ])
  ]
  const recallParticipantIds = (channelUserIds: Iterable<string>) =>
    [...new Set([...namedRecallIds(), ...channelUserIds].filter((participantId) => participantId !== userId))].slice(
      0,
      config.memory.recentParticipantLimit
    )

  function startShadowGate(): Promise<GateRun | 'failed'> | null {
    if (memoryScope !== 'full' || !scope || config.memory.recall !== 'shadow') return null
    // Read before the legacy retriever marks its picks as recalled, so the gate does not see them as cooling.
    const gateNow = Date.now()
    return embeddingWithin(
      options.turnEntryWork.queryEmbedding,
      Math.min(config.memory.recallGateEmbeddingWaitMs, deadlineAt - performance.now())
    )
      .then(async (embedding) => {
        embeddingReadyAt = performance.now()
        // Building the pool is synchronous SQLite work, so it yields to the turn before running.
        await new Promise<void>((resolve) => setImmediate(resolve))
        return runRecallGate({
          input: {
            scope,
            speakerId: userId,
            participantIds: recallParticipantIds(getChannelUsers(channelId, config.session.windowSize).keys()),
            namedIds: namedRecallIds(),
            message: userMessage,
            queryEmbedding: embedding,
            now: gateNow
          },
          speakerName: displayName,
          recentLines: loadHistory(channelId, 3, config.session.maxRehydrationAge).map(
            ({ role, displayName: name, content }) =>
              `[${role === 'assistant' ? 'Roka' : name || displayName}]: ${content}`
          ),
          nameOf: (memberId) => getUserName(memberId)?.displayName ?? 'someone',
          deadlineAt,
          // Shadow collects the raw Jev latency even after the virtual reply deadline.
          collectUntil: performance.now() + config.jev.memoryTimeoutMs,
          mode: 'shadow',
          channelId,
          guildId
        })
      })
      .catch((error) => {
        logger.warn({ channelId, error }, 'Jev recall gate failed')
        return 'failed' as const
      })
  }

  const waitForReferents = config.jev.referents === 'on' && references.ambiguous.length > 0
  let gatePromise = waitForReferents ? null : startShadowGate()
  const turnEvent: {
    prefetch?: TurnPrefetch
    pending?: { judgment: TurnJudgment; toneApplied: boolean }
  } = {}

  function persistTurnEventWhenReady(): void {
    if (!turnEvent.pending || !turnEvent.prefetch) return
    const { judgment, toneApplied } = turnEvent.pending
    turnEvent.pending = undefined

    recordJevEvent({
      kind: 'turn',
      guildId,
      channelId,
      question: JSON.stringify({
        tone: config.jev.tone !== 'off',
        referentCount: judgment.referents.length,
        prefetch: config.jev.prefetch
      }),
      answer: JSON.stringify({
        tone: judgment.tone?.tone ?? null,
        referentOutcomes: {
          total: judgment.referents.length,
          matched: judgment.referents.filter(({ userId: referentUserId }) => referentUserId !== null).length
        },
        needsLookup: judgment.needsLookup,
        prefetchStatus: prefetchStatusOf(judgment, turnEvent.prefetch.result)
      }),
      probability: judgment.tone?.probability ?? null,
      confidence: judgment.tone?.confidence ?? null,
      applied: toneApplied,
      latencyMs: Math.round(judgment.latencyMs),
      inputTokens: judgment.inputTokens,
      baseline: ruleTone
    })
  }

  if (toneActive || referentsActive || config.jev.prefetch !== 'off') {
    const ambiguous = referentsActive
      ? references.ambiguous.map(({ alias, candidateIds }) => ({
          alias,
          candidates: candidateIds.map((id) => ({
            userId: id,
            displayName: getUserName(id)?.displayName ?? id
          }))
        }))
      : []
    const blocking = config.jev.tone === 'on' || (referentsActive && config.jev.referents === 'on')

    const settleJudgment = (judgment: TurnJudgment | null, apply: boolean): void => {
      if (!judgment) return

      const toneProbability = judgment.tone?.probability ?? null
      const toneApplied =
        apply &&
        config.jev.tone === 'on' &&
        toneProbability !== null &&
        toneProbability >= config.jev.toneMinProbability
      tone = applyJevTone(ruleTone, judgment, apply ? config.jev.tone : 'shadow', config.jev.toneMinProbability)

      const referents = judgment.referents.map((referent) => {
        const accepted =
          apply &&
          config.jev.referents === 'on' &&
          referent.userId !== null &&
          referent.userId !== userId &&
          referent.confidence >= config.jev.referentMinConfidence
        if (accepted && referent.userId) {
          const candidate = ambiguous
            .find(({ alias }) => alias === referent.alias)
            ?.candidates.find(({ userId: candidateId }) => candidateId === referent.userId)
          appliedJevReferents.push({
            alias: referent.alias,
            userId: referent.userId,
            displayName: candidate?.displayName ?? getUserName(referent.userId)?.displayName ?? referent.userId
          })
        }
        return {
          candidates: references.ambiguous.find(({ alias }) => alias === referent.alias)?.candidateIds.length ?? 0,
          pickedUserId: referent.userId,
          confidence: referent.confidence,
          applied: accepted
        }
      })

      logger.info(
        {
          channelId,
          toneMode: config.jev.tone,
          referentsMode: config.jev.referents,
          ruleTone,
          jevTone: judgment.tone?.tone ?? null,
          toneConfidence: judgment.tone?.confidence ?? null,
          toneProbability,
          toneApplied,
          referents,
          latencyMs: Math.round(judgment.latencyMs),
          inputTokens: judgment.inputTokens
        },
        'Jev turn judgment'
      )

      turnEvent.pending = { judgment, toneApplied }
      persistTurnEventWhenReady()
    }

    if (blocking) {
      const judgment = await options.turnEntryWork.judgment
      if (config.jev.tone === 'on') toneReadyAt = performance.now()
      settleJudgment(judgment, true)
    } else {
      void options.turnEntryWork.judgment.then((judgment) => settleJudgment(judgment, false))
    }
  }

  if (waitForReferents) gatePromise = startShadowGate()

  const basePrompt = assembleSystemPrompt({ tone, hour, displayName, memoryScope })
  // DM facts live under a `dm:` tenant the unified recall does not read, so DMs keep the legacy facts block.
  const recallMode = scope ? config.memory.recall : 'legacy'
  // Taken before the legacy retriever marks its picks as recalled, so the shadow run does not see them as cooling.
  const recallNow = Date.now()
  const recallEmbedding = memoryScope === 'full' && scope ? options.turnEntryWork.queryEmbedding : undefined
  const queryEmbedding = recallEmbedding ? awaitQueryEmbedding(recallEmbedding) : Promise.resolve(null)
  const episodeSectionPromise =
    memoryScope === 'full' && recallMode !== 'unified'
      ? awaitRecallSection(queryEmbedding, (embedding) =>
          buildEpisodeRecallBlock({ guildId, queryEmbedding: embedding, scope })
        )
      : Promise.resolve('')
  const mediaSectionPromise =
    memoryScope === 'full' && recallMode !== 'unified'
      ? awaitRecallSection(queryEmbedding, (embedding) =>
          buildMediaRecallBlock({ guildId, queryEmbedding: embedding, scope })
        )
      : Promise.resolve('')
  let factsSection = ''
  let serverFactsSection = ''
  let overheardSection = ''
  let factEntryCount = 0
  let participantIds: string[] = []

  // A memory-free turn (`/ask`) reads nothing: no claims retrieval, no legacy facts, and no
  // `context_build` telemetry, because nothing was built to measure (#207).
  if (memoryScope === 'full') {
    try {
      // Resolve user identities from persistent lookup table (survives restarts)
      const knownUsers = getAllUserNames()

      // Also pull channel-specific users from session history (has channel context)
      const channelUsers = getChannelUsers(channelId, config.session.windowSize)
      for (const [uid, user] of channelUsers) {
        if (!knownUsers.has(uid) && user.username) {
          knownUsers.set(uid, { userId: uid, username: user.username, displayName: user.displayName })
        }
      }

      // Ensure current speaker is included
      knownUsers.set(userId, { userId, username, displayName })

      participantIds = recallParticipantIds(channelUsers.keys())

      // The unified recall replaces the legacy blocks, so a unified turn reads none of them.
      if (recallMode !== 'unified') {
        const retrieval = retrieveForTurn({ guildId, speakerId: userId, participantIds, message: userMessage, scope })
        const factEntries = retrieval.entries
        const retrievalSelected = retrieval.claims.length

        const factsEnvelope = buildFactsEnvelope(factEntries)
        if (factsEnvelope) {
          factsSection = `\n\n## What You Remember About People In This Channel\n${factsEnvelope}`
          factEntryCount = factEntries.length
          logger.info(
            { channelId, usersWithFacts: factEntries.length, totalUsers: knownUsers.size },
            'User facts injected into prompt'
          )
        }

        if (guildId) {
          const serverFacts = retrieveGuildFacts(guildId, Date.now(), scope).facts
          if (serverFacts.length > 0) {
            serverFactsSection =
              '\n\n## Things You Remember About This Server\n' + serverFacts.map(formatServerFact).join('\n')
          }
        }

        recordMemoryEvent({
          kind: 'context_build',
          guildId,
          channelId,
          subjectUserId: userId,
          nSelected: retrievalSelected,
          tokensEst: factsEnvelope ? estimateTokens(factsEnvelope) : 0
        })
      }
    } catch (error) {
      if (recallMode !== 'unified') {
        recordMemoryEvent({
          kind: 'context_build',
          guildId,
          channelId,
          subjectUserId: userId,
          nSelected: 0,
          tokensEst: 0
        })
      }
      logger.warn({ userId, error }, 'Failed to load user memory for prompt injection')
    }
  }

  // Shadow and unified both run the unified recall on the query embedding the legacy sections use.
  const namedIds = namedRecallIds()
  const recallInput = (embedding: EpisodeEmbedding | null): RecallInput | null =>
    scope
      ? {
          scope,
          speakerId: userId,
          participantIds,
          namedIds,
          message: userMessage,
          queryEmbedding: embedding,
          now: recallNow
        }
      : null
  const recordRecall = (recalled: TimedRecall, mode: 'shadow' | 'unified', gate?: Record<string, unknown>): void => {
    const { result, durationMs } = recalled
    recordMemoryEvent({
      kind: mode === 'unified' ? 'recall' : 'recall_shadow',
      guildId,
      channelId,
      subjectUserId: userId,
      durationMs,
      nCandidates: result.trace.nCandidates,
      nSelected: result.items.length,
      tokensEst: result.trace.tokensEst,
      detail: JSON.stringify({
        mode,
        privacy: config.memory.privacy,
        fallback: result.trace.fallback,
        gated: result.trace.gated,
        selected: result.items.map((item) => [item.kind, item.id, Number(item.score.toFixed(3))]),
        ...(gate ? { gate } : {})
      })
    })
  }
  const unifiedPromise =
    memoryScope === 'full' && recallMode === 'unified'
      ? queryEmbedding.then((embedding) => {
          const input = recallInput(embedding)
          return input ? runRecall(input, channelId) : null
        })
      : null
  if (gatePromise) {
    // The shadow row needs both ready times even when the gate settles first.
    void Promise.all([
      queryEmbedding.then(
        (embedding) =>
          new Promise<TimedRecall | null>((resolve) =>
            setImmediate(() => {
              const input = recallInput(embedding)
              resolve(input ? runRecall(input, channelId) : null)
            })
          )
      ),
      gatePromise,
      contextReady,
      mediaReady
    ])
      .then(([recalled, gated, contextReadyAt, mediaReadyAt]) => {
        if (!recalled) return
        const gate =
          gated === 'failed'
            ? { v: 1, status: 'gate_error' }
            : shadowGateDetail(gated, {
                turnStartedAt,
                toneReadyAt,
                embeddingReadyAt,
                contextReadyAt,
                mediaReadyAt,
                deadlineAt
              })
        recordRecall(recalled, 'shadow', gate)
      })
      .catch((error) => {
        logger.warn({ channelId, error }, 'Failed to record shadow recall')
      })
  }

  // Names people and nothing else, so it survives a memory-free turn as the identity line the brief allows.
  let whoIsMentionedSection = ''
  if (memoryScope !== 'none') {
    const namedAliases = references.resolved.filter(
      ({ alias, displayName: referenceName, matchedBy }) =>
        (matchedBy === 'nickname' || matchedBy === 'username') && alias.toLowerCase() !== referenceName.toLowerCase()
    )
    const mentionLines = [
      ...namedAliases.map(({ alias, displayName: referenceName }) => `- "${alias}" means ${referenceName}`),
      ...appliedJevReferents.map(({ alias, displayName: referenceName }) => `- "${alias}" means ${referenceName}`)
    ]
    if (mentionLines.length > 0) {
      whoIsMentionedSection = `\n\n## Who Is Mentioned\n${mentionLines.join('\n')}`
    }
  }

  const overheard = getBufferMessages(channelId).slice(-config.memory.contextSize)
  const overheardBlock = buildOverheardBlock(overheard)
  if (overheardBlock) {
    overheardSection = `\n\n## Recent Channel Activity (messages you overheard)\n${overheardBlock}`
  }

  // The Discord ID stays either way; only the half naming the memory tools is dropped, because a
  // memory-free turn is offered none of them and cannot act on the instruction (#207).
  const tailSection =
    memoryScope === 'full'
      ? `\n\n- The current user's Discord ID is "${userId}".` +
        ' remember_user and recall_user target the current user automatically; to recall a different server member, pass their name as user_name.'
      : `\n\n- The current user's Discord ID is "${userId}".`

  const prefetch = await awaitTurnPrefetch(options.turnEntryWork, channelId)
  const episodeSection = await episodeSectionPromise
  const mediaSection = await mediaSectionPromise
  const recalled = unifiedPromise ? await unifiedPromise : null
  let memorySection = ''
  if (recalled) {
    const { result } = recalled
    memorySection = result.block ? `\n\n${result.block}` : ''
    try {
      touchRecalled(result.items.filter(({ kind }) => kind === 'fact' || kind === 'server_fact').map(({ id }) => id))
    } catch (error) {
      logger.warn({ channelId, error }, 'Failed to record recalled memories')
    }
    recordMemoryEvent({
      kind: 'context_build',
      guildId,
      channelId,
      subjectUserId: userId,
      nSelected: result.items.length,
      tokensEst: result.trace.tokensEst
    })
    recordRecall(recalled, 'unified')
  }
  turnEvent.prefetch = prefetch
  persistTurnEventWhenReady()
  const lookedUpSection = prefetch.block ? `\n\n${prefetch.block}` : ''
  const replyShapeSection = `\n\n${buildReplyShapePrompt({
    userMessage,
    tone,
    recentReplies: fakeMessages.filter((message) => message.role === 'assistant').map((message) => message.content),
    displayName
  })}`

  // Safety de-escalation ladder. Each rung strictly removes carried context — never the current message —
  // so Roka answers with less surrounding context rather than refusing outright.
  const SAFETY_LADDER = ['drop_overheard', 'drop_facts', 'clear_history'] as const
  function composePrompt(safetyRung: number): string {
    const head =
      safetyRung >= 3 ? assembleSystemPrompt({ tone: character.safeMood, hour, displayName, memoryScope }) : basePrompt
    const peopleSection = recallMode === 'unified' ? memorySection : factsSection
    return [
      head,
      safetyRung < 2 ? `${peopleSection}${whoIsMentionedSection}` : '',
      safetyRung < 2 ? serverFactsSection : '',
      safetyRung < 2 ? episodeSection : '',
      safetyRung < 2 ? mediaSection : '',
      safetyRung < 1 ? overheardSection : '',
      tailSection,
      safetyRung === 0 ? lookedUpSection : '',
      safetyRung > 0 ? `\n\n${SAFETY_STEER_ADDENDUM}` : '',
      safetyRung === 0 ? replyShapeSection : ''
    ].join('')
  }

  const systemPrompt = composePrompt(0)
  logger.debug({ tone, hour }, 'Prompt assembled')

  markContextReady(performance.now())
  return {
    session,
    fakeMessages,
    systemPrompt,
    tone,
    hour,
    factEntryCount,
    overheardSection,
    prefetchUsed: prefetch.usedTool,
    safetyLadder: SAFETY_LADDER,
    composePrompt
  }
}
