/** The reply attempt's remaining time, shared with the search_web call the model makes inside it. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '../../../config.js'

export interface SearchAttempt {
  deadlineAtMs: number
  signal: AbortSignal
}

/** Below this a native search would almost always time out, so it is not worth its provider call. */
export const MIN_NATIVE_SEARCH_MS = 2000

const attemptForRequest = new AsyncLocalStorage<SearchAttempt>()

export function withSearchAttempt<T>(attempt: SearchAttempt, run: () => T): T {
  return attemptForRequest.run(attempt, run)
}

export function currentSearchAttempt(): SearchAttempt | undefined {
  return attemptForRequest.getStore()
}

/**
 * How long one native search may take: the configured ceiling, or what is left of the attempt once the
 * reserve for the chat model's next call is set aside. `null` when neither leaves a worthwhile call.
 */
export function nativeSearchTimeMs(nowMs: number = performance.now()): number | null {
  const { nativeTimeoutMs, nativeReserveMs } = config.search
  const attempt = attemptForRequest.getStore()
  const affordableMs =
    attempt === undefined ? nativeTimeoutMs : Math.min(nativeTimeoutMs, attempt.deadlineAtMs - nowMs - nativeReserveMs)
  return affordableMs < MIN_NATIVE_SEARCH_MS ? null : affordableMs
}
