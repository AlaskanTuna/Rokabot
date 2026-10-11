import type { LlmRequest, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const budget = vi.hoisted(() => ({ startCall: vi.fn(), release: vi.fn() }))

vi.mock('../budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../budget.js')>()),
  startCall: budget.startCall
}))

import type { ResolvedModel } from '../../../config.js'
import { createLlm } from '../createModel.js'
import { type ProviderId, profileFor } from '../profiles.js'
import { ProviderError } from '../providerError.js'

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

const ROUTES = [
  route('gemini', 'gemini-3.5-flash-lite'),
  route('anthropic', 'claude-haiku-5-5', { effort: 'low' }),
  route('modelscope', 'Qwen/Qwen3.5-122B-A10B', { baseUrl: 'https://modelscope.test/v1' })
]

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

beforeEach(() => {
  budget.startCall.mockReset()
  budget.release.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('every adapter asks the budget before it sends', () => {
  it.each(ROUTES)('$provider sends nothing when the budget refuses the call', async (resolved) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    budget.startCall.mockRejectedValue(
      new ProviderError({ provider: resolved.provider, kind: 'quota_exhausted', message: 'local rpm budget' })
    )

    await expect(collect(createLlm(resolved).generateContentAsync(request()))).rejects.toMatchObject({
      kind: 'quota_exhausted'
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(budget.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ provider: resolved.provider, model: resolved.model })
    )
  })

  it('releases a ModelScope reservation once, with the usage it reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'ok' } }],
              usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }
            })
          )
      )
    )
    budget.startCall.mockResolvedValue({ release: budget.release })

    await collect(createLlm(ROUTES[2]).generateContentAsync(request()))

    expect(budget.release).toHaveBeenCalledOnce()
    expect(budget.release).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 12, outputTokens: 3 }))
  })
})
