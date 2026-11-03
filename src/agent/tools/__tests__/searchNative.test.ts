import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn()
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))

// A partial mock would leave this module path without `rokaModel` for reliability.ts, which builds one at
// import; the two timing values are the real defaults anyway.
vi.mock('../../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config.js')>()
  return {
    ...actual,
    config: { ...actual.config, search: { ...actual.config.search, nativeTimeoutMs: 8000, nativeReserveMs: 5000 } }
  }
})

import { config } from '../../../config.js'
import { modelRouteForRequest } from '../../llm/fallbackModel.js'
import { currentSearchAttempt, nativeSearchTimeMs, withSearchAttempt } from '../search/attemptBudget.js'
import { createNativeSearch, nativeSearchPrompt } from '../search/native.js'
import type { NativeCall } from '../search/native.js'
import { SEARCH_TEXT } from '../search/types.js'

const MAIN_ROUTE = { ...config.llm.main }

function caller(overrides: Partial<NativeCall> = {}) {
  return vi.fn(async (_route, call: NativeCall) => ({
    answer: `answer for ${call.query}`,
    results: [{ title: 'T', url: 'https://example.test/a', snippet: 's' }],
    resultCount: 1,
    succeeded: true,
    ...(overrides as object)
  }))
}

/** Resolves only when its signal aborts, so a test can decide what the caller observes. */
function waitsForAbort() {
  return vi.fn(
    (_route: unknown, call: NativeCall) =>
      new Promise<never>((_resolve, reject) => {
        if (call.signal.aborted) {
          reject(new Error('aborted'))
          return
        }
        call.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
  )
}

describe('attempt budget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives a search the full timeout outside an attempt', () => {
    expect(nativeSearchTimeMs()).toBe(8000)
  })

  it('gives a search the full timeout when the attempt has plenty left', () => {
    const attempt = { deadlineAtMs: performance.now() + 18_000, signal: new AbortController().signal }

    expect(withSearchAttempt(attempt, () => nativeSearchTimeMs())).toBe(8000)
  })

  it('shortens the search to leave the reserve', () => {
    const attempt = { deadlineAtMs: performance.now() + 10_000, signal: new AbortController().signal }

    expect(withSearchAttempt(attempt, () => nativeSearchTimeMs())).toBe(5000)
  })

  it('returns null when less than 2 seconds would remain', () => {
    const attempt = { deadlineAtMs: performance.now() + 6500, signal: new AbortController().signal }

    expect(withSearchAttempt(attempt, () => nativeSearchTimeMs())).toBeNull()
  })

  it('exposes the attempt to code running inside it', () => {
    const attempt = { deadlineAtMs: performance.now() + 10_000, signal: new AbortController().signal }

    expect(withSearchAttempt(attempt, () => currentSearchAttempt())).toBe(attempt)
    expect(currentSearchAttempt()).toBeUndefined()
  })
})

describe('createNativeSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    mocks.warn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the not-configured text when the main route has no caller', async () => {
    const search = createNativeSearch({})

    await expect(search({ query: 'q' })).resolves.toMatchObject({
      answer: SEARCH_TEXT.notConfigured,
      succeeded: false
    })
  })

  it('fails at once and calls no provider when the time is too short', async () => {
    const call = caller()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })
    const attempt = { deadlineAtMs: performance.now() + 6000, signal: new AbortController().signal }

    const outcome = await withSearchAttempt(attempt, () => search({ query: 'q' }))

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
    expect(call).not.toHaveBeenCalled()
  })

  // The result text alone cannot tell an operator why nothing was searched, and a shortened budget is the cause.
  it('warns that the attempt had too little time left', async () => {
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: caller() })
    const attempt = { deadlineAtMs: performance.now() + 6000, signal: new AbortController().signal }

    await withSearchAttempt(attempt, () => search({ query: 'q' }))

    expect(mocks.warn).toHaveBeenCalledWith(
      { provider: MAIN_ROUTE.provider },
      'Native search skipped: too little attempt time left'
    )
  })

  it('returns the failure text when a provider call outlives its time', async () => {
    const call = waitsForAbort()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })

    const pending = search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(8000)

    await expect(pending).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
  })

  // A caller that never looks at its signal is the case the whole budget exists for: without the race it would
  // hold the turn open until the attempt's own timer fired, which is what costs the turn a fallback.
  it('returns the failure text when a caller ignores its signal', async () => {
    const search = createNativeSearch({
      [MAIN_ROUTE.provider]: vi.fn(() => new Promise<never>(() => {}))
    })

    const pending = search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(8000)

    await expect(pending).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
  })

  it('ignores a caller that resolves after its time ran out', async () => {
    const late = vi.fn(
      () =>
        new Promise<{ answer: string; results: never[]; resultCount: number; succeeded: boolean }>((resolve) => {
          setTimeout(() => resolve({ answer: 'too late', results: [], resultCount: 0, succeeded: true }), 9000)
        })
    )
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: late })

    const pending = search({ query: 'q' })
    await vi.advanceTimersByTimeAsync(8000)
    await expect(pending).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })

    // The late answer must not surface as an unhandled rejection, nor change the outcome already returned.
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
  })

  it('returns the failure text without calling the provider when the attempt is already aborted', async () => {
    const call = caller()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })
    const controller = new AbortController()
    controller.abort()
    const attempt = { deadlineAtMs: performance.now() + 30_000, signal: controller.signal }

    await expect(withSearchAttempt(attempt, () => search({ query: 'q' }))).resolves.toMatchObject({
      answer: SEARCH_TEXT.failed,
      succeeded: false
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('returns the failure text without throwing when the attempt aborts mid-call', async () => {
    const call = waitsForAbort()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })
    const controller = new AbortController()
    const attempt = { deadlineAtMs: performance.now() + 30_000, signal: controller.signal }

    const pending = withSearchAttempt(attempt, () => search({ query: 'q' }))
    controller.abort()

    await expect(pending).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
  })

  it('passes the main route even on a fallback-answered turn', async () => {
    const call = caller()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })

    await modelRouteForRequest.run({ useFallback: true, hedged: false, answeredBy: null, pinned: null }, () =>
      search({ query: 'q' })
    )

    expect(call.mock.calls[0][0]).toBe(config.llm.main)
  })

  it('passes the query verbatim, the topic and max_results or 5', async () => {
    const call = caller()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })

    await search({ query: 'frieren season 2 date' })
    await search({ query: 'frieren', topic: 'news', max_results: 3 })

    expect(call.mock.calls[0][1]).toMatchObject({ query: 'frieren season 2 date', topic: 'general', maxResults: 5 })
    expect(call.mock.calls[1][1]).toMatchObject({ query: 'frieren', topic: 'news', maxResults: 3 })
  })

  // The tool's schema states 1-10 without enforcing it, and a native search that asked for 50 results would be
  // billed for 50 on the providers that bill per search or per result.
  it.each([
    [0, 1],
    [-3, 1],
    [2.5, 2],
    [10, 10],
    [50, 10]
  ])('clamps max_results %s to %s for every native caller', async (requested, expected) => {
    const call = caller()
    const search = createNativeSearch({ [MAIN_ROUTE.provider]: call })

    await search({ query: 'q', max_results: requested })

    expect(call.mock.calls[0][1]).toMatchObject({ maxResults: expected })
  })

  it('logs a warning and returns the failure text when the caller throws', async () => {
    const search = createNativeSearch({
      [MAIN_ROUTE.provider]: vi.fn(async () => {
        throw new Error('boom')
      })
    })

    await expect(search({ query: 'q' })).resolves.toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})

describe('nativeSearchPrompt', () => {
  it('adds the recent-coverage line only for news', () => {
    expect(nativeSearchPrompt('general')).toBe(
      "Always run one web search for the user's message before answering, even when you think you already know the answer, because what you remember may be out of date. Then state what the results say in a few plain sentences, with no preamble and no mention of searching."
    )
    expect(nativeSearchPrompt('news')).toBe(
      "Always run one web search for the user's message before answering, even when you think you already know the answer, because what you remember may be out of date. Then state what the results say in a few plain sentences, with no preamble and no mention of searching. Prefer recent news coverage."
    )
  })
})
