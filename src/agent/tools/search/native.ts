/** Web search run by the main model itself, through the provider's own search tool. */

import type { ResolvedModel } from '../../../config.js'
import { config } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import type { ProviderId } from '../../llm/profiles.js'
import { currentSearchAttempt, nativeSearchTimeMs } from './attemptBudget.js'
import { anthropicNativeSearch } from './nativeAnthropic.js'
import { geminiNativeSearch } from './nativeGemini.js'
import { type BackendOutcome, SEARCH_TEXT, type SearchBackend, failedSearch } from './types.js'

export interface NativeCall {
  query: string
  topic: 'general' | 'news'
  maxResults: number
  signal: AbortSignal
}

export type NativeCaller = (route: ResolvedModel, call: NativeCall) => Promise<BackendOutcome>

const BASE_PROMPT =
  "Always run one web search for the user's message before answering, even when you think you already know the answer, because what you remember may be out of date. Then state what the results say in a few plain sentences, with no preamble and no mention of searching."

export function nativeSearchPrompt(topic: 'general' | 'news'): string {
  return topic === 'news' ? `${BASE_PROMPT} Prefer recent news coverage.` : BASE_PROMPT
}

/** Rejects on abort, so a caller that ignores its signal still cannot overrun the time it was given. */
function raceAgainstAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Native search aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    // A settled race holds nothing: a listener left on the attempt's signal would outlive the search.
    const settle =
      <A>(finish: (value: A) => void) =>
      (value: A) => {
        signal.removeEventListener('abort', onAbort)
        finish(value)
      }
    work.then(settle(resolve), settle(reject))
  })
}

export function createNativeSearch(callers: Partial<Record<ProviderId, NativeCaller>>): SearchBackend {
  return async (params) => {
    // Always the main route, whichever side is answering the turn: only the configured main model carries a
    // tested native search tool.
    const route = config.llm.main
    const caller = callers[route.provider]
    if (!caller) return failedSearch(SEARCH_TEXT.notConfigured)

    const timeMs = nativeSearchTimeMs()
    if (timeMs === null) {
      // The result text alone cannot tell an operator why nothing was searched, and a shortened budget is the cause.
      logger.warn({ provider: route.provider }, 'Native search skipped: too little attempt time left')
      return failedSearch(SEARCH_TEXT.failed)
    }

    const timer = new AbortController()
    const timeoutId = setTimeout(() => timer.abort(), timeMs)
    const attempt = currentSearchAttempt()
    const signal = AbortSignal.any([
      timer.signal,
      ...(attempt ? [attempt.signal] : []),
      ...(params.signal ? [params.signal] : [])
    ])

    try {
      // A spent attempt or an abandoned request must not spend a provider call at all.
      if (signal.aborted) throw new Error('Native search aborted')
      return await raceAgainstAbort(
        caller(route, {
          query: params.query,
          topic: params.topic ?? 'general',
          // The tool's schema states 1-10 without enforcing it, and a native provider bills per search or per result.
          maxResults: Math.min(10, Math.max(1, Math.trunc(params.max_results ?? 5))),
          signal
        }),
        signal
      )
    } catch (error) {
      logger.warn(
        {
          provider: route.provider,
          error: error instanceof Error ? error.message : String(error)
        },
        'Native search failed'
      )
      return failedSearch(SEARCH_TEXT.failed)
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export const nativeSearch: SearchBackend = createNativeSearch({
  anthropic: anthropicNativeSearch,
  gemini: geminiNativeSearch
})
