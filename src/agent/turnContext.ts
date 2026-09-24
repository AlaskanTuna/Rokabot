import type { Event, Session } from '@google/adk'
import type { Part } from '@google/genai'
import { config } from '../config.js'
import type { WindowMessage } from '../session/types.js'
import { recordJevEvent } from '../storage/jevEventStore.js'
import { recordMemoryEvent } from '../storage/metricsStore.js'
import { getChannelUsers, loadHistory } from '../storage/sessionStore.js'
import { getFacts, refreshFactTimestamps } from '../storage/userMemory.js'
import { getAllUserNames, getUserName } from '../storage/userNames.js'
import { logger } from '../utils/logger.js'
import { getLocalHour } from '../utils/timezone.js'
import { estimateTokens } from '../utils/tokens.js'
import { judgeTurn } from './jev/judgments.js'
import type { TurnJudgment, TurnJudgmentInput } from './jev/judgments.js'
import { resolveReferences } from './memory/identityResolver.js'
import { retrieveForTurn } from './memory/retriever.js'
import { getMessages as getBufferMessages } from './passiveBuffer.js'
import { assembleSystemPrompt } from './promptAssembler.js'
import { buildFactsEnvelope, buildOverheardBlock } from './promptSafety.js'
import type { ToneKey } from './prompts/tones.js'
import { recordSearchCitations } from './searchCitations.js'
import { buildLookedUpBlock, runPrefetchForJudgment, settlePrefetch } from './searchPrefetch.js'
import type { PrefetchResult } from './searchPrefetch.js'
import { ensureSession, resetIdleTimer } from './session.js'
import { detectTone } from './toneDetector.js'

const SAFETY_STEER_ADDENDUM =
  '## Redirect This One\n' +
  'Do not answer the previous message on its own terms, and never repeat, quote, or hint at what it was about. Stay completely in character: respond to the person, not the topic — a light dodge, a tease, or a small change of subject in your own voice. Never mention rules, filters, errors, or that anything went wrong. Every other instruction above still applies exactly as written.'
export interface TurnContextOptions {
  channelId: string
  guildId: string
  userMessage: string
  displayName: string
  username: string
  userId: string
  mentionedUserIds?: string[]
  /** `/ask` passes `false`: no retrieval, no facts, no memory tools, no `context_build` telemetry (#207). */
  memory: boolean
}

export interface StartTurnEntryWorkInput {
  channelId: string
  guildId: string
  userId: string
  speakerName: string
  message: string
  mentionedUserIds?: string[]
}

export type PendingTurnJudgment = Promise<TurnJudgment | null>

export interface TurnEntryWork {
  judgment: PendingTurnJudgment
  prefetch: Promise<PrefetchResult>
  cancel(): void
}

interface TurnContextEntryOptions extends TurnContextOptions {
  turnEntryWork: TurnEntryWork
}

function buildEntryJudgmentInput(input: StartTurnEntryWorkInput): TurnJudgmentInput {
  const history = loadHistory(input.channelId, 3, config.session.maxRehydrationAge)
  const ambiguous =
    config.memory.claimsBackend && config.jev.referents !== 'off'
      ? resolveReferences({
          guildId: input.guildId,
          text: input.message,
          speakerId: input.userId,
          mentionedUserIds: input.mentionedUserIds ?? []
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
      const speaker = role === 'assistant' ? 'Roka' : displayName || input.speakerName
      return '[' + speaker + ']: ' + content
    }),
    ambiguous,
    includeTone: config.jev.tone !== 'off',
    includeLookup: config.jev.prefetch !== 'off'
  }
}

export function startTurnEntryWork(input: StartTurnEntryWorkInput): TurnEntryWork {
  const controller = new AbortController()
  let judgmentInput: TurnJudgmentInput
  try {
    judgmentInput = buildEntryJudgmentInput(input)
  } catch (error) {
    logger.warn({ channelId: input.channelId, error }, 'Failed to prepare Jev judgment')
    return {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' }, outcome: null }),
      cancel: () => controller.abort()
    }
  }
  const shouldAsk = judgmentInput.includeTone || judgmentInput.ambiguous.length > 0 || judgmentInput.includeLookup
  const judgment = shouldAsk
    ? Promise.resolve()
        .then(() => (controller.signal.aborted ? null : judgeTurn(judgmentInput, { signal: controller.signal })))
        .catch(() => null)
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
        { query: input.message, signal: controller.signal }
      )
    )
    .catch(() => ({ decision: { fire: false, reason: 'no_judgment' as const }, outcome: null }))

  return {
    judgment,
    prefetch,
    cancel: () => controller.abort()
  }
}

export type TurnPrefetch = { block: string; usedTool: boolean }

export async function awaitTurnPrefetch(turnEntryWork: TurnEntryWork, channelId: string): Promise<TurnPrefetch> {
  if (config.jev.prefetch !== 'on') return { block: '', usedTool: false }
  const result = await settlePrefetch(turnEntryWork.prefetch, config.jev.prefetchWaitMs)
  if (!result) {
    turnEntryWork.cancel()
    logger.info({ channelId, status: 'gave_up' }, 'Search prefetch not used this turn')
    return { block: '', usedTool: false }
  }
  const { outcome } = result
  if (!outcome || outcome.status !== 'ready') {
    logger.info({ channelId, status: outcome?.status ?? result.decision.reason }, 'Search prefetch not used this turn')
    return { block: '', usedTool: false }
  }
  recordSearchCitations(outcome.sources)
  return { block: buildLookedUpBlock(outcome), usedTool: true }
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
  const { channelId, guildId, userMessage, displayName, username, userId, memory } = options
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

  if (config.memory.claimsBackend) {
    try {
      references = resolveReferences({
        guildId,
        text: userMessage,
        speakerId: userId,
        mentionedUserIds: options.mentionedUserIds ?? []
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

  if (toneActive || referentsActive) {
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

      recordJevEvent({
        kind: 'turn',
        guildId,
        channelId,
        question: JSON.stringify({
          tone: config.jev.tone !== 'off',
          referentCount: judgment.referents.length
        }),
        answer: JSON.stringify({
          tone: judgment.tone?.tone ?? null,
          referentOutcomes: {
            total: judgment.referents.length,
            matched: judgment.referents.filter(({ userId: referentUserId }) => referentUserId !== null).length
          }
        }),
        probability: toneProbability,
        confidence: judgment.tone?.confidence ?? null,
        applied: toneApplied,
        latencyMs: Math.round(judgment.latencyMs),
        inputTokens: judgment.inputTokens,
        baseline: ruleTone
      })
    }

    if (blocking) {
      settleJudgment(await options.turnEntryWork.judgment, true)
    } else {
      void options.turnEntryWork.judgment.then((judgment) => settleJudgment(judgment, false))
    }
  }

  const basePrompt = assembleSystemPrompt({ tone, hour, displayName, memory })
  let factsSection = ''
  let overheardSection = ''
  let factEntryCount = 0

  // A memory-free turn (`/ask`) reads nothing: no claims retrieval, no legacy facts, and no
  // `context_build` telemetry, because nothing was built to measure (#207).
  if (memory) {
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

      let factEntries: Array<{ person: string; facts: Array<{ key: string; value: string }> }>
      let retrievalSelected = 0

      if (config.memory.claimsBackend) {
        const retrieval = retrieveForTurn({
          guildId,
          speakerId: userId,
          participantIds: [
            ...new Set(
              [
                ...references.resolved.map(({ userId: referenceId }) => referenceId),
                ...appliedJevReferents.map(({ userId: referenceId }) => referenceId),
                ...channelUsers.keys()
              ].filter((participantId) => participantId !== userId)
            )
          ].slice(0, config.memory.recentParticipantLimit),
          message: userMessage
        })
        factEntries = retrieval.entries
        retrievalSelected = retrieval.claims.length
      } else {
        factEntries = []
        for (const [uid, user] of knownUsers) {
          const facts = getFacts(guildId, uid)
          if (facts.length > 0) {
            const label =
              user.username !== user.displayName ? `${user.username} (${user.displayName})` : user.displayName
            factEntries.push({ person: label, facts })
            refreshFactTimestamps(guildId, uid)
          }
        }
      }

      const factsEnvelope = buildFactsEnvelope(factEntries)
      if (factsEnvelope) {
        factsSection = `\n\n## What You Remember About People In This Channel\n${factsEnvelope}`
        factEntryCount = factEntries.length
        logger.info(
          { channelId, usersWithFacts: factEntries.length, totalUsers: knownUsers.size },
          'User facts injected into prompt'
        )
      }
      if (config.memory.claimsBackend) {
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
      if (config.memory.claimsBackend) {
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

  // Names people and nothing else, so it survives a memory-free turn as the identity line the brief allows.
  let whoIsMentionedSection = ''
  if (config.memory.claimsBackend) {
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
  const tailSection = memory
    ? `\n\n- The current user's Discord ID is "${userId}".` +
      ' remember_user and recall_user target the current user automatically; to recall a different server member, pass their name as user_name.'
    : `\n\n- The current user's Discord ID is "${userId}".`

  const prefetch = await awaitTurnPrefetch(options.turnEntryWork, channelId)
  const lookedUpSection = prefetch.block ? `\n\n${prefetch.block}` : ''

  // Safety de-escalation ladder. Each rung strictly removes carried context — never the current message —
  // so Roka answers with less surrounding context rather than refusing outright.
  const SAFETY_LADDER = ['drop_overheard', 'drop_facts', 'clear_history'] as const
  function composePrompt(safetyRung: number): string {
    const head = safetyRung >= 3 ? assembleSystemPrompt({ tone: 'sincere', hour, displayName, memory }) : basePrompt
    return [
      head,
      safetyRung < 2 ? `${factsSection}${whoIsMentionedSection}` : '',
      safetyRung < 1 ? overheardSection : '',
      tailSection,
      safetyRung === 0 ? lookedUpSection : '',
      safetyRung > 0 ? `\n\n${SAFETY_STEER_ADDENDUM}` : ''
    ].join('')
  }

  const systemPrompt = composePrompt(0)
  logger.debug({ tone, hour }, 'Prompt assembled')

  return {
    session,
    fakeMessages,
    systemPrompt,
    tone,
    hour,
    factEntryCount,
    overheardSection,
    safetyLadder: SAFETY_LADDER,
    composePrompt
  }
}
