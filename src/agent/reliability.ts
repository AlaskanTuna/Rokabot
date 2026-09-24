import { AsyncLocalStorage } from 'node:async_hooks'
import { BasePlugin } from '@google/adk'
import type { LlmResponse } from '@google/adk'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { createRokaModel, modelRouteForRequest } from './fallbackModel.js'
import { classifyGeminiFailure, extractGeminiStatus } from './geminiReliability.js'
import type { FailureKind } from './geminiReliability.js'
import { isShuttingDown } from './shutdownSignal.js'

export interface ModelVerdict {
  finishReason?: string
  safetyRatings?: string
  /** Heuristic: a finish reason on a returned candidate means Roka's own output was rejected; an
   * error surfaced before any candidate means the prompt was. */
  blockSide?: 'prompt' | 'response'
}
export const modelVerdictForRequest = new AsyncLocalStorage<ModelVerdict>()
const activeAbortControllers = new Set<AbortController>()
export const rokaModel = createRokaModel()
let fallbackUntilMs = 0

export function __resetModelFallbackForTest(): void {
  fallbackUntilMs = 0
}

export function modelNameForCurrentRequest(): string {
  return modelRouteForRequest.getStore()?.useFallback && rokaModel.hasFallback
    ? (rokaModel.fallbackModelName ?? config.gemini.model)
    : config.gemini.model
}

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
  /** Moves the rest of the turn to the other model after an outage-shaped failure.
   * Returns that model's per-request timeout, or undefined when there is nothing to switch to.
   */
  switchModel?: (kind: FailureKind) => number | undefined
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
  let requestTimeoutMs = options.requestTimeoutMs
  let retryLatencyMs = 0
  let lastKind: ReliabilityResult['kind'] = 'network'
  let lastMarker: string | undefined

  // Safety de-escalation rungs are granted on top of the ordinary retry budget: each one strictly
  // removes carried context, so it is cheaper and more likely to pass than the attempt before it.
  let extraSafetyAttempts = 0
  let extraModelAttempts = 0
  let switchModelConsulted = false
  for (let attempt = 0; attempt <= options.maxRetries + extraSafetyAttempts + extraModelAttempts; attempt++) {
    if (shouldStop()) return fallbackResult(lastKind, 'preserve', attempt, retryLatencyMs, options, lastMarker)

    if (attempt > 0 && options.turnDeadlineMs !== undefined) {
      const elapsedMs = now() - startedAtMs
      const remainingMs = options.turnDeadlineMs - elapsedMs
      if (remainingMs < (requestTimeoutMs ?? 0)) {
        logger.warn(
          {
            attempt,
            elapsedMs,
            deadlineMs: options.turnDeadlineMs,
            requestTimeoutMs,
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
    const timeoutId = requestTimeoutMs
      ? setTimeout(() => {
          attemptTimedOut = true
          abortController.abort()
        }, requestTimeoutMs)
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

    // runTurn stops reading events once our timer aborts it, so an error Gemini delivers a moment later (a 504, an
    // AbortError) never reaches the outcome and it reads as an empty answer. Outage-shaped either way.
    const failure =
      attemptTimedOut && !outcome.text
        ? classifyGeminiFailure({ errorMessage: 'Attempt timeout' })
        : classifyGeminiFailure(outcome)
    lastKind = failure.kind
    if (failure.kind !== 'ok') {
      lastMarker = markerFrom(outcome)
      logger.warn(
        {
          attempt,
          kind: failure.kind,
          marker: lastMarker,
          model: modelNameForCurrentRequest()
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
        if (remainingMs < (requestTimeoutMs ?? 0)) {
          logger.warn(
            {
              attempt,
              elapsedMs,
              deadlineMs: options.turnDeadlineMs,
              requestTimeoutMs,
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

    if (
      options.switchModel &&
      !switchModelConsulted &&
      (failure.kind === 'transient_http' || failure.kind === 'network' || failure.kind === 'quota_exhausted') &&
      !shouldStop()
    ) {
      switchModelConsulted = true
      const nextTimeoutMs = options.switchModel(failure.kind)
      if (nextTimeoutMs !== undefined) {
        requestTimeoutMs = nextTimeoutMs
        extraModelAttempts++
        logger.warn({ attempt, kind: failure.kind }, 'Switching turn to the other model')
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
      if (remainingMs < delayMs + (requestTimeoutMs ?? 0)) {
        logger.warn(
          {
            attempt,
            elapsedMs,
            delayMs,
            deadlineMs: options.turnDeadlineMs,
            requestTimeoutMs,
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

/** Intercepts Gemini API errors and exposes them to the turn-level reliability policy. */
export class ErrorRecoveryPlugin extends BasePlugin {
  async onModelErrorCallback({
    error
  }: {
    callbackContext: unknown
    llmRequest: unknown
    error: Error
  }): Promise<LlmResponse | undefined> {
    logger.error(
      {
        model: modelNameForCurrentRequest(),
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

export function abortActiveTurns(): void {
  for (const controller of activeAbortControllers) controller.abort()
}

export function hasStickyFallback(): boolean {
  return Date.now() < fallbackUntilMs
}

export function setFallbackUntilMs(value: number): void {
  fallbackUntilMs = value
}
