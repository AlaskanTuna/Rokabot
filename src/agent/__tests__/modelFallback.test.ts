import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../config.js'

const mocks = vi.hoisted(() => ({ hasFallback: true, tryConsumeRetry: vi.fn(() => true) }))

vi.mock('../fallbackModel.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../fallbackModel.js')>()
  const { Gemini } = await import('@google/adk')

  return {
    ...original,
    createRokaModel: () => {
      const model = new original.RoutedLlm(new Gemini({ model: 'gemini-test' }), new Gemini({ model: 'fallback-test' }))
      Object.defineProperty(model, 'hasFallback', { get: () => mocks.hasFallback })
      return model
    }
  }
})

vi.mock('../jev/judgments.js', () => ({ judgeTurn: vi.fn(async () => undefined) }))

vi.mock('../../storage/sessionStore.js', () => ({
  getChannelUsers: vi.fn(() => new Map()),
  loadHistory: vi.fn(() => []),
  saveMessage: vi.fn()
}))

vi.mock('../../storage/userMemory.js', () => ({
  getFacts: vi.fn(() => []),
  refreshFactTimestamps: vi.fn()
}))

vi.mock('../../storage/userNames.js', () => ({
  getAllUserNames: vi.fn(() => new Map()),
  getUserName: vi.fn(() => null)
}))

vi.mock('../../storage/metricsStore.js', () => ({
  recordMemoryEvent: vi.fn(),
  recordFailureDiagnostic: vi.fn()
}))

vi.mock('../memory/retriever.js', () => ({
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] }))
}))

vi.mock('../memory/identityResolver.js', () => ({
  resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] }))
}))

vi.mock('../attachmentCost.js', () => ({
  measureAttachmentTokens: vi.fn(async () => 100),
  needsMeasuring: vi.fn(() => false)
}))

vi.mock('../passiveBuffer.js', () => ({ getMessages: vi.fn(() => []) }))

vi.mock('../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: () => ({ tryConsumeAboveFloor: mocks.tryConsumeRetry })
}))

vi.mock('../../utils/timezone.js', () => ({ getLocalHour: () => 12 }))

import { RoutedLlm, modelRouteForRequest } from '../fallbackModel.js'
import { __resetModelFallbackForTest, runTurnWithReliability } from '../reliability.js'
import type { TurnOutcome } from '../reliability.js'
import { __resetTestRunTurnFactory, __setTestRunTurnFactory, generateResponse, rokaAgent } from '../roka.js'
import { destroySession } from '../session.js'
import { resetForTest } from '../shutdownSignal.js'

const mutableFallbackConfig = config.fallback as unknown as { timeoutMs: number; stickyMs: number }
const mutableGeminiConfig = config.gemini as unknown as {
  timeout: number
  liveMaxRetries: number
  retryBackoffBaseMs: number
  retryBackoffCapMs: number
  hedgeAfterMs: number
}
const mutableJevConfig = config.jev as unknown as { tone: 'off' | 'shadow' | 'on'; referents: 'off' | 'shadow' | 'on' }
const channelId = 'model-fallback-test'

const originalConfig = {
  fallbackTimeoutMs: mutableFallbackConfig.timeoutMs,
  stickyMs: mutableFallbackConfig.stickyMs,
  geminiTimeout: mutableGeminiConfig.timeout,
  liveMaxRetries: mutableGeminiConfig.liveMaxRetries,
  retryBackoffBaseMs: mutableGeminiConfig.retryBackoffBaseMs,
  retryBackoffCapMs: mutableGeminiConfig.retryBackoffCapMs,
  hedgeAfterMs: mutableGeminiConfig.hedgeAfterMs
}

const genericFallback = 'generic fallback'
const safetyDeflection = 'safety deflection'
const recitationDeflection = 'recitation deflection'
const terminalDeflection = 'terminal deflection'
const existingFallbackReplies = [
  'Hmm? Sorry, I spaced out for a moment there~',
  'Ah, what was that? I got distracted by something.',
  'Ahaha, my mind wandered. Say that again?',
  "I wasn't paying attention... don't tell anyone, okay?"
]

function reliabilityOptions(overrides: Partial<Parameters<typeof runTurnWithReliability>[0]> = {}) {
  return {
    runTurn: vi.fn(),
    tryConsumeRetry: vi.fn(() => true),
    computeBackoff: vi.fn(() => 0),
    sleep: vi.fn(async () => {}),
    isShuttingDown: () => false,
    maxRetries: 2,
    retryBackoffCapMs: 12_000,
    genericFallback,
    safetyDeflection,
    recitationDeflection,
    terminalDeflection,
    ...overrides
  }
}

function responseOptions(userMessage = 'Hello fallback.') {
  return {
    channelId,
    guildId: 'fallback-guild',
    memory: true,
    userMessage,
    displayName: 'Mio',
    username: 'mio',
    userId: 'mio-id'
  }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  resetForTest()
  __resetModelFallbackForTest()
  mocks.hasFallback = true
  mutableFallbackConfig.timeoutMs = originalConfig.fallbackTimeoutMs
  mutableFallbackConfig.stickyMs = originalConfig.stickyMs
  mutableGeminiConfig.timeout = originalConfig.geminiTimeout
  mutableGeminiConfig.liveMaxRetries = originalConfig.liveMaxRetries
  mutableGeminiConfig.retryBackoffBaseMs = 0
  mutableGeminiConfig.retryBackoffCapMs = 0
  mutableGeminiConfig.hedgeAfterMs = 0
  mutableJevConfig.tone = 'off'
  mutableJevConfig.referents = 'off'
})

afterEach(async () => {
  vi.useRealTimers()
  __resetTestRunTurnFactory()
  __resetModelFallbackForTest()
  await destroySession(channelId)
  resetForTest()
  mutableFallbackConfig.timeoutMs = originalConfig.fallbackTimeoutMs
  mutableFallbackConfig.stickyMs = originalConfig.stickyMs
  mutableGeminiConfig.timeout = originalConfig.geminiTimeout
  mutableGeminiConfig.liveMaxRetries = originalConfig.liveMaxRetries
  mutableGeminiConfig.retryBackoffBaseMs = originalConfig.retryBackoffBaseMs
  mutableGeminiConfig.retryBackoffCapMs = originalConfig.retryBackoffCapMs
  mutableJevConfig.tone = 'shadow'
  mutableJevConfig.referents = 'shadow'
})

describe('retry model switching', () => {
  it.each([
    ['transient HTTP errors', { errorCode: '503' }, 'transient_http'],
    ['network errors', { errorMessage: 'connect ETIMEDOUT' }, 'network'],
    ['daily quota errors', { errorMessage: 'RequestsPerDay quota exceeded' }, 'quota_exhausted']
  ] as const)('switches on %s without sleeping or consuming retry budget', async (_name, failure, kind) => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({ text: 'Recovered~', hasText: true, hasFunctionCall: false })
    const switchModel = vi.fn(() => 40)
    const testOptions = reliabilityOptions({ runTurn, switchModel, maxRetries: 0 })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ success: true, text: 'Recovered~', attempts: 2 })
    expect(switchModel).toHaveBeenCalledOnce()
    expect(switchModel).toHaveBeenCalledWith(kind)
    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(testOptions.sleep).not.toHaveBeenCalled()
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it.each([
    ['safety', { finishReason: 'SAFETY', hasText: false, hasFunctionCall: false }],
    ['recitation', { finishReason: 'RECITATION', hasText: false, hasFunctionCall: false }],
    ['terminal', { errorCode: 'INVALID_ARGUMENT' }],
    ['session corruption', { errorMessage: 'function call turn comes immediately after a user turn' }],
    ['empty text', { finishReason: 'STOP', hasText: false, hasFunctionCall: false }]
  ] as const)('does not switch on %s', async (_name, failure) => {
    const runTurn = vi.fn().mockResolvedValue(failure)
    const switchModel = vi.fn(() => 40)

    await runTurnWithReliability(reliabilityOptions({ runTurn, switchModel, maxRetries: 0 }))

    expect(switchModel).not.toHaveBeenCalled()
    expect(runTurn).toHaveBeenCalledOnce()
  })

  it('consults switchModel once when the other model also fails', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorCode: '503' })
    const switchModel = vi.fn(() => 40)

    const result = await runTurnWithReliability(reliabilityOptions({ runTurn, switchModel, maxRetries: 0 }))

    expect(result).toMatchObject({ success: false, attempts: 2 })
    expect(switchModel).toHaveBeenCalledOnce()
    expect(runTurn).toHaveBeenCalledTimes(2)
  })

  it('keeps quota exhaustion handling when switchModel has no model to return', async () => {
    const runTurn = vi.fn().mockResolvedValue({ errorMessage: 'RequestsPerDay quota exceeded' })
    const switchModel = vi.fn(() => undefined)
    const testOptions = reliabilityOptions({ runTurn, switchModel })

    const result = await runTurnWithReliability(testOptions)

    expect(result).toMatchObject({ success: false, kind: 'quota_exhausted', attempts: 1 })
    expect(switchModel).toHaveBeenCalledOnce()
    expect(runTurn).toHaveBeenCalledOnce()
    expect(testOptions.tryConsumeRetry).not.toHaveBeenCalled()
  })

  it('uses the switched timeout for the attempt timer', async () => {
    vi.useFakeTimers()
    let switchedSignal: AbortSignal | undefined
    const runTurn = vi.fn(async (attempt: number, signal: AbortSignal) => {
      if (attempt === 0) return { errorCode: '503', hasText: false, hasFunctionCall: false }
      switchedSignal = signal
      return await new Promise<TurnOutcome>((resolve) => {
        signal.addEventListener(
          'abort',
          () => resolve({ errorMessage: 'ETIMEDOUT', hasText: false, hasFunctionCall: false }),
          { once: true }
        )
      })
    })
    const pending = runTurnWithReliability(
      reliabilityOptions({ runTurn, switchModel: () => 40, maxRetries: 0, requestTimeoutMs: 10 })
    )

    await vi.advanceTimersByTimeAsync(39)
    expect(switchedSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending

    expect(switchedSignal?.aborted).toBe(true)
  })

  it('switches when our own timer aborts an attempt before Gemini reports the error', async () => {
    vi.useFakeTimers()
    const switchModel = vi.fn(() => 40)
    const runTurn = vi.fn(async (attempt: number, signal: AbortSignal) => {
      if (attempt > 0) return { text: 'fallback reply', hasText: true, hasFunctionCall: false }
      return await new Promise<TurnOutcome>((resolve) => {
        signal.addEventListener('abort', () => resolve({ text: '', hasText: false, hasFunctionCall: false }), {
          once: true
        })
      })
    })
    const pending = runTurnWithReliability(
      reliabilityOptions({ runTurn, switchModel, maxRetries: 0, requestTimeoutMs: 10 })
    )

    await vi.advanceTimersByTimeAsync(10)
    const result = await pending

    expect(switchModel).toHaveBeenCalledWith('network')
    expect(result).toMatchObject({ success: true, text: 'fallback reply' })
  })

  it('uses the switched timeout for the deadline check', async () => {
    const runTurn = vi.fn().mockResolvedValueOnce({ errorCode: '503' }).mockResolvedValueOnce({
      text: 'Should not start',
      hasText: true,
      hasFunctionCall: false
    })

    const result = await runTurnWithReliability(
      reliabilityOptions({
        runTurn,
        switchModel: () => 50,
        maxRetries: 0,
        requestTimeoutMs: 10,
        turnDeadlineMs: 49,
        now: () => 0
      })
    )

    expect(result).toMatchObject({ success: false, attempts: 1 })
    expect(runTurn).toHaveBeenCalledOnce()
  })
})

describe('generateResponse model fallback', () => {
  it('uses the fallback for the retry and sends the next turn there within the sticky window', async () => {
    expect(rokaAgent.model).toBeInstanceOf(RoutedLlm)
    const routes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async (attempt) => {
      routes.push(modelRouteForRequest.getStore()?.useFallback)
      return attempt === 0
        ? { errorCode: '503', hasText: false, hasFunctionCall: false }
        : { text: 'Fallback answer~', hasText: true, hasFunctionCall: false }
    })

    const first = await generateResponse(responseOptions())

    expect(first.text).toBe('Fallback answer~')
    expect(routes).toEqual([false, true])

    const nextRoutes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      nextRoutes.push(modelRouteForRequest.getStore()?.useFallback)
      return { text: 'Still here~', hasText: true, hasFunctionCall: false }
    })
    await generateResponse(responseOptions('Are you still there?'))

    expect(nextRoutes).toEqual([true])
  })

  it('uses the fallback timeout in the window and clears the window after Gemini recovers', async () => {
    mutableFallbackConfig.timeoutMs = 12
    mutableFallbackConfig.stickyMs = 10_000
    mutableGeminiConfig.timeout = 1_000
    const routes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async (attempt) => {
      routes.push(modelRouteForRequest.getStore()?.useFallback)
      return attempt === 0
        ? { errorCode: '503', hasText: false, hasFunctionCall: false }
        : { text: 'Fallback answer~', hasText: true, hasFunctionCall: false }
    })
    await generateResponse(responseOptions())

    vi.useFakeTimers()
    let fallbackSignal: AbortSignal | undefined
    __setTestRunTurnFactory(() => async (attempt, signal) => {
      routes.push(modelRouteForRequest.getStore()?.useFallback)
      if (attempt === 0) {
        fallbackSignal = signal
        return await new Promise<TurnOutcome>((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve({ errorMessage: 'ETIMEDOUT', hasText: false, hasFunctionCall: false }),
            { once: true }
          )
        })
      }
      return { text: 'Gemini recovered~', hasText: true, hasFunctionCall: false }
    })

    const pending = generateResponse(responseOptions('Try Gemini again.'))
    await vi.advanceTimersByTimeAsync(11)
    expect(fallbackSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const recovered = await pending

    expect(recovered.text).toBe('Gemini recovered~')
    expect(routes.slice(-2)).toEqual([true, false])

    const finalRoutes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      finalRoutes.push(modelRouteForRequest.getStore()?.useFallback)
      return { text: 'Primary again~', hasText: true, hasFunctionCall: false }
    })
    await generateResponse(responseOptions('Use Gemini again.'))

    expect(finalRoutes).toEqual([false])
  })

  it('does not arm a sticky window when stickyMs is zero', async () => {
    mutableFallbackConfig.stickyMs = 0
    const firstRoutes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async (attempt) => {
      firstRoutes.push(modelRouteForRequest.getStore()?.useFallback)
      return attempt === 0
        ? { errorCode: '503', hasText: false, hasFunctionCall: false }
        : { text: 'Fallback answer~', hasText: true, hasFunctionCall: false }
    })
    await generateResponse(responseOptions())

    const nextRoutes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      nextRoutes.push(modelRouteForRequest.getStore()?.useFallback)
      return { text: 'Gemini again~', hasText: true, hasFunctionCall: false }
    })
    await generateResponse(responseOptions('Try Gemini again.'))

    expect(firstRoutes).toEqual([false, true])
    expect(nextRoutes).toEqual([false])
  })

  it('records the answering model on every answered turn, and never arms the sticky window for a hedge', async () => {
    mutableFallbackConfig.stickyMs = 10_000
    const answeredBy: Array<string | null | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      const route = modelRouteForRequest.getStore()
      // Stand in for a model call the hedge beat: it fired one, and the fallback is what answered.
      if (route) {
        route.hedged = true
        route.answeredBy = 'fallback'
      }
      answeredBy.push(route?.answeredBy)
      return { text: 'Hedge answer~', hasText: true, hasFunctionCall: false }
    })
    const first = await generateResponse(responseOptions())
    const second = await generateResponse(responseOptions('A slow one.'))

    expect(first.metrics).toMatchObject({ model: 'fallback', hedged: 1 })
    expect(second.metrics).toMatchObject({ model: 'fallback', hedged: 1 })
    expect(answeredBy).toEqual(['fallback', 'fallback'])

    const nextRoutes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      const route = modelRouteForRequest.getStore()
      // An unhedged Gemini call still records who answered.
      if (route) route.answeredBy = 'gemini'
      nextRoutes.push(route?.useFallback)
      return { text: 'Gemini next~', hasText: true, hasFunctionCall: false }
    })
    const next = await generateResponse(responseOptions('And now?'))

    expect(nextRoutes).toEqual([false])
    expect(next.metrics).toMatchObject({ model: 'gemini', hedged: 0 })
  })

  it('keeps the existing fallback reply when no fallback model is configured', async () => {
    mocks.hasFallback = false
    mutableGeminiConfig.liveMaxRetries = 0
    const routes: Array<boolean | undefined> = []
    __setTestRunTurnFactory(() => async () => {
      routes.push(modelRouteForRequest.getStore()?.useFallback)
      return { errorCode: '503', hasText: false, hasFunctionCall: false }
    })

    const result = await generateResponse(responseOptions())

    expect(result.metrics).toMatchObject({ outcome: 'fallback', kind: 'transient_http', retries: 0 })
    expect(existingFallbackReplies).toContain(result.text)
    expect(routes).toEqual([false])
  })
})
