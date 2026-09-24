/** ADK pipeline orchestrator for in-character response generation */

import { AsyncLocalStorage } from 'node:async_hooks'
import { LlmAgent, Runner, isFinalResponse } from '@google/adk'
import type { LlmResponse } from '@google/adk'
import { MediaResolution } from '@google/genai'
import type { Content, Part } from '@google/genai'
import { config } from '../config.js'
import { recordFailureDiagnostic } from '../storage/metricsStore.js'
import type { ResponseMetrics } from '../storage/metricsStore.js'
import { saveMessage } from '../storage/sessionStore.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { estimateTokens } from '../utils/tokens.js'
import { prepareAttachments } from './attachments.js'
import type { ImageAttachment } from './attachments.js'
import type { ModelRoute } from './fallbackModel.js'
import { modelRouteForRequest } from './fallbackModel.js'
import { computeBackoff } from './geminiReliability.js'
import type { ToneKey } from './prompts/tones.js'
import {
  ErrorRecoveryPlugin,
  abortActiveTurns,
  hasStickyFallback,
  modelNameForCurrentRequest,
  modelVerdictForRequest,
  rokaModel,
  runTurnWithReliability,
  setFallbackUntilMs
} from './reliability.js'
import type { ModelVerdict, TurnOutcome } from './reliability.js'
import { SAFETY_SETTINGS } from './safetySettings.js'
import { PREFETCH_TOOL_NAME } from './searchPrefetch.js'
import {
  APP_NAME,
  clearSessionErrorCount,
  destroySession,
  ensureSession,
  incrementSessionErrorCount,
  resetIdleTimer,
  sessionService,
  suppressSessionRehydration
} from './session.js'
import { chargeTokens } from './tokenBudget.js'
import { MEMORY_TOOL_NAMES, rokaTools } from './tools/index.js'
import { createTurnContext, startTurnEntryWork } from './turnContext.js'
import type { TurnContextOptions, TurnEntryWork } from './turnContext.js'

interface GenerateOptions extends TurnContextOptions {
  turnEntryWork?: TurnEntryWork
  imageAttachments?: ImageAttachment[]
}

export interface GenerateResult {
  text: string
  tone: ToneKey
  metrics: ResponseMetrics
  toolsUsed: string[]
  prefetchUsed: boolean
  needsLookup: number | null
  /**
   * Attachments that were admitted by type but never reached the model — oversized, or the download failed.
   * The Discord layer counts only *unsupported types* on its own side, so without this an oversized file is
   * dropped in total silence and she answers as though nothing were attached, which reads as her ignoring it.
   */
  droppedAttachments: number
  /**
   * Attachments refused because their measured token cost was past `gemini.maxAttachmentTokens`. Distinct
   * from dropped: these arrived intact and were readable, they were simply too expensive to spend a turn on.
   */
  refusedAttachments: number
  /**
   * Attachments sent as a prefix because the whole file was past its ceiling. She saw a real part of it, so
   * this is not a failure — but answering as though she had the whole thing would be a quiet lie about a
   * five-minute clip she heard ninety seconds of.
   */
  truncatedAttachments: number
  /**
   * Model calls this turn actually issued. The Discord layer reserved `gemini.maxLlmCalls` for it and gives
   * back the difference — a turn that used one of four returns three slots to the minute rather than holding
   * them for a peak it never reached (#167).
   */
  modelCalls: number
}

const toolCallsForRequest = new AsyncLocalStorage<Set<string>>()

// Count every ADK request so retries and tool calls are included in the reservation refund.
const modelCallsForRequest = new AsyncLocalStorage<{ count: number }>()
// Exported so tests can drive the beforeModelCallback ALS seam directly (task 122's only observable proof point)
export const steeringForRequest = new AsyncLocalStorage<{ prompt?: string; memory?: boolean }>()
const SAFETY_DEFLECTION = "Ehh… let's not get into that one~"
const RECITATION_DEFLECTION = "Ah, I don't think I should repeat that one exactly~"
const TERMINAL_DEFLECTION = "Eep, something went wrong on my side. Let's try again later~"
const toolsTok = estimateTokens(JSON.stringify(rokaTools))

interface TestTurnRequest {
  newMessage?: Content
  stateDelta?: {
    _systemPrompt: string
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

/** Does this request carry video? Only then is media resolution worth pinning, since the setting is
 * request-wide and would otherwise change how images are read too. */
function requestCarriesVideo(request: { contents?: Content[] }): boolean {
  return (request.contents ?? []).some((content) =>
    (content.parts ?? []).some((part) => part.inlineData?.mimeType?.startsWith('video/'))
  )
}
// Exported so tests can assert the agent-level config and beforeModelCallback seam directly
export const rokaAgent = new LlmAgent({
  name: 'roka',
  model: rokaModel,
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
    // The one place that sees every call the turn makes. ADK issues these internally, so nothing downstream
    // could count them and nothing upstream knows how many a turn will need.
    const calls = modelCallsForRequest.getStore()
    if (calls) calls.count += 1

    const prompt = steeringForRequest.getStore()?.prompt ?? context.state.get<string>('_systemPrompt')
    if (prompt) {
      request.config = request.config ?? ({} as NonNullable<typeof request.config>)
      request.config!.systemInstruction = prompt
    }
    // Pin low resolution only for video requests to stay within measured cost without changing image processing.
    if (requestCarriesVideo(request)) {
      request.config = request.config ?? ({} as NonNullable<typeof request.config>)
      request.config!.mediaResolution = MediaResolution.MEDIA_RESOLUTION_LOW
    }
    // A `/ask` request must not advertise the memory tools. Both halves go: the function declarations are
    // what the model reads, but toolsDict is what ADK resolves a call against, so a declaration removed on
    // its own would leave the model able to name a tool with nothing behind it (#207).
    if (steeringForRequest.getStore()?.memory === false) {
      for (const declaration of request.config?.tools ?? []) {
        // `ToolUnion` is `Tool | CallableTool`; only `Tool` carries declarations, and only
        // `CallableTool` has `tool()`, which is what tells them apart.
        if (typeof (declaration as { tool?: unknown }).tool === 'function') continue
        const tool = declaration as { functionDeclarations?: Array<{ name?: string }> }
        if (!tool.functionDeclarations) continue
        tool.functionDeclarations = tool.functionDeclarations.filter(
          ({ name }) => !MEMORY_TOOL_NAMES.includes(name ?? '')
        )
      }
      for (const name of MEMORY_TOOL_NAMES) delete request.toolsDict[name]
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
          model: modelNameForCurrentRequest(),
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

const runner = new Runner({
  appName: APP_NAME,
  agent: rokaAgent,
  sessionService,
  plugins: [new ErrorRecoveryPlugin('error-recovery')]
})

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

/** Generate an in-character response using the ADK agent pipeline
 * @param options - Channel ID, user message, display name, and optional image attachments
 * @returns Response text and detected tone
 */
export async function generateResponse(options: GenerateOptions): Promise<GenerateResult> {
  const generateStartMs = performance.now()
  const { channelId, guildId, userMessage, displayName, username, userId, memory, imageAttachments } = options

  const turnEntryWork =
    options.turnEntryWork ??
    startTurnEntryWork({
      channelId,
      guildId,
      userId,
      speakerName: displayName,
      message: userMessage,
      mentionedUserIds: options.mentionedUserIds
    })
  const context = await createTurnContext({ ...options, turnEntryWork })
  const {
    session,
    fakeMessages,
    tone,
    hour,
    factEntryCount,
    overheardSection,
    prefetchUsed,
    safetyLadder,
    composePrompt
  } = context
  let safetyRung = 0
  let dropImages = false
  let systemPrompt = context.systemPrompt

  const { imageParts, imageTokens, droppedAttachments, truncatedAttachments, refusedAttachments } =
    await prepareAttachments(channelId, imageAttachments)

  // Tell the model when files are absent or refused so it does not search for their missing contents.
  const failedAttachmentNotice = [
    ...(droppedAttachments > 0
      ? [{ text: `[${droppedAttachments} file(s) were shared with this message but could not be retrieved.]` }]
      : []),
    ...(refusedAttachments > 0
      ? [
          {
            text: `[${refusedAttachments} file(s) were shared with this message; together they are too long to read in one turn, so none of them were opened.]`
          }
        ]
      : [])
  ]

  // Keep attachment notices in both ordinary and safety-rebuilt turns.
  const buildNewMessage = (): Content => ({
    role: 'user',
    parts: [...(dropImages ? [] : imageParts), ...failedAttachmentNotice, { text: `[${displayName}]: ${userMessage}` }]
  })

  logger.debug(
    { model: config.gemini.model, sessionEvents: session.events?.length ?? 0, hasImages: imageParts.length > 0 },
    'Sending ADK request'
  )

  const llmStartMs = performance.now()
  const usedToolNames = new Set<string>(prefetchUsed ? [PREFETCH_TOOL_NAME] : [])
  const testRunTurn = testRunTurnFactory?.(systemPrompt)
  let sessionWasReset = false
  const steering: { prompt?: string; memory?: boolean } = { memory }
  const verdict: ModelVerdict = {}
  const modelCalls = { count: 0 }
  const route: ModelRoute = {
    useFallback: rokaModel.hasFallback && hasStickyFallback(),
    hedged: false,
    answeredBy: null
  }
  let movedAwayFromGemini = false
  const reliability = await modelRouteForRequest.run(route, () =>
    modelCallsForRequest.run(modelCalls, () =>
      toolCallsForRequest.run(usedToolNames, () =>
        modelVerdictForRequest.run(verdict, () =>
          steeringForRequest.run(steering, () =>
            runTurnWithReliability({
              maxRetries: config.gemini.liveMaxRetries,
              retryBackoffCapMs: config.gemini.retryBackoffCapMs,
              requestTimeoutMs: route.useFallback ? config.fallback.timeoutMs : config.gemini.timeout,
              turnDeadlineMs: config.gemini.turnDeadlineMs,
              switchModel: (kind) => {
                if (!rokaModel.hasFallback) return undefined

                route.useFallback = !route.useFallback
                if (route.useFallback) {
                  movedAwayFromGemini = true
                  logger.warn(
                    { channelId, kind, model: rokaModel.fallbackModelName },
                    'Gemini unavailable, answering this turn with the fallback model'
                  )
                  return config.fallback.timeoutMs
                }

                return config.gemini.timeout
              },
              tryConsumeRetry: () =>
                getSharedRateLimiter(config.rateLimit).tryConsumeAboveFloor(config.gemini.retryRpmFloor),
              // Bound each advertised backoff by the configured total retry ceiling.
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
              safetyLadderLength: safetyLadder.length,
              escalateSafety: async () => {
                if (safetyRung >= safetyLadder.length) return undefined
                safetyRung++

                if (safetyRung === 3) {
                  // Carried history is the only remaining suspect: rebuild the window empty and drop images.
                  dropImages = true
                  await destroySession(channelId)
                  suppressSessionRehydration(channelId)
                  await ensureSession(channelId)
                  resetIdleTimer(channelId)
                  sessionWasReset = true
                }

                systemPrompt = composePrompt(safetyRung)
                steering.prompt = systemPrompt
                return safetyLadder[safetyRung - 1]
              },
              runTurn: async (attempt, signal) => {
                const includeCurrentTurn = attempt === 0 || sessionWasReset
                const testRequest: TestTurnRequest = {
                  newMessage: includeCurrentTurn ? buildNewMessage() : undefined,
                  stateDelta: includeCurrentTurn
                    ? {
                        _systemPrompt: systemPrompt,
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
                    hasFunctionCall = event.content.parts.some(
                      (part: Part) => 'functionCall' in part && part.functionCall
                    )
                  }
                }

                return { text: responseText, finishReason, hasText: Boolean(responseText), hasFunctionCall }
              }
            })
          )
        )
      )
    )
  )
  const llmMs = Math.round(performance.now() - llmStartMs)

  if (reliability.success) {
    if (route.useFallback) {
      logger.info(
        { channelId, model: rokaModel.fallbackModelName, attempts: reliability.attempts },
        'Fallback model answered'
      )
      if (movedAwayFromGemini) {
        setFallbackUntilMs(config.fallback.stickyMs > 0 ? Date.now() + config.fallback.stickyMs : 0)
      }
    } else {
      setFallbackUntilMs(0)
    }
  }

  // Strip after retries so they resend the original bytes; a missed strip is cleaned up on the next turn or TTL.
  const strippedParts = sessionService.stripAttachmentBytes(channelId)
  if (strippedParts > 0) logger.debug({ channelId, strippedParts }, 'Attachment bytes stripped from history')

  if (reliability.action === 'destroy') await destroySession(channelId)

  if (reliability.success) {
    clearSessionErrorCount(channelId)
  } else if (
    reliability.kind === 'transient_http' ||
    reliability.kind === 'network' ||
    reliability.kind === 'empty_text'
  ) {
    incrementSessionErrorCount(channelId)
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
  // Reuse one estimate for both reported and charged token cost.
  const tokensInEst =
    estimateTokens(systemPrompt) +
    fakeMessages.reduce((total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`), 0) +
    toolsTok +
    estimateTokens(`[${displayName}]: ${userMessage}`) +
    imageTokens

  // Charge after the reliability ladder so retries and rebuilt prompts are included in actual spend.
  chargeTokens(tokensInEst)

  const metrics: ResponseMetrics = {
    generateMs: Math.round(performance.now() - generateStartMs),
    llmMs,
    retryLatencyMs: reliability.retryLatencyMs,
    retries: reliability.attempts - 1,
    outcome,
    kind: reliability.kind,
    failureMarker: reliability.failureMarker,
    tokensInEst,
    tokensOutEst: estimateTokens(reliability.text),
    model: route.answeredBy ?? undefined,
    hedged: route.hedged ? 1 : 0
  }

  return {
    text: reliability.text,
    tone,
    metrics,
    toolsUsed,
    prefetchUsed,
    needsLookup: turnEntryWork.needsLookup ?? null,
    droppedAttachments,
    truncatedAttachments,
    refusedAttachments,
    modelCalls: modelCalls.count
  }
}
