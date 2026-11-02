/**
 * One case that a co-located test cannot cover: the budget reads a route's limits from `config.llm.main`, so the
 * refusal is only real when the Gemini route *is* the main one. Its own file, with the mock hoisted, because a
 * `doMock` after `budget.js` is already imported would leave that module holding the real config.
 */

import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: mocks.warn }
}))

vi.mock('../../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config.js')>()
  const { profileFor } = await import('../../llm/profiles.js')
  const profile = profileFor('gemini', 'gemini-3.5-flash-lite') ?? actual.config.llm.main.profile
  return {
    ...actual,
    config: {
      ...actual.config,
      llm: {
        ...actual.config.llm,
        // rpm 0: the minute is spent before the search starts, so the budget refuses it rather than the provider.
        main: {
          ...actual.config.llm.main,
          provider: 'gemini' as const,
          model: 'gemini-3.5-flash-lite',
          profile,
          limits: { rpm: 0 }
        }
      }
    }
  }
})

import { config } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { tokenBucketFor } from '../../tokenBudget.js'
import type { NativeCall } from '../search/native.js'
import { geminiNativeSearch } from '../search/nativeGemini.js'
import { SEARCH_TEXT } from '../search/types.js'

type GeminiClient = {
  models: { generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> }
}

/** A response that reports one search and 3,000 prompt tokens, the shape the SDK returns. */
function response(): GenerateContentResponse {
  return {
    candidates: [
      {
        content: { parts: [{ text: 'ok' }] },
        groundingMetadata: {
          webSearchQueries: ['q'],
          groundingChunks: [{ web: { uri: 'https://a.test', title: 'A' } }]
        }
      }
    ],
    usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 20 }
  } as unknown as GenerateContentResponse
}

function call(): NativeCall {
  return { query: 'q', topic: 'general', maxResults: 5, signal: new AbortController().signal }
}

beforeEach(() => {
  closeDb()
  __resetBudgetsForTest()
  mocks.warn.mockReset()
})

describe('a budget refusal on the main route', () => {
  it('maps a budget refusal to the quota text and calls the provider not at all', async () => {
    const generate = vi.fn()
    const client = { models: { generateContent: generate } } as unknown as GeminiClient

    const outcome = await geminiNativeSearch(config.llm.main, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.quota, succeeded: false })
    expect(generate).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  // The reservation charges the request estimate and settles to what the provider reports. A settle that dropped the
  // usage would leave the minute holding an estimate that has nothing to do with the search-result prompt.
  it('settles the token charge to the real input tokens', async () => {
    const limits = { rpm: 100, tpm: 10_000 }
    const previous = config.llm.main.limits
    config.llm.main.limits = limits
    const generate = vi.fn().mockResolvedValue(response())
    const client = { models: { generateContent: generate } } as unknown as GeminiClient

    try {
      await geminiNativeSearch({ ...config.llm.main, limits }, call(), client)

      expect(generate).toHaveBeenCalledOnce()
      // Approximate: the bucket drains continuously, so a millisecond of the minute has already refilled.
      expect(tokenBucketFor({ provider: 'gemini', model: 'gemini-3.5-flash-lite', limits })?.remaining()).toBeCloseTo(
        7_000,
        0
      )
    } finally {
      config.llm.main.limits = previous
    }
  })

  // Review Focus 5: a shutdown or an abandoned attempt must not spend a provider call at all.
  it('calls no provider when the signal is already aborted', async () => {
    const limits = { rpm: 100, rpd: 100 }
    config.llm.main.limits = limits
    const controller = new AbortController()
    controller.abort()
    const generate = vi.fn()
    const client = { models: { generateContent: generate } } as unknown as GeminiClient

    try {
      const outcome = await geminiNativeSearch(
        { ...config.llm.main, limits },
        { ...call(), signal: controller.signal },
        client
      )

      expect(outcome).toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
      expect(generate).not.toHaveBeenCalled()
    } finally {
      config.llm.main.limits = undefined
    }
  })
})
