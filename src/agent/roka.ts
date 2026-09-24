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
import { rokaTools } from './tools/index.js'
import { createTurnContext } from './turnContext.js'
import type { TurnContextOptions } from './turnContext.js'

interface GenerateOptions extends TurnContextOptions {
  imageAttachments?: ImageAttachment[]
}

export interface GenerateResult {
  text: string
  tone: ToneKey
  metrics: ResponseMetrics
  toolsUsed: string[]
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

/**
 * Model calls made by the turn currently running, counted where they happen rather than inferred from what
 * came back. The Discord layer reserves `gemini.maxLlmCalls` slots before the turn and hands back what this
 * says went unused, so the count has to be of REQUESTS — retries and tool round trips included — not of
 * anything the reply looks like afterwards (#167).
 */
const modelCallsForRequest = new AsyncLocalStorage<{ count: number }>()
// Exported so tests can drive the beforeModelCallback ALS seam directly (task 122's only observable proof point)
export const steeringForRequest = new AsyncLocalStorage<{ prompt?: string }>()
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
    // Low media resolution is 100 tokens a second of video rather than 300, and at the 10 MB cap that is
    // what keeps a clip inside the measured 250,000 TPM. Set per request rather than on the agent because
    // mediaResolution is request-level and governs images as well — pinning it globally would quietly
    // re-price and re-render every picture she has ever been able to see, which is not this change.
    if (requestCarriesVideo(request)) {
      request.config = request.config ?? ({} as NonNullable<typeof request.config>)
      request.config!.mediaResolution = MediaResolution.MEDIA_RESOLUTION_LOW
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
  const { channelId, guildId, userMessage, displayName, username, userId, imageAttachments } = options

  const context = await createTurnContext(options)
  const { session, fakeMessages, tone, hour, factEntryCount, overheardSection, safetyLadder, composePrompt } = context
  let safetyRung = 0
  let dropImages = false
  let systemPrompt = context.systemPrompt

  const { imageParts, imageTokens, droppedAttachments, truncatedAttachments, refusedAttachments } =
    await prepareAttachments(channelId, imageAttachments)

  /**
   * Told to the model, not just to the user. Without it the turn looks exactly like an ordinary question
   * about a video, and what follows is not misbehaviour: CORE_PROMPT says to quietly call search_web for a
   * fact she is unsure of, and "what happens in this video" is precisely that when no video is present. So
   * she searches the web for the user's own phrasing and reports the result as the file's contents. Measured
   * 4 of 4 without this line and 0 of 4 with it — the fabrications were real games and real films because
   * they were search results, not inventions.
   *
   * That is why the fix removes the premise rather than adding a prohibition. A rule saying "do not invent"
   * aims at a disobedience that never happened, and it would put behavioural wording on the prompt path and
   * buy the two-green-live-run cost for a sentence that only appears once a download has already failed.
   * It is a statement of fact for the same reason.
   */
  // Both reasons an attachment can be absent, worded apart because they are not the same fact: one never
  // arrived, the other arrived intact and cost more than a turn may spend. A refusal without this line
  // re-creates exactly the condition above — attachment gone, request unchanged, search_web fills the hole.
  //
  // The refusal arm says "together" because the refusal is all-or-nothing: one cheap image beside one
  // 500-page PDF refuses both, and blaming each file individually would tell the sender their 1,089-token
  // picture was too long to read. Pricing per attachment to refuse only the expensive one would cost a
  // round trip each, and each of those round trips re-uploads the file.
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

  // One list rather than a branch per case: the notice was duplicated across both arms, and a mutation
  // deleting it from the dropImages arm alone broke nothing — a second copy nobody could have caught going
  // wrong. The safety ladder drops the images; it has no reason to drop the reason they are missing.
  const buildNewMessage = (): Content => ({
    role: 'user',
    parts: [...(dropImages ? [] : imageParts), ...failedAttachmentNotice, { text: `[${displayName}]: ${userMessage}` }]
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
  const modelCalls = { count: 0 }
  const route = { useFallback: rokaModel.hasFallback && hasStickyFallback() }
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

  // After every attempt, never between them: a retry re-sends the same message, so stripping mid-loop would
  // hand the model a marker where the first attempt had the picture.
  //
  // Not in a finally, deliberately. runTurnWithReliability converts model failures into a fallbackResult
  // rather than throwing, so every ordinary path arrives here — but that is a property of *that* function,
  // not a guarantee of this one, and an unexpected throw from inside it would skip the strip. The cost if
  // that happens is bounded and self-healing: the events stay tracked, the next turn in this channel strips
  // them along with its own, and deleteSession clears them when the idle TTL fires. One extra resend, not a
  // permanent leak. Wrapping the ~100-line reliability expression in a try/finally to close that was judged
  // not worth the diff; if runTurnWithReliability ever gains a throwing path, revisit this.
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
  // Named once and used twice on purpose: this is both what the turn is reported to have cost and what it is
  // charged for, and letting the two be separate expressions is how a budget starts describing something
  // other than the spend it is meant to bound.
  const tokensInEst =
    estimateTokens(systemPrompt) +
    fakeMessages.reduce((total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`), 0) +
    toolsTok +
    estimateTokens(`[${displayName}]: ${userMessage}`) +
    imageTokens

  // Charged after the fact rather than reserved before it, because the cost is only knowable once the
  // reliability ladder has finished — a safety re-rung turn recomposes the system prompt and a retry sends it
  // again, and both are real spend. Admission is the separate, earlier decision made in the Discord handlers.
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
    tokensOutEst: estimateTokens(reliability.text)
  }

  return {
    text: reliability.text,
    tone,
    metrics,
    toolsUsed,
    droppedAttachments,
    truncatedAttachments,
    refusedAttachments,
    modelCalls: modelCalls.count
  }
}
