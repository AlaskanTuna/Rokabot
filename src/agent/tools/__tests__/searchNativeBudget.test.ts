/**
 * The hung-search contract between the attempt budget and the reliability ladder. It runs against the real
 * `config.js` — a partial mock would leave `reliability.ts`, which builds `rokaModel` at import, without the
 * keys it reads — and the real 8000 and 5000 defaults are the numbers this pins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../../config.js'
import { hasStickyFallback, runTurnWithReliability, setFallbackUntilMs } from '../../reliability.js'
import { nativeSearchTimeMs, withSearchAttempt } from '../search/attemptBudget.js'
import { createNativeSearch } from '../search/native.js'
import type { NativeCall } from '../search/native.js'
import { SEARCH_TEXT } from '../search/types.js'

const MAIN_ROUTE = config.llm.main

/** Resolves only when its own signal aborts, standing in for a provider call that hangs. */
function hangsUntilAborted() {
  return vi.fn(
    (_route: unknown, call: NativeCall) =>
      new Promise<never>((_resolve, reject) => {
        call.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
  )
}

describe('native search inside the reliability attempt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    setFallbackUntilMs(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    setFallbackUntilMs(0)
  })

  it('finishes a hung search inside the attempt with no fallback or sticky window', async () => {
    const call = hangsUntilAborted()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })
    const switchModel = vi.fn(() => 20_000)
    const startedAtMs = performance.now()

    const result = await runTurnWithReliability({
      runTurn: async (_attempt, signal) => {
        // The attempt is already 2.2 s in, leaving 12.8 s for a search that would otherwise hang for 20 s.
        await vi.advanceTimersByTimeAsync(2200)
        const attempt = { deadlineAtMs: performance.now() + 20_000 - 2200, signal }
        const searchWork = withSearchAttempt(attempt, () => search({ query: 'frieren' }))
        // The search's own 8 s timer is what has to fire: the caller hangs until its signal aborts.
        await vi.advanceTimersByTimeAsync(8000)
        const outcome = await searchWork
        await vi.advanceTimersByTimeAsync(2000)
        return { text: `searched: ${outcome.answer}`, hasText: true, hasFunctionCall: false }
      },
      tryConsumeRetry: () => true,
      computeBackoff: () => 0,
      sleep: () => Promise.resolve(),
      isShuttingDown: () => false,
      maxRetries: 2,
      retryBackoffCapMs: 12_000,
      requestTimeoutMs: 20_000,
      switchModel,
      genericFallback: 'generic fallback',
      safetyDeflection: 'safety deflection',
      recitationDeflection: 'recitation deflection',
      terminalDeflection: 'terminal deflection'
    })

    expect(result).toMatchObject({ success: true, text: `searched: ${SEARCH_TEXT.failed}` })
    // A search that ran past the attempt would have tripped the per-attempt timeout and moved the turn to the
    // other model, so the elapsed time is the whole claim.
    expect(performance.now() - startedAtMs).toBeLessThan(20_000)
    expect(switchModel).not.toHaveBeenCalled()
    expect(hasStickyFallback()).toBe(false)
  })

  it('makes no provider call for a later search with too little time left', async () => {
    const call = vi.fn(async () => ({
      answer: 'first answer',
      results: [],
      resultCount: 0,
      succeeded: true
    }))
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })
    const controller = new AbortController()

    // 6 s left is below the 8 s search timeout by more than the reserve, so the second search has nothing to
    // spend and must not reach the provider at all.
    const attempt = { deadlineAtMs: performance.now() + 14_000, signal: controller.signal }
    const first = await withSearchAttempt(attempt, () => search({ query: 'first' }))
    await vi.advanceTimersByTimeAsync(8000)
    const second = await withSearchAttempt(attempt, () => search({ query: 'second' }))

    expect(first).toMatchObject({ answer: 'first answer', succeeded: true })
    expect(second).toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
    expect(call).toHaveBeenCalledTimes(1)
    expect(nativeSearchTimeMs()).toBe(8000)
  })
})
