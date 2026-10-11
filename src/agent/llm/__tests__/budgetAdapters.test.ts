import type { LlmRequest, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real config is the legacy one, where per-call budgets are inert; a block main key turns them on.
vi.mock('../../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config.js')>()
  return {
    ...actual,
    config: { ...actual.config, llm: { ...actual.config.llm, main: { ...actual.config.llm.main, key: 'flash' } } }
  }
})

import type { ResolvedModel } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { classifyGeminiFailure } from '../../geminiReliability.js'
import { __resetBudgetsForTest, markBillingExhausted } from '../budget.js'
import { createLlm } from '../createModel.js'
import { type ProviderId, profileFor } from '../profiles.js'

function route(provider: ProviderId, model: string, extra: Partial<ResolvedModel> = {}): ResolvedModel {
  const profile = profileFor(provider, model)
  if (!profile) throw new Error(`no profile for ${provider}/${model}`)
  return {
    key: provider,
    provider,
    model,
    profile,
    apiKey: 'test-key',
    timeoutMs: 5_000,
    maxOutputTokens: 300,
    ...extra
  }
}

const qwen = route('modelscope', 'Qwen/Qwen3.5-122B-A10B', { baseUrl: 'https://modelscope.test/v1' })
const haiku = route('anthropic', 'claude-haiku-5-5', { effort: 'low' })

function request(): LlmRequest {
  return {
    model: 'unused',
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    config: {},
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

async function collect(responses: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of responses) result.push(response)
  return result
}

const okCompletion = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))

beforeEach(() => {
  closeDb()
  __resetBudgetsForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('budgets through the adapters', () => {
  it('sends one ModelScope request at a time, the second after the first returns', async () => {
    const pending: Array<() => void> = []
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(okCompletion()))
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const llm = createLlm(qwen)

    const first = collect(llm.generateContentAsync(request()))
    const second = collect(llm.generateContentAsync(request()))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    pending[0]?.()
    await first
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    pending[1]?.()
    await second
  })

  it('refuses a provider with a spent month locally, before any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    markBillingExhausted('anthropic')

    const failure = await collect(createLlm(haiku).generateContentAsync(request())).catch((error: unknown) => error)

    expect(failure).toMatchObject({ kind: 'billing_exhausted', provider: 'anthropic' })
    expect(classifyGeminiFailure(failure).kind).toBe('billing_exhausted')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('disables Anthropic for the month once it reports its credit spent', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'billing_error', message: 'Your credit balance is too low to access the Anthropic API.' }
          }),
          { status: 402, headers: { 'content-type': 'application/json' } }
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const llm = createLlm(haiku)

    await expect(collect(llm.generateContentAsync(request()))).rejects.toMatchObject({ kind: 'billing_exhausted' })
    await expect(collect(llm.generateContentAsync(request()))).rejects.toMatchObject({ kind: 'billing_exhausted' })

    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
