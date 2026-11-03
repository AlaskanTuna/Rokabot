import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import { ApiError } from '@google/genai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn()
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))

import type { ResolvedModel } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { rateLimiterFor } from '../../../utils/rateLimiter.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { profileFor } from '../../llm/profiles.js'
import { ProviderError } from '../../llm/providerError.js'
import type { CallUsage } from '../../llm/usage.js'
import { onUsage } from '../../llm/usage.js'
import { SAFETY_SETTINGS } from '../../safetySettings.js'
import type { NativeCall } from '../search/native.js'
import { nativeSearchPrompt } from '../search/native.js'
import { geminiNativeSearch } from '../search/nativeGemini.js'
import { SEARCH_TEXT } from '../search/types.js'

type GenerateContent = ReturnType<typeof vi.fn>

type GeminiClient = {
  models: { generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> }
}

function route(model: string, extra: Partial<ResolvedModel> = {}): ResolvedModel {
  const profile = profileFor('gemini', model)
  if (!profile) throw new Error(`no profile for gemini/${model}`)
  return {
    key: model,
    provider: 'gemini',
    model,
    profile,
    apiKey: 'test-key',
    timeoutMs: 5_000,
    maxOutputTokens: 300,
    ...extra
  }
}

const FLASH_LITE = route('gemini-3.5-flash-lite')

function call(overrides: Partial<NativeCall> = {}): NativeCall {
  return {
    query: 'frieren season 2 date',
    topic: 'general',
    maxResults: 5,
    signal: new AbortController().signal,
    ...overrides
  }
}

/** A response body shaped as the SDK types it, with only the fields these tests read made explicit. */
function response(
  candidate: Record<string, unknown>,
  extra: { usageMetadata?: Record<string, unknown> } = {}
): GenerateContentResponse {
  return { candidates: [candidate], ...extra } as unknown as GenerateContentResponse
}

function grounding(metadata: Record<string, unknown>): Record<string, unknown> {
  return { content: { parts: [{ text: 'It premiered in January.' }] }, groundingMetadata: metadata }
}

function chunk(uri?: string, title?: string): Record<string, unknown> {
  return uri === undefined ? {} : { web: { uri, ...(title === undefined ? {} : { title }) } }
}

function support(text: string, indices: number[]): Record<string, unknown> {
  return { segment: { text }, groundingChunkIndices: indices }
}

function replies(...responses: GenerateContentResponse[]): { client: GeminiClient; generate: GenerateContent } {
  const generate = vi.fn()
  for (const reply of responses) generate.mockResolvedValueOnce(reply)
  return { client: { models: { generateContent: generate } } as unknown as GeminiClient, generate }
}

function rejected(error: unknown): { client: GeminiClient; generate: GenerateContent } {
  const generate = vi.fn().mockRejectedValue(error)
  return { client: { models: { generateContent: generate } } as unknown as GeminiClient, generate }
}

function sentBody(generate: GenerateContent, index = 0): GenerateContentParameters {
  return generate.mock.calls[index][0] as GenerateContentParameters
}

const usageRecords: CallUsage[] = []
let stopUsage: () => void

beforeEach(() => {
  closeDb()
  __resetBudgetsForTest()
  mocks.warn.mockReset()
  usageRecords.length = 0
  stopUsage = onUsage((usage) => {
    if (usage.workload === 'search') usageRecords.push(usage)
  })
})

afterEach(() => {
  stopUsage()
  mocks.warn.mockReset()
})

describe('geminiNativeSearch', () => {
  it('sends only the Google Search tool and the query verbatim', async () => {
    const { client, generate } = replies(response(grounding({ webSearchQueries: ['frieren'] })))
    const nativeCall = call()

    await geminiNativeSearch(FLASH_LITE, nativeCall, client)

    const body = sentBody(generate)
    expect(body.model).toBe('gemini-3.5-flash-lite')
    expect(body.contents).toBe('frieren season 2 date')
    expect(body.config?.tools).toEqual([{ googleSearch: {} }])
    expect(body.config?.systemInstruction).toBe(nativeSearchPrompt('general'))
    expect(body.config?.safetySettings).toBe(SAFETY_SETTINGS)
    expect(body.config?.abortSignal).toBe(nativeCall.signal)
    expect(body.config?.maxOutputTokens).toBe(1024)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('carries the topic prompt as the system instruction', async () => {
    const { client, generate } = replies(response(grounding({ webSearchQueries: ['q'] })))

    await geminiNativeSearch(FLASH_LITE, call({ topic: 'news' }), client)

    expect(sentBody(generate).config?.systemInstruction).toBe(nativeSearchPrompt('news'))
  })

  it('passes the call signal as the request abort signal', async () => {
    const controller = new AbortController()
    const { client, generate } = replies(response(grounding({ webSearchQueries: ['q'] })))

    await geminiNativeSearch(FLASH_LITE, call({ signal: controller.signal }), client)

    expect(sentBody(generate).config?.abortSignal).toBe(controller.signal)
  })

  it('maps grounding chunks to results, capped at maxResults', async () => {
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [chunk('https://a.test', 'A'), chunk('https://b.test', 'B'), chunk('https://c.test', 'C')]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call({ maxResults: 2 }), client)

    expect(outcome.results.map((result) => result.url)).toEqual(['https://a.test', 'https://b.test'])
    expect(outcome.resultCount).toBe(2)
    expect(outcome.succeeded).toBe(true)
  })

  it('uses the text of the grounding support that names a chunk as its snippet', async () => {
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [chunk('https://a.test', 'A'), chunk('https://b.test', 'B')],
          groundingSupports: [support('B was the answer', [1])]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results).toEqual([
      { title: 'A', url: 'https://a.test', snippet: '' },
      { title: 'B', url: 'https://b.test', snippet: 'B was the answer' }
    ])
  })

  // The brief's Review Focus 2 case: a chunk with no web source is skipped, but the indices of the chunks after it
  // still point into the original array, so the support for chunk 1 must be read before the skip.
  it('reads a support index against the original chunks, skipping one with no web source', async () => {
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [chunk(), chunk('https://a.test', 'A')],
          groundingSupports: [support('A was the answer', [1])]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results).toEqual([{ title: 'A', url: 'https://a.test', snippet: 'A was the answer' }])
  })

  it('skips a chunk with no web source', async () => {
    const { client } = replies(
      response(grounding({ webSearchQueries: ['q'], groundingChunks: [chunk(), chunk('https://a.test', 'A')] }))
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results).toEqual([{ title: 'A', url: 'https://a.test', snippet: '' }])
    expect(outcome.resultCount).toBe(1)
  })

  it('falls back to the URI when a chunk has no title, and removes duplicate URIs keeping the first', async () => {
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [chunk('https://a.test'), chunk('https://b.test', 'B'), chunk('https://a.test', 'A again')]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results).toEqual([
      { title: 'https://a.test', url: 'https://a.test', snippet: '' },
      { title: 'B', url: 'https://b.test', snippet: '' }
    ])
  })

  it('falls back to the URI when a chunk has an empty title', async () => {
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [{ web: { uri: 'https://a.test', title: '' } }]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results).toEqual([{ title: 'https://a.test', url: 'https://a.test', snippet: '' }])
  })

  it('clips a snippet longer than the bound', async () => {
    const long = 'x'.repeat(300)
    const { client } = replies(
      response(
        grounding({
          webSearchQueries: ['q'],
          groundingChunks: [chunk('https://a.test', 'A')],
          groundingSupports: [support(long, [0])]
        })
      )
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.results[0].snippet).toBe(`${'x'.repeat(200)}...`)
  })

  it('joins the text parts that are not thoughts and trims the answer', async () => {
    const { client } = replies(
      response({
        content: {
          parts: [{ text: '  It premiered ' }, { text: 'in January.', thought: true }, { text: 'of 2026.  ' }]
        },
        groundingMetadata: { webSearchQueries: ['q'] }
      })
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome.answer).toBe('It premiered of 2026.')
  })

  it.each([[], undefined])('returns the no-summary text with no results when no search ran', async (queries) => {
    const { client } = replies(response(grounding({ ...(queries === undefined ? {} : { webSearchQueries: queries }) })))

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.noSummary, results: [], resultCount: 0, succeeded: true })
  })

  // A search that ran but grounded nothing still bills, so its reported query is what decides "a search ran",
  // not whether any chunk came back with it.
  it('bills a search that ran and grounded no chunks', async () => {
    const { client } = replies(response(grounding({ webSearchQueries: ['q'] })))

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome).toMatchObject({ answer: 'It premiered in January.', results: [], succeeded: true })
    expect(usageRecords[0].searchRequests).toBe(1)
  })

  it('keeps the results and uses the no-summary text when the response has no text', async () => {
    const { client } = replies(
      response({
        content: { parts: [] },
        groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [chunk('https://a.test', 'A')] }
      })
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.noSummary, resultCount: 1, succeeded: true })
  })

  it('returns the no-summary text when the response has no candidate at all', async () => {
    const { client } = replies({} as GenerateContentResponse)

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.noSummary, results: [], resultCount: 0, succeeded: true })
  })

  it('counts each reported query as one search in the usage record', async () => {
    const { client } = replies(
      response(grounding({ webSearchQueries: ['a', '', 'b'] }), {
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }
      })
    )

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'search',
      inputTokens: 100,
      outputTokens: 20,
      searchRequests: 2
    })
  })

  // The retrieved page text is billed in its own bucket, and geminiUsage only reads the prompt and candidate ones.
  it('counts the retrieved text as input tokens', async () => {
    const { client } = replies(
      response(grounding({ webSearchQueries: ['q'] }), {
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, toolUsePromptTokenCount: 4000 }
      })
    )

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0]).toMatchObject({ inputTokens: 4100, outputTokens: 20, searchRequests: 1 })
  })

  it('leaves cached tokens out of the input tokens', async () => {
    const { client } = replies(
      response(grounding({ webSearchQueries: ['q'] }), {
        usageMetadata: {
          promptTokenCount: 100,
          cachedContentTokenCount: 40,
          candidatesTokenCount: 20,
          toolUsePromptTokenCount: 4000
        }
      })
    )

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0]).toMatchObject({ inputTokens: 4060, outputTokens: 20, searchRequests: 1 })
  })

  it('leaves searchRequests out when no search ran', async () => {
    const { client } = replies(
      response(grounding({ webSearchQueries: [] }), {
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }
      })
    )

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0].searchRequests).toBeUndefined()
  })

  // A search that ran is billed even when the provider reports no usage metadata, so the fee is not lost.
  it('bills the search when the response carries no usage metadata', async () => {
    const { client } = replies(response(grounding({ webSearchQueries: ['q'] })))

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'search',
      inputTokens: 0,
      outputTokens: 0,
      searchRequests: 1
    })
  })

  // A search cut off after it reached the provider may still be billed, and the monthly cap cannot see a call
  // that never recorded anything.
  it('counts a search aborted after it was sent', async () => {
    const controller = new AbortController()
    const generate = vi.fn(() => {
      controller.abort()
      return Promise.reject(new ApiError({ message: 'aborted', status: 499 }))
    })
    const client = { models: { generateContent: generate } } as unknown as GeminiClient

    await geminiNativeSearch(FLASH_LITE, call({ signal: controller.signal }), client)

    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'search',
      inputTokens: 0,
      outputTokens: 0,
      searchRequests: 1
    })
  })

  it('counts nothing for a failed search that was not aborted', async () => {
    const { client } = rejected(new ApiError({ message: 'boom', status: 500 }))

    await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(usageRecords).toHaveLength(0)
  })

  // The search was sent and billed whatever the response body holds, so a 200 the reader cannot parse must not
  // cost the cap its record.
  it('records the search when the response cannot be read', async () => {
    const { client } = replies(
      response({
        content: { parts: [{ text: 'It premiered in January.' }] },
        groundingMetadata: { webSearchQueries: ['q'], groundingChunks: [null] }
      })
    )

    const outcome = await geminiNativeSearch(FLASH_LITE, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
    expect(usageRecords).toHaveLength(1)
    expect(usageRecords[0].searchRequests).toBe(1)
  })

  it('maps a 429 or a budget refusal to the quota text', async () => {
    const apiError = rejected(new ApiError({ message: 'rate limited', status: 429 }))
    const budgetRefusal = rejected(
      new ProviderError({ provider: 'gemini', kind: 'quota_exhausted', message: 'denied' })
    )
    const billingRefusal = rejected(
      new ProviderError({ provider: 'gemini', kind: 'billing_exhausted', message: 'denied' })
    )

    for (const { client } of [apiError, budgetRefusal, billingRefusal]) {
      await expect(geminiNativeSearch(FLASH_LITE, call(), client)).resolves.toMatchObject({
        answer: SEARCH_TEXT.quota,
        succeeded: false
      })
    }
    expect(mocks.warn).toHaveBeenCalledTimes(3)
  })

  it('maps any other failure to the failure text', async () => {
    const { client } = rejected(new ApiError({ message: 'boom', status: 500 }))

    await expect(geminiNativeSearch(FLASH_LITE, call(), client)).resolves.toMatchObject({
      answer: SEARCH_TEXT.failed,
      succeeded: false
    })
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  it('takes a budget reservation with workload search', async () => {
    const limited = route('gemini-3.5-flash-lite', { limits: { rpm: 10, rpd: 100 } })
    const limiter = rateLimiterFor(limited)
    const before = limiter.remainingRpm
    const { client, generate } = replies(response(grounding({ webSearchQueries: ['q'] })))

    await geminiNativeSearch(limited, call(), client)

    expect(generate).toHaveBeenCalledOnce()
    expect(limiter.remainingRpm).toBe(before - 1)
  })
})
