/** ADK pipeline orchestrator for in-character response generation */

import { AsyncLocalStorage } from 'node:async_hooks'
import { BasePlugin, InMemorySessionService, LlmAgent, Runner, createEvent, isFinalResponse } from '@google/adk'
import type { Event, LlmResponse } from '@google/adk'
import type { GetSessionRequest, Session } from '@google/adk'
import type { Content, Part } from '@google/genai'
import { config } from '../config.js'
import type { WindowMessage } from '../session/types.js'
import { recordFailureDiagnostic, recordMemoryEvent } from '../storage/metricsStore.js'
import type { ResponseMetrics } from '../storage/metricsStore.js'
import { getChannelUsers, loadHistory, saveMessage } from '../storage/sessionStore.js'
import { getFacts, refreshFactTimestamps } from '../storage/userMemory.js'
import { getAllUserNames } from '../storage/userNames.js'
import { GEMINI_IMAGE_TOKENS, processImageForGemini } from '../utils/imageProcessor.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { getLocalHour } from '../utils/timezone.js'
import { estimateTokens } from '../utils/tokens.js'
import { classifyGeminiFailure, computeBackoff, extractGeminiStatus } from './geminiReliability.js'
import { retrieveForTurn } from './memory/retriever.js'
import { getMessages as getBufferMessages } from './passiveBuffer.js'
import { assembleSystemPrompt } from './promptAssembler.js'
import { buildFactsEnvelope, buildOverheardBlock } from './promptSafety.js'
import type { ToneKey } from './prompts/tones.js'
import { SAFETY_SETTINGS } from './safetySettings.js'
import { beginShutdown, isShuttingDown } from './shutdownSignal.js'
import { detectTone } from './toneDetector.js'
import { rokaTools } from './tools/index.js'

export interface ImageAttachment {
  url: string
  contentType: string
}

interface GenerateOptions {
  channelId: string
  guildId: string
  userMessage: string
  displayName: string
  username: string
  userId: string
  imageAttachments?: ImageAttachment[]
}

export interface GenerateResult {
  text: string
  tone: ToneKey
  metrics: ResponseMetrics
  toolsUsed: string[]
}

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024
// Documents get their own ceiling rather than sharing the image one: a PDF is not resized before sending, so
// its bytes reach the request as-is, and 10 MB is what upload latency admits inside gemini.timeout at the
// Pi's measured 2.5 MB/s upstream. See docs/multimodal.md.
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
const APP_NAME = 'rokabot'

const sessionErrorCounts = new Map<string, number>()
const toolCallsForRequest = new AsyncLocalStorage<Set<string>>()
// Exported so tests can drive the beforeModelCallback ALS seam directly (task 122's only observable proof point)
export const steeringForRequest = new AsyncLocalStorage<{ prompt?: string }>()
interface ModelVerdict {
  finishReason?: string
  safetyRatings?: string
  /** Heuristic: a finish reason on a returned candidate means Roka's own output was rejected; an
   * error surfaced before any candidate means the prompt was. */
  blockSide?: 'prompt' | 'response'
}
const modelVerdictForRequest = new AsyncLocalStorage<ModelVerdict>()
const activeAbortControllers = new Set<AbortController>()

const SAFETY_DEFLECTION = "Ehh… let's not get into that one~"
const RECITATION_DEFLECTION = "Ah, I don't think I should repeat that one exactly~"
const TERMINAL_DEFLECTION = "Eep, something went wrong on my side. Let's try again later~"
const SAFETY_STEER_ADDENDUM =
  '## Redirect This One\n' +
  'Do not answer the previous message on its own terms, and never repeat, quote, or hint at what it was about. Stay completely in character: respond to the person, not the topic — a light dodge, a tease, or a small change of subject in your own voice. Never mention rules, filters, errors, or that anything went wrong. Every other instruction above still applies exactly as written.'
const toolsTok = estimateTokens(JSON.stringify(rokaTools))

export interface TurnOutcome {
  text?: string
  errorCode?: string
  errorMessage?: string
  finishReason?: LlmResponse['finishReason']
  customMetadata?: LlmResponse['customMetadata']
  hasText: boolean
  hasFunctionCall: boolean
  sessionMissing?: boolean
}

interface TestTurnRequest {
  newMessage?: Content
  stateDelta?: {
    _systemPrompt: string
    participants: string[]
    _userId: string
    _channelId: string
    _guildId: string
    _userMessage: string
  }
}

export type TestRunTurn = (attempt: number, signal: AbortSignal, request?: TestTurnRequest) => Promise<TurnOutcome>
export type TestRunTurnFactory = (systemPrompt: string) => TestRunTurn

let testRunTurnFactory: TestRunTurnFactory | undefined

/** Test-only seam for supplying the innermost turn while retaining reliability orchestration. */
export function __setTestRunTurnFactory(factory: TestRunTurnFactory): void {
  testRunTurnFactory = factory
}

/** Clears the test-only turn seam so generateResponse uses the ADK runner. */
export function __resetTestRunTurnFactory(): void {
  testRunTurnFactory = undefined
}

interface ReliabilityResult {
  text: string
  kind: ReturnType<typeof classifyGeminiFailure>['kind']
  action: 'preserve' | 'destroy'
  attempts: number
  retryLatencyMs: number
  success: boolean
  failureMarker?: string
}

export interface RunTurnWithReliabilityOptions {
  runTurn: (attempt: number, signal: AbortSignal) => Promise<TurnOutcome>
  tryConsumeRetry: () => boolean
  computeBackoff: (attempt: number) => number
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>
  isShuttingDown?: () => boolean
  maxRetries: number
  retryBackoffCapMs: number
  requestTimeoutMs?: number
  turnDeadlineMs?: number
  now?: () => number
  genericFallback: string
  safetyDeflection: string
  recitationDeflection: string
  terminalDeflection: string
  resetSession?: () => Promise<void>
  /** Sheds one rung of carried context after a safety block. Resolves to the rung name, or undefined when exhausted. */
  escalateSafety?: () => Promise<string | undefined>
  /** Number of rungs escalateSafety can yield. Lets the loop stop before spending a retry token it cannot use. */
  safetyLadderLength?: number
}

function sleepUntil(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(done, delayMs)

    function done(): void {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', done)
      resolve()
    }

    if (signal.aborted) {
      done()
      return
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Derives the persistable failure marker — never the message itself, only an allowlisted status token derived from it.
 * Its fixed output alphabet (400|401|403|429|500|503|504) cannot echo request content; the allowlist is load-bearing.
 */
function markerFrom(outcome: TurnOutcome): string | undefined {
  const marker = outcome.errorCode || outcome.finishReason || extractGeminiStatus(outcome.errorMessage ?? '')
  return marker ? String(marker).slice(0, 64) : undefined
}

function fallbackResult(
  kind: ReliabilityResult['kind'],
  action: ReliabilityResult['action'],
  attempts: number,
  retryLatencyMs: number,
  options: RunTurnWithReliabilityOptions,
  failureMarker?: string
): ReliabilityResult {
  const text =
    kind === 'safety'
      ? options.safetyDeflection
      : kind === 'recitation'
        ? options.recitationDeflection
        : kind === 'terminal' || kind === 'session_corrupt'
          ? options.terminalDeflection
          : options.genericFallback

  return { text, kind, action, attempts, retryLatencyMs, success: false, failureMarker }
}

/** Runs one user turn with bounded retry policy while keeping the initial user event single-shot. */
export async function runTurnWithReliability(options: RunTurnWithReliabilityOptions): Promise<ReliabilityResult> {
  const shouldStop = options.isShuttingDown ?? isShuttingDown
  const sleep = options.sleep ?? sleepUntil
  const now = options.now ?? (() => performance.now())
  const startedAtMs = now()
  let retryLatencyMs = 0
  let lastKind: ReliabilityResult['kind'] = 'network'
  let lastMarker: string | undefined

  // Safety de-escalation rungs are granted on top of the ordinary retry budget: each one strictly
  // removes carried context, so it is cheaper and more likely to pass than the attempt before it.
  let extraSafetyAttempts = 0
  for (let attempt = 0; attempt <= options.maxRetries + extraSafetyAttempts; attempt++) {
    if (shouldStop()) return fallbackResult(lastKind, 'preserve', attempt, retryLatencyMs, options, lastMarker)

    if (attempt > 0 && options.turnDeadlineMs !== undefined) {
      const elapsedMs = now() - startedAtMs
      const remainingMs = options.turnDeadlineMs - elapsedMs
      if (remainingMs < (options.requestTimeoutMs ?? 0)) {
        logger.warn(
          {
            attempt,
            elapsedMs,
            deadlineMs: options.turnDeadlineMs,
            requestTimeoutMs: options.requestTimeoutMs,
            kind: lastKind
          },
          'Turn deadline exhausted before next attempt'
        )
        return fallbackResult(lastKind, 'preserve', attempt, retryLatencyMs, options, lastMarker)
      }
    }

    const abortController = new AbortController()
    activeAbortControllers.add(abortController)
    // Distinguishes our own per-attempt timeout from a shutdown abort: a timed-out attempt is the most
    // transient failure there is and must stay eligible for the retry budget, while shutdown must not.
    let attemptTimedOut = false
    const timeoutId = options.requestTimeoutMs
      ? setTimeout(() => {
          attemptTimedOut = true
          abortController.abort()
        }, options.requestTimeoutMs)
      : undefined

    let outcome: TurnOutcome
    try {
      outcome = await options.runTurn(attempt, abortController.signal)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outcome = {
        errorMessage: message,
        hasText: false,
        hasFunctionCall: false,
        sessionMissing: /Session not found/i.test(message)
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      activeAbortControllers.delete(abortController)
    }

    if (outcome.sessionMissing)
      return fallbackResult('network', 'preserve', attempt + 1, retryLatencyMs, options, lastMarker)
    if (shouldStop() || (abortController.signal.aborted && !attemptTimedOut))
      return fallbackResult(lastKind, 'preserve', attempt + 1, retryLatencyMs, options, lastMarker)

    const failure = classifyGeminiFailure(outcome)
    lastKind = failure.kind
    if (failure.kind !== 'ok') {
      lastMarker = markerFrom(outcome)
      logger.warn(
        {
          attempt,
          kind: failure.kind,
          marker: lastMarker,
          model: config.gemini.model
        },
        'Live turn attempt failed'
      )
    }
    if (failure.kind === 'ok' && outcome.text) {
      return {
        text: outcome.text,
        kind: 'ok',
        action: 'preserve',
        attempts: attempt + 1,
        retryLatencyMs,
        success: true,
        failureMarker: lastMarker
      }
    }

    if (
      failure.kind === 'safety' &&
      options.escalateSafety &&
      extraSafetyAttempts < (options.safetyLadderLength ?? 0) &&
      !shouldStop()
    ) {
      if (options.turnDeadlineMs !== undefined) {
        const elapsedMs = now() - startedAtMs
        const remainingMs = options.turnDeadlineMs - elapsedMs
        if (remainingMs < (options.requestTimeoutMs ?? 0)) {
          logger.warn(
            {
              attempt,
              elapsedMs,
              deadlineMs: options.turnDeadlineMs,
              requestTimeoutMs: options.requestTimeoutMs,
              kind: failure.kind
            },
            'Turn deadline exhausted before safety de-escalation'
          )
          return fallbackResult('safety', 'preserve', attempt + 1, retryLatencyMs, options, lastMarker)
        }
      }
      if (!options.tryConsumeRetry())
        return fallbackResult('safety', 'preserve', attempt + 1, retryLatencyMs, options, lastMarker)

      const rung = await options.escalateSafety()
      if (rung) {
        extraSafetyAttempts++
        logger.warn({ attempt, rung, kind: failure.kind }, 'Safety block — de-escalating carried context')
        continue
      }
    }

    if (!failure.retryable)
      return fallbackResult(
        failure.kind,
        failure.kind === 'terminal' ? 'destroy' : 'preserve',
        attempt + 1,
        retryLatencyMs,
        options,
        lastMarker
      )

    if (failure.kind === 'session_corrupt' && !options.resetSession)
      return fallbackResult(failure.kind, 'destroy', attempt + 1, retryLatencyMs, options, lastMarker)

    const retryLimit =
      failure.kind === 'recitation' || failure.kind === 'session_corrupt'
        ? Math.min(options.maxRetries, 1)
        : options.maxRetries
    if (attempt >= retryLimit || shouldStop()) {
      return fallbackResult(
        failure.kind,
        failure.kind === 'session_corrupt' ? 'destroy' : 'preserve',
        attempt + 1,
        retryLatencyMs,
        options,
        lastMarker
      )
    }

    const delayMs = Math.min(options.computeBackoff(attempt), Math.max(0, options.retryBackoffCapMs - retryLatencyMs))
    if (delayMs <= 0 && retryLatencyMs >= options.retryBackoffCapMs) {
      return fallbackResult(
        failure.kind,
        failure.kind === 'session_corrupt' ? 'destroy' : 'preserve',
        attempt + 1,
        retryLatencyMs,
        options,
        lastMarker
      )
    }

    if (options.turnDeadlineMs !== undefined) {
      const elapsedMs = now() - startedAtMs
      const remainingMs = options.turnDeadlineMs - elapsedMs
      if (remainingMs < delayMs + (options.requestTimeoutMs ?? 0)) {
        logger.warn(
          {
            attempt,
            elapsedMs,
            delayMs,
            deadlineMs: options.turnDeadlineMs,
            requestTimeoutMs: options.requestTimeoutMs,
            kind: failure.kind
          },
          'Turn deadline would be exceeded by planned retry backoff'
        )
        return fallbackResult(
          failure.kind,
          failure.kind === 'session_corrupt' ? 'destroy' : 'preserve',
          attempt + 1,
          retryLatencyMs,
          options,
          lastMarker
        )
      }
    }

    if (!options.tryConsumeRetry())
      return fallbackResult(
        failure.kind,
        failure.kind === 'session_corrupt' ? 'destroy' : 'preserve',
        attempt + 1,
        retryLatencyMs,
        options,
        lastMarker
      )

    // A timed-out attempt leaves its controller aborted; backing off against it would skip the delay
    // entirely, so the retry sleeps on a fresh signal instead.
    await sleep(delayMs, attemptTimedOut ? new AbortController().signal : abortController.signal)
    retryLatencyMs += delayMs
    if (shouldStop() || (abortController.signal.aborted && !attemptTimedOut))
      return fallbackResult(failure.kind, 'preserve', attempt + 1, retryLatencyMs, options, lastMarker)

    if (failure.kind === 'session_corrupt') {
      try {
        await options.resetSession!()
      } catch {
        return fallbackResult(failure.kind, 'destroy', attempt + 1, retryLatencyMs, options, lastMarker)
      }
    }
  }

  return fallbackResult(lastKind, 'preserve', options.maxRetries + 1, retryLatencyMs, options, lastMarker)
}

/** Caps event history returned by getSession to keep context within budget */
class WindowedSessionService extends InMemorySessionService {
  constructor(private maxEvents: number) {
    super()
  }

  override async getSession(request: GetSessionRequest): Promise<Session | undefined> {
    return super.getSession({
      ...request,
      config: { ...request?.config, numRecentEvents: this.maxEvents }
    })
  }
}

const sessionService = new WindowedSessionService(config.session.windowSize * 2)

// Exported so tests can assert the agent-level config and beforeModelCallback seam directly
export const rokaAgent = new LlmAgent({
  name: 'roka',
  model: config.gemini.model,
  instruction: '',
  tools: [...rokaTools],
  disallowTransferToParent: true,
  disallowTransferToPeers: true,
  generateContentConfig: {
    temperature: 0.9,
    topP: 0.95,
    maxOutputTokens: config.gemini.maxOutputTokens,
    safetySettings: SAFETY_SETTINGS,
    httpOptions: { timeout: config.gemini.timeout }
  },
  beforeModelCallback: async ({ context, request }) => {
    const prompt = steeringForRequest.getStore()?.prompt ?? context.state.get<string>('_systemPrompt')
    if (prompt) {
      request.config = request.config ?? ({} as NonNullable<typeof request.config>)
      request.config!.systemInstruction = prompt
    }
    return undefined
  },
  afterModelCallback: async ({ response }) => {
    if (!response.content?.parts) return undefined

    for (const part of response.content.parts) {
      if (part.text && !part.thought) {
        // Strip per-line leading whitespace — 4+ spaces or a tab makes Discord render the line as an indented code block
        part.text = part.text
          .replace(/^\[?Roka\]?:\s*/i, '')
          .replace(/^[ \t]+/gm, '')
          .trim()
      }
    }

    const hasText = response.content.parts.some((p) => p.text?.trim() && !p.thought)
    const hasFunctionCall = response.content.parts.some((p) => 'functionCall' in p && p.functionCall)

    const verdict = modelVerdictForRequest.getStore()
    if (verdict) {
      const raw = response as unknown as { safetyRatings?: unknown; promptFeedback?: { blockReason?: string } }
      if (response.finishReason) verdict.finishReason = String(response.finishReason)
      if (raw.safetyRatings) verdict.safetyRatings = JSON.stringify(raw.safetyRatings).slice(0, 1000)
      if (raw.promptFeedback?.blockReason) {
        verdict.blockSide = 'prompt'
        verdict.finishReason ??= raw.promptFeedback.blockReason
      } else if (response.finishReason && !hasText && !hasFunctionCall) {
        verdict.blockSide = 'response'
      }
    }

    if (!hasText && !hasFunctionCall) {
      logger.warn(
        {
          model: config.gemini.model,
          partKeys: response.content.parts.map((p) => Object.keys(p)),
          finishReason: response.finishReason,
          usage: response.usageMetadata
        },
        'Empty model response surfaced for reliability handling'
      )
    }

    return undefined
  },
  beforeToolCallback: async ({ tool, args }) => {
    logger.info({ tool: tool.name, args }, 'Tool call requested')
    toolCallsForRequest.getStore()?.add(tool.name)
    return undefined
  }
})

/** Intercepts Gemini API errors and exposes them to the turn-level reliability policy. */
class ErrorRecoveryPlugin extends BasePlugin {
  async onModelErrorCallback({
    error
  }: {
    callbackContext: unknown
    llmRequest: unknown
    error: Error
  }): Promise<LlmResponse | undefined> {
    logger.error(
      {
        model: config.gemini.model,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      },
      'Gemini API error intercepted'
    )
    const failure = classifyGeminiFailure(error)
    const verdict = modelVerdictForRequest.getStore()
    if (verdict) {
      // No candidate was ever produced, so anything rejected here was rejected on the way in.
      verdict.blockSide ??= failure.kind === 'safety' ? 'prompt' : undefined
      verdict.finishReason ??= error.name
    }
    return {
      errorCode: error.name,
      errorMessage: error.message,
      customMetadata: { reliabilityKind: failure.kind }
    }
  }
}

const runner = new Runner({
  appName: APP_NAME,
  agent: rokaAgent,
  sessionService,
  plugins: [new ErrorRecoveryPlugin('error-recovery')]
})

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

function resetIdleTimer(channelId: string): void {
  const existing = idleTimers.get(channelId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    logger.info({ channelId }, 'Session idle timeout')
    void destroySession(channelId)
  }, config.session.ttlMs)

  idleTimers.set(channelId, timer)
}

/** Channels whose next session rebuild must skip SQLite rehydration after a safety de-escalation */
const rehydrationSuppressed = new Set<string>()

/** Retrieve or create an ADK session for the given channel */
async function ensureSession(channelId: string) {
  let session = await sessionService.getSession({
    appName: APP_NAME,
    userId: channelId,
    sessionId: channelId
  })

  if (!session) {
    session = await sessionService.createSession({
      appName: APP_NAME,
      userId: channelId,
      sessionId: channelId,
      state: { participants: [] }
    })
    logger.info({ channelId }, 'ADK session created')

    try {
      // A channel whose carried history tripped the safety filter rebuilds its window empty rather than
      // rehydrating the same content straight back. In-memory only — SQLite history is left intact, and
      // the suppression lifts when the session is next destroyed.
      const prior = rehydrationSuppressed.has(channelId)
        ? []
        : loadHistory(channelId, config.session.windowSize, config.session.maxRehydrationAge)
      if (prior.length > 0) {
        for (const msg of prior) {
          const role = msg.role === 'user' ? 'user' : 'model'
          const content: Content = {
            role,
            parts: [
              {
                text: msg.role === 'user' ? `[${msg.displayName}]: ${msg.content}` : msg.content
              }
            ]
          }
          const event = createEvent({
            author: msg.role === 'user' ? 'user' : 'roka',
            invocationId: `rehydrate-${channelId}`,
            content
          })
          await sessionService.appendEvent({ session, event })
        }
        session = (await sessionService.getSession({
          appName: APP_NAME,
          userId: channelId,
          sessionId: channelId
        }))!
        logger.info({ channelId, rehydratedMessages: prior.length }, 'Session rehydrated from SQLite')
      }
    } catch (error) {
      logger.warn({ channelId, error }, 'Failed to rehydrate session from SQLite')
    }
  }

  return session
}

/** Clear the idle timer and delete the ADK session for a channel */
export async function destroySession(channelId: string): Promise<void> {
  const timer = idleTimers.get(channelId)
  if (timer) {
    clearTimeout(timer)
    idleTimers.delete(channelId)
  }

  sessionErrorCounts.delete(channelId)
  rehydrationSuppressed.delete(channelId)

  try {
    await sessionService.deleteSession({
      appName: APP_NAME,
      userId: channelId,
      sessionId: channelId
    })
    logger.info({ channelId }, 'ADK session destroyed')
  } catch (error) {
    logger.debug({ channelId, error }, 'Session already destroyed or never existed')
  }
}

/** Destroy every active ADK session for graceful shutdown */
export async function destroyAllSessions(): Promise<void> {
  beginShutdown()
  for (const controller of activeAbortControllers) controller.abort()

  const channels = [...idleTimers.keys()]
  for (const channelId of channels) {
    await destroySession(channelId)
  }
  logger.info('All ADK sessions destroyed')
}

/** Download one attachment as base64, returning null if it fails or exceeds the ceiling for its type */
async function downloadAttachment(
  attachment: ImageAttachment
): Promise<{ data: string; mimeType: string; tokens: number } | null> {
  const { url, contentType } = attachment
  // Which types are admitted at all is the Discord layer's decision; this only decides how to handle one that
  // already got through. Routing on image/* rather than an allowlist keeps the type sets in one place — the
  // agent layer has no imports from the Discord layer and should not gain one for a constant.
  const isImage = contentType.startsWith('image/')
  const limit = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_DOCUMENT_SIZE_BYTES

  try {
    const response = await fetch(url)
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download attachment')
      return null
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > limit) {
      logger.warn({ url, size: contentLength, limit }, 'Attachment exceeds its size limit, skipping')
      return null
    }

    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > limit) {
      logger.warn({ url, size: buffer.byteLength, limit }, 'Attachment exceeds its size limit, skipping')
      return null
    }

    // A document goes to the model exactly as it arrived. sharp is an image pipeline — handed a PDF it throws,
    // and its catch returns the undecoded bytes labelled image/jpeg, which would misdeclare the whole file.
    if (!isImage) {
      return { data: Buffer.from(buffer).toString('base64'), mimeType: contentType, tokens: 0 }
    }

    const processed = await processImageForGemini(Buffer.from(buffer))
    return { data: processed.data.toString('base64'), mimeType: processed.mimeType, tokens: GEMINI_IMAGE_TOKENS }
  } catch (error) {
    logger.warn({ url, error }, 'Error downloading attachment')
    return null
  }
}

const KNOWN_FALLBACKS = new Set([
  'Hmm? Sorry, I spaced out for a moment there~',
  'Ah, what was that? I got distracted by something.',
  'Ahaha, my mind wandered. Say that again?',
  "I wasn't paying attention... don't tell anyone, okay?"
])

function getRandomFallback(): string {
  const fallbacks = [...KNOWN_FALLBACKS]
  return fallbacks[Math.floor(Math.random() * fallbacks.length)]
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

/** Generate an in-character response using the ADK agent pipeline
 * @param options - Channel ID, user message, display name, and optional image attachments
 * @returns Response text and detected tone
 */
export async function generateResponse(options: GenerateOptions): Promise<GenerateResult> {
  const generateStartMs = performance.now()
  const { channelId, guildId, userMessage, displayName, username, userId, imageAttachments } = options

  const session = await ensureSession(channelId)
  resetIdleTimer(channelId)

  const storedParticipants = (session.state?.participants as string[]) ?? []
  const participants = [...new Set([...storedParticipants, displayName])]

  const fakeMessages = eventsToWindowMessages(session.events ?? [])
  const hour = getLocalHour()
  const tone = detectTone(fakeMessages, hour)

  const basePrompt = assembleSystemPrompt({ tone, participants, hour, displayName })
  let factsSection = ''
  let overheardSection = ''
  let factEntryCount = 0

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
        participantIds: [...channelUsers.keys()]
          .filter((participantId) => participantId !== userId)
          .slice(0, config.memory.recentParticipantLimit),
        message: userMessage
      })
      factEntries = retrieval.entries
      retrievalSelected = retrieval.claims.length
    } else {
      factEntries = []
      for (const [uid, user] of knownUsers) {
        const facts = getFacts(guildId, uid)
        if (facts.length > 0) {
          const label = user.username !== user.displayName ? `${user.username} (${user.displayName})` : user.displayName
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

  const overheard = getBufferMessages(channelId).slice(-config.memory.contextSize)
  const overheardBlock = buildOverheardBlock(overheard)
  if (overheardBlock) {
    overheardSection = `\n\n## Recent Channel Activity (messages you overheard)\n${overheardBlock}`
  }

  const tailSection =
    `\n\n- The current user's Discord ID is "${userId}".` +
    ' remember_user and recall_user target the current user automatically; to recall a different server member, pass their name as user_name.'

  // Safety de-escalation ladder. Each rung strictly removes carried context — never the current message —
  // so Roka answers with less surrounding context rather than refusing outright.
  const SAFETY_LADDER = ['drop_overheard', 'drop_facts', 'clear_history'] as const
  let safetyRung = 0
  let dropImages = false

  function composePrompt(): string {
    const head =
      safetyRung >= 3 ? assembleSystemPrompt({ tone: 'sincere', participants, hour, displayName }) : basePrompt
    return [
      head,
      safetyRung < 2 ? factsSection : '',
      safetyRung < 1 ? overheardSection : '',
      tailSection,
      safetyRung > 0 ? `\n\n${SAFETY_STEER_ADDENDUM}` : ''
    ].join('')
  }

  let systemPrompt = composePrompt()

  logger.debug({ tone, participantCount: participants.length, hour }, 'Prompt assembled')

  const imageParts: Part[] = []
  let imageTokens = 0
  if (imageAttachments?.length) {
    const downloads = await Promise.all(imageAttachments.map((img) => downloadAttachment(img)))
    for (const result of downloads) {
      if (result) {
        imageParts.push({ inlineData: { data: result.data, mimeType: result.mimeType } })
        imageTokens += result.tokens
      }
    }
    if (imageParts.length > 0) {
      logger.debug({ imageCount: imageParts.length, imageTokens }, 'Attached images to request')
    }
  }

  const buildNewMessage = (): Content => ({
    role: 'user',
    parts: dropImages
      ? [{ text: `[${displayName}]: ${userMessage}` }]
      : [...imageParts, { text: `[${displayName}]: ${userMessage}` }]
  })

  logger.debug(
    { model: config.gemini.model, sessionEvents: session.events?.length ?? 0, hasImages: imageParts.length > 0 },
    'Sending ADK request'
  )

  const llmStartMs = performance.now()
  const usedToolNames = new Set<string>()
  const testRunTurn = testRunTurnFactory?.(systemPrompt)
  let sessionWasReset = false
  const steering: { prompt?: string } = {}
  const verdict: ModelVerdict = {}
  const reliability = await toolCallsForRequest.run(usedToolNames, () =>
    modelVerdictForRequest.run(verdict, () =>
      steeringForRequest.run(steering, () =>
        runTurnWithReliability({
          maxRetries: config.gemini.liveMaxRetries,
          retryBackoffCapMs: config.gemini.retryBackoffCapMs,
          requestTimeoutMs: config.gemini.timeout,
          turnDeadlineMs: config.gemini.turnDeadlineMs,
          tryConsumeRetry: () =>
            getSharedRateLimiter(config.rateLimit).tryConsumeAboveFloor(config.gemini.retryRpmFloor),
          // retryBackoffCapMs doubles as computeBackoff's per-attempt maxMs: a single backoff delay
          // should never be advertised as larger than the total budget it is measured against — the
          // remaining-budget clamp in runTurnWithReliability's retry loop would cut an oversized delay down
          // to size anyway, so sharing the value keeps the pre-jitter range honest with the ceiling.
          computeBackoff: (attempt) =>
            computeBackoff(attempt, config.gemini.retryBackoffBaseMs, { maxMs: config.gemini.retryBackoffCapMs }),
          genericFallback: getRandomFallback(),
          safetyDeflection: SAFETY_DEFLECTION,
          recitationDeflection: RECITATION_DEFLECTION,
          terminalDeflection: TERMINAL_DEFLECTION,
          resetSession: async () => {
            await destroySession(channelId)
            await ensureSession(channelId)
            resetIdleTimer(channelId)
            sessionWasReset = true
          },
          safetyLadderLength: SAFETY_LADDER.length,
          escalateSafety: async () => {
            if (safetyRung >= SAFETY_LADDER.length) return undefined
            safetyRung++

            if (safetyRung === 3) {
              // Carried history is the only remaining suspect: rebuild the window empty and drop images.
              dropImages = true
              await destroySession(channelId)
              rehydrationSuppressed.add(channelId)
              await ensureSession(channelId)
              resetIdleTimer(channelId)
              sessionWasReset = true
            }

            systemPrompt = composePrompt()
            steering.prompt = systemPrompt
            return SAFETY_LADDER[safetyRung - 1]
          },
          runTurn: async (attempt, signal) => {
            const includeCurrentTurn = attempt === 0 || sessionWasReset
            const testRequest: TestTurnRequest = {
              newMessage: includeCurrentTurn ? buildNewMessage() : undefined,
              stateDelta: includeCurrentTurn
                ? {
                    _systemPrompt: systemPrompt,
                    participants,
                    _userId: userId,
                    _channelId: channelId,
                    _guildId: guildId,
                    _userMessage: userMessage
                  }
                : undefined
            }
            if (testRunTurn) return testRunTurn(attempt, signal, testRequest)

            let responseText = ''
            let hasFunctionCall = false
            let finishReason: LlmResponse['finishReason']

            const request: Parameters<typeof runner.runAsync>[0] = {
              userId: channelId,
              sessionId: channelId,
              // ADK's runtime only appends when this value is truthy; its type incorrectly requires Content otherwise.
              newMessage: testRequest.newMessage ?? (undefined as unknown as Content),
              runConfig: { maxLlmCalls: config.gemini.maxLlmCalls },
              stateDelta: testRequest.stateDelta
            }

            for await (const event of runner.runAsync(request)) {
              if (signal.aborted) break
              if (event.errorCode) {
                return {
                  errorCode: event.errorCode,
                  errorMessage: event.errorMessage,
                  customMetadata: event.customMetadata,
                  finishReason: event.finishReason,
                  hasText: false,
                  hasFunctionCall: false
                }
              }
              if (isFinalResponse(event) && event.content?.parts) {
                finishReason = event.finishReason
                responseText = event.content.parts
                  .filter((part: Part) => part.text && !part.thought)
                  .map((part: Part) => part.text)
                  .join('')
                  .trim()
                hasFunctionCall = event.content.parts.some((part: Part) => 'functionCall' in part && part.functionCall)
              }
            }

            return { text: responseText, finishReason, hasText: Boolean(responseText), hasFunctionCall }
          }
        })
      )
    )
  )
  const llmMs = Math.round(performance.now() - llmStartMs)

  if (reliability.action === 'destroy') await destroySession(channelId)

  if (reliability.success) {
    sessionErrorCounts.delete(channelId)
  } else if (
    reliability.kind === 'transient_http' ||
    reliability.kind === 'network' ||
    reliability.kind === 'empty_text'
  ) {
    sessionErrorCounts.set(channelId, (sessionErrorCounts.get(channelId) ?? 0) + 1)
  }

  const toolsUsed = [...usedToolNames]
  if (toolsUsed.length > 1) {
    logger.info({ tools: toolsUsed }, 'Tool fallback chain detected')
  }

  if (reliability.success) {
    try {
      saveMessage(channelId, 'user', displayName, userMessage, userId, username)
      saveMessage(channelId, 'assistant', 'Roka', reliability.text)
    } catch (error) {
      logger.warn({ channelId, error }, 'Failed to persist messages to SQLite')
    }
  }

  logger.debug(
    { responseLength: reliability.text.length, attempts: reliability.attempts, failureKind: reliability.kind },
    'ADK response extracted'
  )

  const outcome: ResponseMetrics['outcome'] = reliability.success
    ? 'ok'
    : reliability.kind === 'transient_http' || reliability.kind === 'network' || reliability.kind === 'empty_text'
      ? 'fallback'
      : 'deflection'

  // Failed turns are never written to session_history, so without this row the triggering input is
  // unrecoverable and the failure cannot be explained after the fact.
  if (!reliability.success) {
    recordFailureDiagnostic({
      guildId,
      channelId,
      userId,
      outcome,
      kind: reliability.kind,
      failureMarker: reliability.failureMarker,
      blockSide: verdict.blockSide,
      finishReason: verdict.finishReason,
      safetyRatings: verdict.safetyRatings,
      safetyRungsUsed: safetyRung,
      attempts: reliability.attempts,
      tone,
      imageCount: imageParts.length,
      imageMimes: imageAttachments?.map((img) => img.contentType).join(',') || undefined,
      overheardChars: overheardSection.length,
      historyDepth: session.events?.length ?? 0,
      factEntries: factEntryCount,
      userMessage
    })
  }
  const metrics: ResponseMetrics = {
    generateMs: Math.round(performance.now() - generateStartMs),
    llmMs,
    retryLatencyMs: reliability.retryLatencyMs,
    retries: reliability.attempts - 1,
    outcome,
    kind: reliability.kind,
    failureMarker: reliability.failureMarker,
    tokensInEst:
      estimateTokens(systemPrompt) +
      fakeMessages.reduce(
        (total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`),
        0
      ) +
      toolsTok +
      estimateTokens(`[${displayName}]: ${userMessage}`) +
      imageTokens,
    tokensOutEst: estimateTokens(reliability.text)
  }

  return { text: reliability.text, tone, metrics, toolsUsed }
}
