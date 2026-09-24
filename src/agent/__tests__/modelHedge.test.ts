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

import { RoutedLlm, answerModelForRequest, hedgeForRequest, modelRouteForRequest } from '../fallbackModel.js'

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
    const hedge = { hedged: false }

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run(hedge, () => responses(routed, request()))
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    primary.resolve(0, { text: 'gemini answer' })

    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(fallback.calls).toBe(0)
    expect(hedge.hedged).toBe(false)
  })

  it('hedges after the threshold and takes the faster fallback, aborting Gemini', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const hedge = { hedged: false }
    const answer = { model: null as 'gemini' | 'fallback' | null }

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run(hedge, () => answerModelForRequest.run(answer, () => responses(routed, request())))
    )
    await afterHedge(fallback)

    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    expect(hedge.hedged).toBe(true)
    expect(answer.model).toBe('fallback')
    expect(fallback.signals[0]?.aborted).toBe(false)
    // The grace period passes before the loser is killed, so the abort arrives while it is still in flight.
    primary.resolve(0, { text: 'too late' })
    await vi.waitFor(() => expect(primary.signals[0]?.aborted).toBe(true), { timeout: 1000 })
  })

  it('keeps the Gemini answer when it lands after the hedge started, aborting the fallback', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const hedge = { hedged: false }
    const answer = { model: null as 'gemini' | 'fallback' | null }

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run(hedge, () => answerModelForRequest.run(answer, () => responses(routed, request())))
    )
    await afterHedge(fallback)
    primary.resolve(0, { text: 'slow gemini answer' })

    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('slow gemini answer')
    expect(hedge.hedged).toBe(true)
    expect(answer.model).toBe('gemini')
    expect(fallback.signals[0]?.aborted).toBe(true)
    fallback.resolve(0, { text: 'too late' })
    await vi.waitFor(() => expect(fallback.signals[0]?.aborted).toBe(true), { timeout: 1000 })
  })

  it('never hedges a request carrying media the fallback cannot open', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const pdfRequest = request([
      { role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'JVBER' } }] }
    ])

    const pending = modelRouteForRequest.run({ useFallback: false }, () => responses(routed, pdfRequest))
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

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run({ hedged: false }, () => responses(routed, imageRequest))
    )
    await afterHedge(fallback)

    fallback.resolve(0, { text: 'fallback read the image' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback read the image')
    primary.resolve(0, { text: 'too late' })
  })

  it('never hedges a turn already routed to the fallback', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)

    const pending = modelRouteForRequest.run({ useFallback: true }, () =>
      hedgeForRequest.run({ hedged: false }, () => responses(routed, request()))
    )
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(primary.calls).toBe(0)
    expect(fallback.calls).toBe(1)

    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
  })

  it('propagates the Gemini failure unchanged when both sides fail', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)
    const geminiError = new Error('503 overloaded')

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run({ hedged: false }, () => responses(routed, request()))
    )
    await afterHedge(fallback)
    primary.resolve(0, { error: geminiError })
    await expect(pending).rejects.toBe(geminiError)
    // The fallback is settled afterwards: the race is the first side to FINISH, and the turn keeps whatever
    // it was built on, which is Gemini's.
    fallback.resolve(0, { error: new Error('fallback down') })
  })

  it('logs nothing for an aborted loser', async () => {
    const primary = new DeferredLlm('primary')
    const fallback = new DeferredLlm('fallback')
    const routed = new RoutedLlm(primary, fallback, HEDGE_MS)

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run({ hedged: false }, () => responses(routed, request()))
    )
    await afterHedge(fallback)
    fallback.resolve(0, { text: 'fallback answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('fallback answer')
    // The grace period passes before the loser is killed, so the abort arrives while it is still in flight.
    primary.resolve(0, { text: 'too late' })
    await vi.waitFor(() => expect(primary.signals[0]?.aborted).toBe(true), { timeout: 1000 })

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
    const hedge = { hedged: false }

    const pending = modelRouteForRequest.run({ useFallback: false }, () =>
      hedgeForRequest.run(hedge, () => responses(routed, request()))
    )
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fallback.calls).toBe(0)

    primary.resolve(0, { text: 'gemini answer' })
    expect((await pending)[0]?.content?.parts?.[0]?.text).toBe('gemini answer')
    expect(hedge.hedged).toBe(false)
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
