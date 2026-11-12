/** ADK pipeline orchestrator for in-character response generation */

import { AsyncLocalStorage } from 'node:async_hooks'
import { LlmAgent, Runner, isFinalResponse } from '@google/adk'
import type { LlmResponse } from '@google/adk'
import { MediaResolution } from '@google/genai'
import type { Content, Part } from '@google/genai'
import { character } from '../character/index.js'
import { config } from '../config.js'
import { recordFailureDiagnostic } from '../storage/metricsStore.js'
import type { ResponseMetrics } from '../storage/metricsStore.js'
import { saveMessage } from '../storage/sessionStore.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { estimateTokens } from '../utils/tokens.js'
import type { ModelRoute } from './llm/fallbackModel.js'
import { modelRouteForRequest } from './llm/fallbackModel.js'
import { computeBackoff } from './llm/geminiReliability.js'
import type { FailureKind } from './llm/geminiReliability.js'
import { historyEndedOnToolResult } from './llm/replyDiagnostic.js'
import type { ReplyDiagnostic } from './llm/replyDiagnostic.js'
import { SAFETY_SETTINGS } from './llm/safetySettings.js'
import { chargeTokens } from './llm/tokenBudget.js'
import type { MediaAttachment } from './media/attachments.js'
import { prepareTurnMedia } from './media/turnMedia.js'
import type { WatchOutcome } from './media/types.js'
import type { MemoryScope } from './memory/memoryScope.js'
import { resolveMemoryScope } from './memory/memoryScope.js'
import { stripNarratedToolCalls } from './narratedToolCalls.js'
import type { ToneKey } from './prompts/tones.js'
import {
  ErrorRecoveryPlugin,
  STICKY_KINDS,
  abortActiveTurns,
  hasStickyFallback,
  modelNameForCurrentRequest,
  modelVerdictForRequest,
  rokaModel,
  runTurnWithReliability,
  setFallbackUntilMs
} from './reliability.js'
import type { ModelVerdict, TurnOutcome } from './reliability.js'
import { MAX_REPLY_BLOCKS, capReplyBlocks } from './replyBlocks.js'
import { enforceReplyFormat, formatKinds } from './replyFormat.js'
import type { FormatEnforcement, FormatRequest, FormatTunables } from './replyFormat.js'
import { PREFETCH_TOOL_NAME } from './searchPrefetch.js'
import {
  APP_NAME,
  RETRY_OF_STORED_TURN,
  clearSessionErrorCount,
  destroySession,
  ensureSession,
  incrementSessionErrorCount,
  resetIdleTimer,
  sessionService,
  suppressSessionRehydration
} from './session.js'
import { readRepliesTool, rokaTools, withheldMemoryToolNames } from './tools/index.js'
import { withSearchAttempt } from './tools/search/attemptBudget.js'
import { ROKA_TOOL_NAMES } from './tools/toolNames.js'
import { createTurnContext, startTurnEntryWork } from './turnContext.js'
import type { TurnContextOptions, TurnEntryWork } from './turnContext.js'

interface GenerateOptions extends Omit<TurnContextOptions, 'memoryScope'> {
  /** The Discord-facing input: `/ask` passes `false`. */
  memory: boolean
  turnEntryWork?: TurnEntryWork
  mediaAttachments?: MediaAttachment[]
  skippedAttachments?: number
  /** The Discord message that triggered the turn, recorded with any media remembered from it. */
  messageId?: string
  /** `false` withholds read_replies: the speaker's own words did not ask about a post's replies. */
  asksAboutReplies?: boolean
}

export interface GenerateResult {
  text: string
  tone: ToneKey
  metrics: ResponseMetrics
  toolsUsed: string[]
  prefetchUsed: boolean
  geminiCalledSearch: boolean
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
  /** How much of the turn's first audio or video she actually watched, for the reply footer. */
  watchOutcome: WatchOutcome | null
  /**
   * Model calls this turn actually issued. The Discord layer reserved `gemini.maxLlmCalls` for it and gives
   * back the difference — a turn that used one of four returns three slots to the minute rather than holding
   * them for a peak it never reached (#167).
   */
  modelCalls: number
}

const toolCallsForRequest = new AsyncLocalStorage<{
  usedToolNames: Set<string>
  geminiToolNames: Set<string>
}>()

// Count every ADK request so retries and tool calls are included in the reservation refund.
const modelCallsForRequest = new AsyncLocalStorage<{ count: number }>()
const requestHistoryForRequest = new AsyncLocalStorage<{ historyEndedOnToolResult: boolean }>()
export interface FormatSteering {
  request: FormatRequest
  mode: 'shadow' | 'on'
  repair: 'off' | 'reformat'
  tunables: FormatTunables
}

export type FormatSuppressed = 'edge' | 'safety'

// Exported so tests can drive the beforeModelCallback ALS seam directly (task 122's only observable proof point)
export const steeringForRequest = new AsyncLocalStorage<{
  prompt?: string
  memoryScope?: MemoryScope
  replies?: boolean
  format?: FormatSteering | null
  formatResult?: FormatEnforcement
}>()
export const SAFETY_DEFLECTION = character.lines.reliability.safety
export const RECITATION_DEFLECTION = character.lines.reliability.recitation
export const TERMINAL_DEFLECTION = character.lines.reliability.terminal
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
    (content.parts ?? []).some((part) => (part.inlineData?.mimeType ?? part.fileData?.mimeType)?.startsWith('video/'))
  )
}
// Exported so tests can assert the agent-level config and beforeModelCallback seam directly
// Strip per-line leading whitespace from prose — 4+ spaces or a tab makes Discord render the line as an
// indented code block — but not inside a fenced code block, where the indentation is the code.
function stripProseIndentation(text: string): string {
  return text
    .split(/(```[^\n`]*\n[\s\S]*?```)/)
    .map((piece, index) => (index % 2 === 1 ? piece : piece.replace(/^[ \t]+/gm, '')))
    .join('')
}

export const rokaAgent = new LlmAgent({
  name: 'roka',
  model: rokaModel,
  instruction: '',
  tools: [...rokaTools],
  disallowTransferToParent: true,
  disallowTransferToPeers: true,
  generateContentConfig: {
    temperature: character.model.temperature,
    topP: character.model.topP,
    maxOutputTokens: config.gemini.maxOutputTokens,
    safetySettings: SAFETY_SETTINGS,
    httpOptions: { timeout: config.gemini.timeout }
  },
  beforeModelCallback: async ({ context, request }) => {
    // The one place that sees every call the turn makes. ADK issues these internally, so nothing downstream
    // could count them and nothing upstream knows how many a turn will need.
    const calls = modelCallsForRequest.getStore()
    if (calls) calls.count += 1
    const requestHistory = requestHistoryForRequest.getStore()
    if (requestHistory) requestHistory.historyEndedOnToolResult = historyEndedOnToolResult(request.contents)

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
    // A `/ask` request must not advertise the memory tools, nor any turn read_replies unless the speaker asked
    // about replies. Both halves go: the function declarations are what the model reads, but toolsDict is what
    // ADK resolves a call against, so a declaration removed on its own would leave the model able to name a tool
    // with nothing behind it (#207).
    const steering = steeringForRequest.getStore()
    // No store outside a steered request reads as a full turn; the turn itself always sets `memoryScope`.
    const scope: MemoryScope = steering?.memoryScope ?? resolveMemoryScope(true, config.memory.privacy)
    const withheld = [...withheldMemoryToolNames(scope), ...(steering?.replies === false ? [readRepliesTool.name] : [])]
    if (withheld.length > 0) {
      for (const declaration of request.config?.tools ?? []) {
        // `ToolUnion` is `Tool | CallableTool`; only `Tool` carries declarations, and only
        // `CallableTool` has `tool()`, which is what tells them apart.
        if (typeof (declaration as { tool?: unknown }).tool === 'function') continue
        const tool = declaration as { functionDeclarations?: Array<{ name?: string }> }
        if (!tool.functionDeclarations) continue
        tool.functionDeclarations = tool.functionDeclarations.filter(({ name }) => !withheld.includes(name ?? ''))
      }
      for (const name of withheld) delete request.toolsDict[name]
    }
    return undefined
  },
  afterModelCallback: async ({ response }) => {
    if (!response.content?.parts) return undefined

    for (const part of response.content.parts) {
      if (part.text && !part.thought) {
        // Cleaned here rather than at send time so the narrated call never reaches session history, where
        // the next turn copies it.
        const narrated = stripNarratedToolCalls(part.text, ROKA_TOOL_NAMES)
        if (narrated.stripped > 0) {
          logger.warn(
            { model: modelNameForCurrentRequest(), stripped: narrated.stripped },
            'Stripped tool calls the model wrote as text'
          )
        }
        const capped = capReplyBlocks(stripProseIndentation(narrated.text.replace(character.nameTag, '')).trim())
        if (capped.merged > 0) {
          logger.info(
            { model: modelNameForCurrentRequest(), merged: capped.merged, blocks: capped.blocks },
            'Joined reply paragraphs past the block cap'
          )
        }
        if (capped.blocks > MAX_REPLY_BLOCKS) {
          logger.warn({ model: modelNameForCurrentRequest(), blocks: capped.blocks }, 'Reply is over the block cap')
        }
        part.text = capped.text
      }
    }

    const hasText = response.content.parts.some((p) => p.text?.trim() && !p.thought)
    const hasFunctionCall = response.content.parts.some((p) => 'functionCall' in p && p.functionCall)

    const steering = steeringForRequest.getStore()
    if (steering?.format && hasText && !hasFunctionCall) {
      const textParts = response.content.parts.filter((p) => p.text?.trim() && !p.thought)
      if (textParts.length === 1) {
        const part = textParts[0]
        const { request, mode, repair, tunables } = steering.format
        const result = enforceReplyFormat(part.text ?? '', request, {
          ...tunables,
          repair: mode === 'shadow' ? 'off' : repair
        })
        if (mode === 'on') part.text = result.text
        steering.formatResult = result
        logger.info(
          {
            model: modelNameForCurrentRequest(),
            kinds: formatKinds(request),
            outcome: result.outcome,
            repair: result.repair,
            first: result.first,
            final: result.final,
            mode
          },
          'Reply format check'
        )
      }
    }

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
    const toolCalls = toolCallsForRequest.getStore()
    toolCalls?.usedToolNames.add(tool.name)
    if (!modelRouteForRequest.getStore()?.useFallback) toolCalls?.geminiToolNames.add(tool.name)
    return undefined
  }
})

const runner = new Runner({
  appName: APP_NAME,
  agent: rokaAgent,
  sessionService,
  plugins: [new ErrorRecoveryPlugin('error-recovery')]
})

export const KNOWN_FALLBACKS = character.lines.reliability.empty

function getRandomFallback(): string {
  return KNOWN_FALLBACKS[Math.floor(Math.random() * KNOWN_FALLBACKS.length)]
}

function requestTimeoutFor(useFallback: boolean): number {
  return useFallback && config.llm.fallback ? config.llm.fallback.timeoutMs : config.llm.main.timeoutMs
}

interface TurnAttemptInit {
  systemPrompt: string
  channelId: string
  memoryScope: MemoryScope
  asksAboutReplies?: boolean
  useFallback: boolean
  safetyLadder: readonly string[]
  composePrompt: (safetyRung: number) => string
  format?: { request: FormatRequest; suppressed: 'edge' | null } | null
}

/** Per-turn mutable state threaded through the reliability loop. One home for what attempt N sends, so a
 * retry, a fallback switch and a session reset all read and write the same object at the same points. */
class TurnAttempt {
  safetyRung = 0
  dropMedia = false
  systemPrompt: string
  sessionWasReset = false
  movedAwayFromGemini = false
  switchKind: FailureKind | undefined = undefined
  emptyReplyDiagnostic: ReplyDiagnostic | undefined = undefined
  formatSuppressed: FormatSuppressed | null
  readonly steering: {
    prompt?: string
    memoryScope?: MemoryScope
    replies?: boolean
    format?: FormatSteering | null
    formatResult?: FormatEnforcement
  }
  readonly route: ModelRoute

  private readonly channelId: string
  private readonly safetyLadder: readonly string[]
  private readonly composePrompt: (safetyRung: number) => string
  private readonly formatRequest: FormatRequest | null

  constructor(init: TurnAttemptInit) {
    this.systemPrompt = init.systemPrompt
    this.channelId = init.channelId
    this.safetyLadder = init.safetyLadder
    this.composePrompt = init.composePrompt
    this.formatRequest = init.format?.request ?? null
    this.formatSuppressed = init.format?.suppressed ?? null
    const formatSteering: FormatSteering | null =
      this.formatRequest && this.formatSuppressed === null && config.format.mode !== 'off'
        ? {
            request: this.formatRequest,
            mode: config.format.mode,
            repair: config.format.repair,
            tunables: {
              minListItems: config.format.minListItems,
              minListShare: config.format.minListShare,
              wordSlack: config.format.wordSlack
            }
          }
        : null
    this.steering = { memoryScope: init.memoryScope, replies: init.asksAboutReplies, format: formatSteering }
    this.route = { useFallback: init.useFallback, hedged: false, answeredBy: null, pinned: null }
  }

  /** Retries resend the stored turn; only the first attempt and a reset session carry the current one. */
  shouldIncludeCurrentTurn(attempt: number): boolean {
    return attempt === 0 || this.sessionWasReset
  }

  async resetSession(): Promise<void> {
    await destroySession(this.channelId)
    await ensureSession(this.channelId)
    resetIdleTimer(this.channelId)
    this.sessionWasReset = true
  }

  noteEmptyReply(diagnostic: ReplyDiagnostic): void {
    this.emptyReplyDiagnostic = diagnostic
  }

  async escalateSafety(): Promise<string | undefined> {
    if (this.safetyRung >= this.safetyLadder.length) return undefined
    this.safetyRung++

    if (this.safetyRung === 3) {
      // Carried history is the only remaining suspect: rebuild the window empty and drop images.
      this.dropMedia = true
      await destroySession(this.channelId)
      suppressSessionRehydration(this.channelId)
      await ensureSession(this.channelId)
      resetIdleTimer(this.channelId)
      this.sessionWasReset = true
    }

    this.systemPrompt = this.composePrompt(this.safetyRung)
    this.steering.prompt = this.systemPrompt
    this.steering.format = null
    this.steering.formatResult = undefined
    if (this.formatRequest !== null && this.formatSuppressed === null) {
      this.formatSuppressed = 'safety'
    }
    return this.safetyLadder[this.safetyRung - 1]
  }

  /** Moves the rest of the turn to the other model after an outage-shaped failure. Returns that model's
   * per-request timeout, or undefined when there is nothing to switch to.
   */
  switchModel(kind: FailureKind): number | undefined {
    if (!rokaModel.hasFallback) return undefined

    // A hedge can pin the fallback while useFallback is still false, so the pin names the failed side.
    const failedOnFallback = this.route.pinned ? this.route.pinned === 'fallback' : this.route.useFallback
    this.route.useFallback = !failedOnFallback
    // A ladder switch is a new attempt on the other side, so that side's first answer sets the pin.
    this.route.pinned = null
    this.switchKind = kind
    if (this.route.useFallback) {
      this.movedAwayFromGemini = true
      logger.warn(
        { channelId: this.channelId, kind, model: rokaModel.fallbackModelName },
        'Gemini unavailable, answering this turn with the fallback model'
      )
      return requestTimeoutFor(true)
    }

    return requestTimeoutFor(false)
  }
}

/** Generate an in-character response using the ADK agent pipeline
 * @param options - Channel ID, user message, display name, and optional image attachments
 * @returns Response text and detected tone
 */
export async function generateResponse(options: GenerateOptions): Promise<GenerateResult> {
  const generateStartMs = performance.now()
  const { channelId, guildId, userMessage, displayName, username, userId, memory, mediaAttachments } = options
  const memoryScope = resolveMemoryScope(memory, config.memory.privacy)

  const turnEntryWork =
    options.turnEntryWork ??
    startTurnEntryWork({
      channelId,
      guildId,
      userId,
      speakerName: displayName,
      message: userMessage,
      mentionedUserIds: options.mentionedUserIds,
      memoryScope
    })
  // Watching runs alongside memory retrieval rather than after it.
  const mediaWork = prepareTurnMedia({
    channelId,
    attachments: mediaAttachments,
    focus: userMessage,
    mayRetry: () => getSharedRateLimiter().tryConsumeAboveFloor(config.gemini.retryRpmFloor),
    geminiUnavailable: rokaModel.hasFallback && hasStickyFallback(),
    // Servers only: DMs, group DMs, `/ask` and privacy `off` keep what was watched in the transcript alone.
    memoryScope:
      memoryScope === 'full' && !guildId.startsWith('dm:') && options.messageId
        ? { guildId, channelId, messageId: options.messageId, userId }
        : null
  })
  // Handled here so a failure in createTurnContext cannot leave it as an unhandled rejection.
  mediaWork.catch(() => undefined)
  const context = await createTurnContext({ ...options, memoryScope, turnEntryWork, mediaWork })
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
  const {
    directParts: mediaParts,
    mediaTextParts,
    compactions,
    compactDigests,
    digests,
    watcherCalls,
    mediaTokens,
    droppedAttachments,
    truncatedAttachments,
    refusedAttachments,
    watchOutcome
  } = await mediaWork

  // Read the sticky window only now: a long media watch can outlast it, or another channel's outage can open it.
  const turn = new TurnAttempt({
    systemPrompt: context.systemPrompt,
    channelId,
    memoryScope,
    asksAboutReplies: options.asksAboutReplies,
    useFallback: rokaModel.hasFallback && hasStickyFallback(),
    safetyLadder,
    composePrompt,
    format: context.format
  })

  // Tell the model when files are absent or refused so it does not search for their missing contents.
  const failedAttachmentNotice = [
    ...(droppedAttachments > 0
      ? [{ text: `[${droppedAttachments} file(s) were shared with this message but could not be retrieved.]` }]
      : []),
    ...(options.skippedAttachments && options.skippedAttachments > 0
      ? [
          {
            text:
              `[${options.skippedAttachments} more file(s) were shared with this message but left out, because ` +
              'one turn can only take so much; only the first ones were opened.]'
          }
        ]
      : []),
    ...(refusedAttachments > 0
      ? [
          {
            text:
              `[${refusedAttachments} of the files shared with this message were too long to read in one turn, ` +
              'so they were not opened.]'
          }
        ]
      : [])
  ]

  // Keep attachment notices in both ordinary and safety-rebuilt turns.
  const buildNewMessage = (): Content => ({
    role: 'user',
    parts: [
      ...(turn.dropMedia ? [] : mediaParts),
      // Rung 3 drops what was watched along with what was seen: either may be what tripped the filter.
      ...(turn.dropMedia ? [] : mediaTextParts),
      ...failedAttachmentNotice,
      { text: `[${displayName}]: ${userMessage}` }
    ]
  })

  logger.debug(
    { model: config.llm.main.model, sessionEvents: session.events?.length ?? 0, hasImages: mediaParts.length > 0 },
    'Sending ADK request'
  )

  const llmStartMs = performance.now()
  const usedToolNames = new Set<string>(prefetchUsed ? [PREFETCH_TOOL_NAME] : [])
  const geminiToolNames = new Set<string>()
  const toolCalls = { usedToolNames, geminiToolNames }
  const testRunTurn = testRunTurnFactory?.(turn.systemPrompt)
  const verdict: ModelVerdict = {}
  // The watcher spent its calls from the same reservation before ADK starts.
  const modelCalls = { count: watcherCalls }
  const reliability = await modelRouteForRequest.run(turn.route, () =>
    modelCallsForRequest.run(modelCalls, () =>
      toolCallsForRequest.run(toolCalls, () =>
        modelVerdictForRequest.run(verdict, () =>
          steeringForRequest.run(turn.steering, () =>
            runTurnWithReliability({
              maxRetries: config.gemini.liveMaxRetries,
              retryBackoffCapMs: config.gemini.retryBackoffCapMs,
              requestTimeoutMs: requestTimeoutFor(turn.route.useFallback),
              turnDeadlineMs: config.gemini.turnDeadlineMs,
              switchModel: (kind) => turn.switchModel(kind),
              tryConsumeRetry: () => getSharedRateLimiter().tryConsumeAboveFloor(config.gemini.retryRpmFloor),
              // Bound each advertised backoff by the configured total retry ceiling.
              computeBackoff: (attempt) =>
                computeBackoff(attempt, config.gemini.retryBackoffBaseMs, { maxMs: config.gemini.retryBackoffCapMs }),
              genericFallback: getRandomFallback(),
              safetyDeflection: SAFETY_DEFLECTION,
              recitationDeflection: RECITATION_DEFLECTION,
              terminalDeflection: TERMINAL_DEFLECTION,
              resetSession: () => turn.resetSession(),
              safetyLadderLength: safetyLadder.length,
              onEmptyReply: (diagnostic) => {
                turn.noteEmptyReply(diagnostic)
              },
              escalateSafety: () => turn.escalateSafety(),
              runTurn: async (attempt, signal) => {
                const includeCurrentTurn = turn.shouldIncludeCurrentTurn(attempt)
                // One attempt's whole budget, so a native search the model asks for inside it knows how much
                // time is left before the chat model's next call still has to fit.
                const searchAttempt = {
                  deadlineAtMs: performance.now() + requestTimeoutFor(turn.route.useFallback),
                  signal
                }
                const testRequest: TestTurnRequest = {
                  newMessage: includeCurrentTurn ? buildNewMessage() : undefined,
                  stateDelta: includeCurrentTurn
                    ? {
                        _systemPrompt: turn.systemPrompt,
                        _userId: userId,
                        _channelId: channelId,
                        _guildId: guildId,
                        _userMessage: userMessage
                      }
                    : undefined
                }
                if (testRunTurn)
                  return withSearchAttempt(searchAttempt, () => testRunTurn(attempt, signal, testRequest))

                let responseText = ''
                let hasFunctionCall = false
                let finishReason: LlmResponse['finishReason']
                let replyDiagnostic: ReplyDiagnostic | undefined

                const request: Parameters<typeof runner.runAsync>[0] = {
                  userId: channelId,
                  sessionId: channelId,
                  newMessage: buildNewMessage(),
                  customMetadata: includeCurrentTurn ? undefined : { [RETRY_OF_STORED_TURN]: true },
                  runConfig: { maxLlmCalls: Math.max(1, config.gemini.maxLlmCalls - watcherCalls) },
                  stateDelta: testRequest.stateDelta
                }

                const requestHistory = { historyEndedOnToolResult: false }
                const eventStream = runner.runAsync(request)[Symbol.asyncIterator]()
                while (true) {
                  const { value: event, done } = await requestHistoryForRequest.run(requestHistory, () =>
                    withSearchAttempt(searchAttempt, () => eventStream.next())
                  )
                  if (done) break
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
                    const parts = event.content.parts
                    const suppliedDiagnostic = (
                      event.customMetadata as { replyDiagnostic?: ReplyDiagnostic } | undefined
                    )?.replyDiagnostic
                    replyDiagnostic = suppliedDiagnostic ?? {
                      provider: turn.route.useFallback ? (config.llm.fallback?.provider ?? 'unknown') : 'google',
                      modelId: modelNameForCurrentRequest(),
                      finishReason: event.finishReason === undefined ? null : String(event.finishReason),
                      ...(event.usageMetadata?.candidatesTokenCount !== undefined
                        ? { outputTokens: event.usageMetadata.candidatesTokenCount }
                        : {}),
                      ...(event.usageMetadata?.thoughtsTokenCount !== undefined
                        ? { reasoningTokens: event.usageMetadata.thoughtsTokenCount }
                        : {}),
                      textPartCount: parts.filter((part: Part) => part.text?.trim() && !part.thought).length,
                      reasoningPartCount: parts.filter((part: Part) => part.thought).length,
                      functionCallPartCount: parts.filter((part: Part) => 'functionCall' in part && part.functionCall)
                        .length,
                      reasoningTextLength: parts.reduce(
                        (length, part: Part) => length + (part.thought && part.text ? part.text.length : 0),
                        0
                      ),
                      historyEndedOnToolResult: requestHistory.historyEndedOnToolResult
                    }
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

                return {
                  text: responseText,
                  finishReason,
                  hasText: Boolean(responseText),
                  hasFunctionCall,
                  replyDiagnostic
                }
              }
            })
          )
        )
      )
    )
  )
  const llmMs = Math.round(performance.now() - llmStartMs)

  if (reliability.success) {
    if (turn.route.useFallback) {
      logger.info(
        { channelId, model: rokaModel.fallbackModelName, attempts: reliability.attempts },
        'Fallback model answered'
      )
      if (turn.movedAwayFromGemini && turn.switchKind !== undefined && STICKY_KINDS.has(turn.switchKind)) {
        setFallbackUntilMs(config.llm.stickyMs > 0 ? Date.now() + config.llm.stickyMs : 0)
      }
    } else {
      setFallbackUntilMs(0)
    }
  }

  // Strip after retries so they resend the original bytes; a missed strip is cleaned up on the next turn or TTL.
  const strippedParts = sessionService.stripAttachmentBytes(channelId, compactions)
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
      const savedUserMessage = compactDigests.length > 0 ? `${userMessage}\n${compactDigests.join('\n')}` : userMessage
      saveMessage(channelId, 'user', displayName, savedUserMessage, userId, username)
      saveMessage(channelId, 'assistant', character.name, reliability.text)
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
      errorMessage: turn.emptyReplyDiagnostic ? JSON.stringify(turn.emptyReplyDiagnostic) : undefined,
      safetyRungsUsed: turn.safetyRung,
      attempts: reliability.attempts,
      tone,
      imageCount: mediaParts.length + digests.length,
      imageMimes: mediaAttachments?.map((img) => img.contentType).join(',') || undefined,
      overheardChars: overheardSection.length,
      historyDepth: session.events?.length ?? 0,
      factEntries: factEntryCount,
      userMessage
    })
  }
  // Reuse one estimate for both reported and charged token cost.
  const tokensInEst =
    estimateTokens(turn.systemPrompt) +
    fakeMessages.reduce((total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`), 0) +
    toolsTok +
    estimateTokens(`[${displayName}]: ${userMessage}`) +
    mediaTokens +
    mediaTextParts.reduce((total, part) => total + estimateTokens(part.text ?? ''), 0)

  // Charge after the reliability ladder so retries and rebuilt prompts are included in actual spend.
  chargeTokens(tokensInEst)

  const answeredModel =
    turn.route.answeredBy === 'fallback'
      ? config.llm.fallback
      : turn.route.answeredBy === 'main'
        ? config.llm.main
        : null
  const requestedFormat = context.format?.request ?? null
  const formatResult = turn.steering.formatResult
  const formatOutcome: ResponseMetrics['formatOutcome'] =
    !reliability.success || requestedFormat === null
      ? undefined
      : turn.formatSuppressed !== null
        ? 'suppressed'
        : formatResult?.outcome
  const formatDetail =
    requestedFormat === null
      ? undefined
      : JSON.stringify({
          v: 1,
          mode: config.format.mode,
          cues: requestedFormat.cues,
          params: {
            scoreMax: requestedFormat.score?.max ?? null,
            lengthUnit: requestedFormat.length?.unit ?? null,
            lengthMax: requestedFormat.length?.max ?? null
          },
          first: formatResult?.first ?? null,
          final: formatResult?.final ?? null,
          repair: formatResult?.repair ?? null,
          suppressed: turn.formatSuppressed
        })
  const requestedKinds = requestedFormat === null ? undefined : formatKinds(requestedFormat)
  if (reliability.success && requestedFormat !== null && formatOutcome === 'unmet' && formatResult) {
    const unmetKinds = formatKinds(requestedFormat).filter((kind) => formatResult.final[kind] === false)
    recordFailureDiagnostic({
      guildId,
      channelId,
      userId,
      outcome: 'ok',
      kind: 'format_unmet',
      failureMarker: unmetKinds.join(','),
      errorMessage: formatDetail,
      attempts: reliability.attempts,
      tone,
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
    tokensInEst,
    tokensOutEst: estimateTokens(reliability.text),
    routeRole: turn.route.answeredBy ?? undefined,
    provider: answeredModel?.provider,
    modelId: answeredModel?.model,
    hedged: turn.route.hedged ? 1 : 0,
    formatKinds: requestedKinds ? JSON.stringify(requestedKinds) : undefined,
    formatOutcome,
    formatDetail
  }

  return {
    text: reliability.text,
    tone,
    metrics,
    toolsUsed,
    prefetchUsed,
    geminiCalledSearch: geminiToolNames.has(PREFETCH_TOOL_NAME),
    needsLookup: turnEntryWork.needsLookup ?? null,
    droppedAttachments,
    truncatedAttachments,
    refusedAttachments,
    watchOutcome,
    modelCalls: modelCalls.count
  }
}
