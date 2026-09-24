import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HEDGE_MS = 20

const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))

vi.mock('../../utils/logger.js', () => ({ logger: loggerMock }))

// The module under test pulls the real config, which requires secrets this worktree has none of. Under
// this tsconfig vitest loads tests as CJS, and the RelativePath.keys tsc emits for this file do not collide
// with the literal key the source keeps, so both forms are registered.
vi.mock('../../config.js', () => ({ config: { gemini: { model: 'gemini-test' } } }))
vi.mock('../src/agent/../config.js', () => ({ config: { gemini: { model: 'gemini-test' } } }))

import { RoutedLlm, modelRouteForRequest } from '../fallbackModel.js'
import type { ModelRoute } from '../fallbackModel.js'

type Outcome = { text: string } | { error: Error }

function request(contents: unknown[] = [{ role: 'user', parts: [{ text: 'hello' }] }]): LlmRequest {
  return {
    model: 'gemini-model-name',
    contents,
    config: {},
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

class DeferredLlm extends BaseLlm {
  public calls = 0
  public signals: Array<AbortSignal | undefined> = []
  private readonly pending: Array<(outcome: Outcome) => void> = []

  constructor(model: string) {
    super({ model })
  }

  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
    const index = this.calls++
    const signal = llmRequest.config?.abortSignal
    this.signals[index] = signal
    if (signal?.aborted) throw new Error('The user aborted a request.')
    const outcome = await new Promise<Outcome>((resolve) => this.pending.push(resolve))
    if (signal?.aborted) throw new Error('The user aborted a request.')
    if ('error' in outcome) throw outcome.error
    yield { content: { role: 'model', parts: [{ text: outcome.text }] } }
  }

  resolve(index: number, outcome: Outcome): void {
    this.pending[index]?.(outcome)
  }

  connect(): Promise<BaseLlmConnection> {
    return Promise.resolve({} as BaseLlmConnection)
  }
}

async function responses(model: BaseLlm, llmRequest: LlmRequest): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of model.generateContentAsync(llmRequest)) result.push(response)
  return result
}

function route(overrides: Partial<ModelRoute> = {}): ModelRoute {
  return { useFallback: false, hedged: false, answeredBy: null, ...overrides }
}

/** The hedge timer is real, so a test waits out the threshold rather than moving a fake clock. */
async function afterHedge(fallback: DeferredLlm): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(fallback.calls).toBe(1)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RoutedLlm hedging', () => {
  it('does not hedge when Gemini answers before the threshold', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 5))
    primary.resolve(0, { text: 'gemini answer' })

    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(fallback.calls).toBe(0)
    expect(turn.hedged).toBe(false)
    expect(turn.answeredBy).toBe('gemini')
  })

  it('hedges after the threshold and takes the faster fallback, aborting Gemini in the same tick', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()
    const warnBeforeWin = loggerMock.warn.mock.calls.length

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)

    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    expect(turn.hedged).toBe(true)
    expect(turn.answeredBy).toBe('fallback')
    // The loser is killed the moment the winner is in hand, not after any grace period: the answer is
    // already yielded by the time the caller's continuation runs.
    expect(primary.signals[0]?.aborted).toBe(true)
    expect(loggerMock.warn.mock.calls.length).toBe(warnBeforeWin + 1)
  })

  it('keeps the Gemini answer when it lands after the hedge started, aborting the fallback', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)
    primary.resolve(0, { text: 'slow gemini answer' })

    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('slow gemini answer')
    expect(turn.hedged).toBe(true)
    expect(turn.answeredBy).toBe('gemini')
    expect(fallback.signals[0]?.aborted).toBe(true)
  })

  it('still lets Gemini answer when the fallback fails fast after the hedge fired', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()
    const fallbackError = new Error('ModelScope 429: rate limited')

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)
    // A fallback that dies first is out of the race, not the winner: the turn still waits for Gemini.
    fallback.resolve(0, { error: fallbackError })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(primary.signals[0]?.aborted).toBe(false)

    primary.resolve(0, { text: 'gemini answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(turn.hedged).toBe(true)
    expect(turn.answeredBy).toBe('gemini')
    // The rescued turn is an ordinary success, so the fallback's loss is not reported as a failure.
    expect(loggerMock.warn.mock.calls).toEqual([
      [{ winner: 'gemini', hedgeAfterMs: HEDGE_MS }, 'Hedged slow Gemini call; kept the faster answer']
    ])
  })

  it('still lets the fallback answer when Gemini fails after the hedge fired', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await afterHedge(fallback)
    primary.resolve(0, { error: new Error('503 overloaded') })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fallback.signals[0]?.aborted).toBe(false)

    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    expect(turn.hedged).toBe(true)
    expect(turn.answeredBy).toBe('fallback')
  })

  it('rethrows the Gemini error unchanged once both sides have failed', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const geminiError = new Error('503 overloaded')
    const fallbackError = new Error('ModelScope 429: rate limited')

    const pending = modelRouteForRequest.run(route(), () => responses(routed, request()))
    await afterHedge(fallback)
    fallback.resolve(0, { error: fallbackError })
    await new Promise((resolve) => setTimeout(resolve, 5))
    primary.resolve(0, { error: geminiError })

    // The reliability ladder classifies Gemini's failure kind, so Gemini's own error object is what surfaces.
    await expect(pending).rejects.toBe(geminiError)
  })

  it('rethrows a Gemini failure before the threshold without ever starting the hedge', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route()
    const geminiError = new Error('429 quota exhausted')

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    primary.resolve(0, { error: geminiError })

    await expect(pending).rejects.toBe(geminiError)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(fallback.calls).toBe(0)
    expect(turn.hedged).toBe(false)
    expect(loggerMock.warn).not.toHaveBeenCalled()
  })

  it('never hedges a request carrying media the fallback cannot open', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const pdfRequest = request([
      { role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'JVBER' } }] }
    ])

    const pending = modelRouteForRequest.run(route(), () => responses(routed, pdfRequest))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fallback.calls).toBe(0)

    primary.resolve(0, { text: 'gemini read the pdf' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini read the pdf')
  })

  it('hedges a request carrying an image, which the fallback can serve', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const imageRequest = request([{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBOR' } }] }])

    const pending = modelRouteForRequest.run(route(), () => responses(routed, imageRequest))
    await afterHedge(fallback)

    fallback.resolve(0, { text: 'fallback read the image' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback read the image')
  })

  it('never hedges a turn already routed to the fallback', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const turn = route({ useFallback: true })

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(primary.calls).toBe(0)
    expect(fallback.calls).toBe(1)

    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    expect(turn.answeredBy).toBe('fallback')
  })

  it('logs nothing for an aborted loser', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)

    const pending = modelRouteForRequest.run(route(), () => responses(routed, request()))
    await afterHedge(fallback)
    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    expect(primary.signals[0]?.aborted).toBe(true)

    // The one warning the hedge is allowed to make is the one naming the answer it kept.
    expect(loggerMock.warn.mock.calls).toEqual([
      [{ winner: 'fallback', hedgeAfterMs: HEDGE_MS }, 'Hedged slow Gemini call; kept the faster answer']
    ])
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('does not hedge when hedgeAfterMs is zero', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, 0)
    const turn = route()

    const pending = modelRouteForRequest.run(turn, () => responses(routed, request()))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fallback.calls).toBe(0)

    primary.resolve(0, { text: 'gemini answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(turn.hedged).toBe(false)
  })

  it('leaves the request untouched when no fallback is configured', async () => {
    const primary = new DeferredLlm('primary')
    const routed = new RoutedLlm(primary, null)
    const llmRequest = request()

    const pending = responses(routed, llmRequest)
    primary.resolve(0, { text: 'gemini answer' })

    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(llmRequest.config?.abortSignal).toBeUndefined()
  })
})
