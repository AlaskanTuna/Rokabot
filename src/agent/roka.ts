/** ADK pipeline orchestrator for in-character response generation */

import { BasePlugin, InMemorySessionService, LlmAgent, Runner, createEvent, isFinalResponse } from '@google/adk'
import type { Event, LlmResponse } from '@google/adk'
import type { GetSessionRequest, Session } from '@google/adk'
import type { Content, Part } from '@google/genai'
import { config } from '../config.js'
import type { WindowMessage } from '../session/types.js'
import { recordMemoryEvent } from '../storage/metricsStore.js'
import type { ResponseMetrics } from '../storage/metricsStore.js'
import { getChannelUsers, loadHistory, saveMessage } from '../storage/sessionStore.js'
import { getFacts, refreshFactTimestamps } from '../storage/userMemory.js'
import { getAllUserNames } from '../storage/userNames.js'
import { processImageForGemini } from '../utils/imageProcessor.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { getLocalHour } from '../utils/timezone.js'
import { estimateTokens } from '../utils/tokens.js'
import { classifyGeminiFailure, computeBackoff } from './geminiReliability.js'
import { retrieveForTurn } from './memory/retriever.js'
import { getMessages as getBufferMessages } from './passiveBuffer.js'
import { assembleSystemPrompt } from './promptAssembler.js'
import { buildFactsEnvelope, buildOverheardBlock } from './promptSafety.js'
import type { ToneKey } from './prompts/tones.js'
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
}

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024
const APP_NAME = 'rokabot'

const sessionErrorCounts = new Map<string, number>()
let toolCallsThisRequest: string[] = []
const activeAbortControllers = new Set<AbortController>()

const SAFETY_DEFLECTION = "Ehh… let's not get into that one~"
const RECITATION_DEFLECTION = "Ah, I don't think I should repeat that one exactly~"
const TERMINAL_DEFLECTION = "Eep, something went wrong on my side. Let's try again later~"
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

export type TestRunTurn = (attempt: number, signal: AbortSignal) => Promise<TurnOutcome>
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
}

export interface RunTurnWithReliabilityOptions {
  runTurn: (attempt: number, signal: AbortSignal) => Promise<TurnOutcome>
  tryConsumeRetry: () => boolean
  computeBackoff: (attempt: number) => number
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>
  isShuttingDown?: () => boolean
  maxRetries: number
  maxLatencyMs: number
  requestTimeoutMs?: number
  genericFallback: string
  safetyDeflection: string
  recitationDeflection: string
  terminalDeflection: string
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

function fallbackResult(
  kind: ReliabilityResult['kind'],
  action: ReliabilityResult['action'],
  attempts: number,
  retryLatencyMs: number,
  options: RunTurnWithReliabilityOptions
): ReliabilityResult {
  const text =
    kind === 'safety'
      ? options.safetyDeflection
      : kind === 'recitation'
        ? options.recitationDeflection
        : kind === 'terminal'
          ? options.terminalDeflection
          : options.genericFallback

  return { text, kind, action, attempts, retryLatencyMs, success: false }
}

/** Runs one user turn with bounded retry policy while keeping the initial user event single-shot. */
export async function runTurnWithReliability(options: RunTurnWithReliabilityOptions): Promise<ReliabilityResult> {
  const shouldStop = options.isShuttingDown ?? isShuttingDown
  const sleep = options.sleep ?? sleepUntil
  let retryLatencyMs = 0
  let lastKind: ReliabilityResult['kind'] = 'network'

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (shouldStop()) return fallbackResult(lastKind, 'preserve', attempt, retryLatencyMs, options)

    const abortController = new AbortController()
    activeAbortControllers.add(abortController)
    const timeoutId = options.requestTimeoutMs
      ? setTimeout(() => abortController.abort(), options.requestTimeoutMs)
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

    if (outcome.sessionMissing) return fallbackResult('network', 'preserve', attempt + 1, retryLatencyMs, options)
    if (shouldStop() || abortController.signal.aborted)
      return fallbackResult(lastKind, 'preserve', attempt + 1, retryLatencyMs, options)

    const failure = classifyGeminiFailure(outcome)
    lastKind = failure.kind
    if (failure.kind === 'ok' && outcome.text) {
      return {
        text: outcome.text,
        kind: 'ok',
        action: 'preserve',
        attempts: attempt + 1,
        retryLatencyMs,
        success: true
      }
    }

    if (!failure.retryable)
      return fallbackResult(
        failure.kind,
        failure.kind === 'terminal' ? 'destroy' : 'preserve',
        attempt + 1,
        retryLatencyMs,
        options
      )

    const retryLimit = failure.kind === 'recitation' ? Math.min(options.maxRetries, 1) : options.maxRetries
    if (attempt >= retryLimit || shouldStop()) {
      return fallbackResult(failure.kind, 'preserve', attempt + 1, retryLatencyMs, options)
    }

    const delayMs = Math.min(options.computeBackoff(attempt), Math.max(0, options.maxLatencyMs - retryLatencyMs))
    if (delayMs <= 0 && retryLatencyMs >= options.maxLatencyMs) {
      return fallbackResult(failure.kind, 'preserve', attempt + 1, retryLatencyMs, options)
    }
    if (!options.tryConsumeRetry())
      return fallbackResult(failure.kind, 'preserve', attempt + 1, retryLatencyMs, options)

    await sleep(delayMs, abortController.signal)
    retryLatencyMs += delayMs
    if (shouldStop() || abortController.signal.aborted)
      return fallbackResult(failure.kind, 'preserve', attempt + 1, retryLatencyMs, options)
  }

  return fallbackResult(lastKind, 'preserve', options.maxRetries + 1, retryLatencyMs, options)
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

const rokaAgent = new LlmAgent({
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
    httpOptions: { timeout: config.gemini.timeout }
  },
  beforeModelCallback: async ({ context, request }) => {
    const prompt = context.state.get<string>('_systemPrompt')
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
    toolCallsThisRequest.push(tool.name)
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
      const prior = loadHistory(channelId, config.session.windowSize, config.session.maxRehydrationAge)
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

/** Download an image as base64, returning null if it fails or exceeds 4 MB */
async function downloadImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      logger.warn({ url, status: response.status }, 'Failed to download image')
      return null
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      logger.warn({ url, size: contentLength }, 'Image exceeds 4 MB size limit, skipping')
      return null
    }

    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      logger.warn({ url, size: buffer.byteLength }, 'Image exceeds 4 MB size limit, skipping')
      return null
    }

    const rawBuffer = Buffer.from(buffer)
    const processed = await processImageForGemini(rawBuffer)
    const base64 = processed.data.toString('base64')
    return { data: base64, mimeType: processed.mimeType }
  } catch (error) {
    logger.warn({ url, error }, 'Error downloading image')
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

  toolCallsThisRequest = []

  const session = await ensureSession(channelId)
  resetIdleTimer(channelId)

  const storedParticipants = (session.state?.participants as string[]) ?? []
  const participants = [...new Set([...storedParticipants, displayName])]

  const fakeMessages = eventsToWindowMessages(session.events ?? [])
  const hour = getLocalHour()
  const tone = detectTone(fakeMessages, hour)

  let systemPrompt = assembleSystemPrompt({ tone, participants, hour, displayName })

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
      systemPrompt += `\n\n## What You Remember About People In This Channel\n${factsEnvelope}`
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
    systemPrompt += `\n\n## Recent Channel Activity (messages you overheard)\n${overheardBlock}`
  }

  systemPrompt +=
    `\n\n- The current user's Discord ID is "${userId}".` +
    ' Use this ID (not their name) when calling remember_user or recall_user tools.'

  logger.debug({ tone, participantCount: participants.length, hour }, 'Prompt assembled')

  const imageParts: Part[] = []
  if (imageAttachments?.length) {
    const downloads = await Promise.all(imageAttachments.map((img) => downloadImage(img.url)))
    for (const result of downloads) {
      if (result) {
        imageParts.push({ inlineData: { data: result.data, mimeType: result.mimeType } })
      }
    }
    if (imageParts.length > 0) {
      logger.debug({ imageCount: imageParts.length }, 'Attached images to request')
    }
  }

  const newMessage: Content = {
    role: 'user',
    parts: [...imageParts, { text: `[${displayName}]: ${userMessage}` }]
  }

  logger.debug(
    { model: config.gemini.model, sessionEvents: session.events?.length ?? 0, hasImages: imageParts.length > 0 },
    'Sending ADK request'
  )

  const llmStartMs = performance.now()
  const reliability = await runTurnWithReliability({
    maxRetries: config.gemini.liveMaxRetries,
    maxLatencyMs: config.gemini.retryBackoffCapMs,
    requestTimeoutMs: config.gemini.timeout,
    tryConsumeRetry: () => getSharedRateLimiter(config.rateLimit).tryConsumeAboveFloor(config.gemini.retryRpmFloor),
    computeBackoff: (attempt) =>
      computeBackoff(attempt, config.gemini.retryBackoffBaseMs, { maxMs: config.gemini.retryBackoffCapMs }),
    genericFallback: getRandomFallback(),
    safetyDeflection: SAFETY_DEFLECTION,
    recitationDeflection: RECITATION_DEFLECTION,
    terminalDeflection: TERMINAL_DEFLECTION,
    runTurn:
      testRunTurnFactory?.(systemPrompt) ??
      (async (attempt, signal) => {
        let responseText = ''
        let hasFunctionCall = false
        let finishReason: LlmResponse['finishReason']

        const request: Parameters<typeof runner.runAsync>[0] = {
          userId: channelId,
          sessionId: channelId,
          // ADK's runtime only appends when this value is truthy; its type incorrectly requires it for a retry.
          newMessage: attempt === 0 ? newMessage : (undefined as unknown as Content),
          runConfig: { maxLlmCalls: config.gemini.maxLlmCalls },
          stateDelta:
            attempt === 0
              ? {
                  _systemPrompt: systemPrompt,
                  participants,
                  _userId: userId,
                  _channelId: channelId,
                  _guildId: guildId
                }
              : undefined
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
      })
  })
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

  if (toolCallsThisRequest.length > 1) {
    logger.info({ tools: toolCallsThisRequest }, 'Tool fallback chain detected')
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
  const metrics: ResponseMetrics = {
    generateMs: Math.round(performance.now() - generateStartMs),
    llmMs,
    retryLatencyMs: reliability.retryLatencyMs,
    retries: reliability.attempts - 1,
    outcome,
    kind: reliability.kind,
    tokensInEst:
      estimateTokens(systemPrompt) +
      fakeMessages.reduce(
        (total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`),
        0
      ) +
      toolsTok +
      estimateTokens(`[${displayName}]: ${userMessage}`),
    tokensOutEst: estimateTokens(reliability.text)
  }

  return { text: reliability.text, tone, metrics }
}
