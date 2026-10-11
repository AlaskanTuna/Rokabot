import { AsyncLocalStorage } from 'node:async_hooks'
import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
export { ModelScopeLlm } from './llm/chatCompletionsLlm.js'

export type AnswerModel = 'main' | 'fallback'

export interface ModelRoute {
  useFallback: boolean
  /** 1 once any model call of the turn has fired a hedge. */
  hedged: boolean
  /** Which side produced the turn's answer; null until a call answers, and on a turn that produced none. */
  answeredBy: AnswerModel | null
  /** Set by the first answer of the turn; later calls in the turn use the same side (provider pinning). */
  pinned: AnswerModel | null
}

export const modelRouteForRequest = new AsyncLocalStorage<ModelRoute>()

type RaceSide = AnswerModel

type RaceOutcome =
  | { winner: RaceSide; responses: LlmResponse[]; errors: [] }
  | { winner: null; responses: null; errors: Array<{ side: RaceSide; error: unknown }> }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The fallback replaces non-image media with a text marker, so a hedge there would answer a message nobody sent. */
function isHedgeEligible(llmRequest: LlmRequest): boolean {
  return !(llmRequest.contents ?? []).some((content) =>
    (content.parts ?? []).some((part) => {
      const mimeType = part.inlineData?.mimeType ?? part.fileData?.mimeType
      return Boolean(mimeType) && !mimeType?.startsWith('image/')
    })
  )
}

function withAbort(llmRequest: LlmRequest, signal: AbortSignal): LlmRequest {
  return { ...llmRequest, config: { ...llmRequest.config, abortSignal: signal } }
}

/**
 * Runs both sides of the hedge race and returns once one of them has answered, which is what "answered first"
 * means here: a non-streaming Gemini call yields its single response when the whole call is done, so answering
 * and winning are the same event. A side that fails only drops out of the race — the other side may still
 * answer, and a fallback that fails fast is exactly the case this has to survive. Only when both have failed
 * is there nothing left to wait for.
 */
async function raceForWinner(
  llmRequest: LlmRequest,
  primary: BaseLlm,
  fallback: BaseLlm,
  hedgeAfterMs: number,
  onHedgeFired: () => void
): Promise<RaceOutcome> {
  const primaryAbort = new AbortController()
  const fallbackAbort = new AbortController()
  let settle: ((outcome: RaceOutcome) => void) | undefined
  const settled = new Promise<RaceOutcome>((resolve) => {
    settle = resolve
  })
  let decided = false
  let hedgeStarted = false
  const errors: Array<{ side: RaceSide; error: unknown }> = []
  let failures = 0

  const decide = (outcome: RaceOutcome) => {
    if (decided) return
    decided = true
    fallbackAbort.abort()
    primaryAbort.abort()
    settle?.(outcome)
  }

  const run = async (side: RaceSide, llm: BaseLlm, request: LlmRequest): Promise<void> => {
    const responses: LlmResponse[] = []
    try {
      for await (const response of llm.generateContentAsync(request)) responses.push(response)
    } catch (error) {
      if (decided) return
      errors.push({ side, error })
      // Nothing is racing yet, so Gemini's failure is the turn's own: waiting out the timer to start a
      // fallback call would delay a failure the ladder already knows how to handle.
      if (side === 'main' && !hedgeStarted) {
        clearTimeout(timer)
        decide({ winner: null, responses: null, errors })
        return
      }
      failures++
      if (failures === 2) decide({ winner: null, responses: null, errors })
      return
    }
    if (decided) return
    decide({ winner: side, responses, errors: [] })
  }

  const timer = setTimeout(() => {
    if (decided) return
    hedgeStarted = true
    onHedgeFired()
    void run('fallback', fallback, withAbort(llmRequest, fallbackAbort.signal))
  }, hedgeAfterMs)

  void run('main', primary, withAbort(llmRequest, primaryAbort.signal))

  const outcome = await settled
  clearTimeout(timer)
  return outcome
}

export class RoutedLlm extends BaseLlm {
  readonly fallbackModelName: string | undefined
  readonly hedgeAfterMs: number
  private readonly pinTurns: boolean

  constructor(
    private readonly primary: BaseLlm,
    private readonly fallback: BaseLlm | null,
    hedgeAfterMs: number = config.llm.hedgeAfterMs,
    { pinTurns = false }: { pinTurns?: boolean } = {}
  ) {
    super({ model: primary.model })
    this.fallbackModelName = fallback?.model
    this.hedgeAfterMs = hedgeAfterMs
    this.pinTurns = pinTurns
  }

  get hasFallback(): boolean {
    return this.fallback !== null
  }

  async *generateContentAsync(llmRequest: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
    const route = modelRouteForRequest.getStore()
    const fallback = this.fallback
    const pinned = fallback && this.pinTurns ? (route?.pinned ?? null) : null
    const onFallback = fallback !== null && (pinned ? pinned === 'fallback' : Boolean(route?.useFallback))
    const side: AnswerModel = onFallback ? 'fallback' : 'main'
    if (pinned || onFallback || !fallback || !route || this.hedgeAfterMs <= 0 || !isHedgeEligible(llmRequest)) {
      if (route) route.answeredBy = side
      yield* (onFallback && fallback ? fallback : this.primary).generateContentAsync(llmRequest, stream)
      if (route && this.pinTurns) route.pinned = side
      return
    }

    // route.hedged is turn-wide, so a later call in a turn that already hedged cannot tell whether it hedged itself.
    let hedgeFired = false
    const outcome = await raceForWinner(llmRequest, this.primary, fallback, this.hedgeAfterMs, () => {
      hedgeFired = true
      route.hedged = true
    })
    if (outcome.winner === null) {
      // One turn-level failure, unchanged for the ladder: the fallback's loss is logged and dropped, because
      // it is Gemini's outage that the switch policy, the sticky window and the retry budget are all keyed on.
      for (const failure of outcome.errors) {
        if (failure.side === 'fallback') {
          logger.warn({ err: failure.error }, 'Hedged fallback call failed while Gemini was still running')
        }
      }
      const mainError = outcome.errors.find((failure) => failure.side === 'main')?.error
      throw mainError ?? new Error(`Both models failed (${errorText(outcome.errors[0]?.error)})`)
    }

    route.answeredBy = outcome.winner
    if (this.pinTurns) route.pinned = outcome.winner
    if (hedgeFired) {
      logger.warn(
        { winner: outcome.winner, hedgeAfterMs: this.hedgeAfterMs },
        'Hedged slow Gemini call; kept the faster answer'
      )
    }
    yield* outcome.responses[Symbol.iterator]()
  }

  connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    return this.primary.connect(llmRequest)
  }
}
