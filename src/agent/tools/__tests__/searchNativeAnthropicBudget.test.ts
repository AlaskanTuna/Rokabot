/**
 * One case that a co-located test cannot cover: the budget reads a route's limits from `config.llm.main`, so the
 * refusal is only real when the Anthropic route *is* the main one. Its own file, with the mock hoisted, because a
 * `doMock` after `budget.js` is already imported would leave that module holding the real config.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: mocks.warn }
}))

vi.mock('../../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config.js')>()
  const { profileFor } = await import('../../llm/profiles.js')
  const profile = profileFor('anthropic', 'claude-haiku-5-5') ?? actual.config.llm.main.profile
  return {
    ...actual,
    config: {
      ...actual.config,
      llm: {
        ...actual.config.llm,
        // rpm 0: the minute is spent before the search starts, so the budget refuses it rather than the provider.
        main: {
          ...actual.config.llm.main,
          provider: 'anthropic' as const,
          model: 'claude-haiku-5-5',
          profile,
          // The default caller builds a real client from this, so it must not be blank.
          apiKey: 'test-key',
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
import { nativeSearch } from '../search/native.js'
import { anthropicNativeSearch } from '../search/nativeAnthropic.js'
import { SEARCH_TEXT } from '../search/types.js'

/** A response that reports one search and 3,000 prompt tokens, the shape the SDK returns. */
function message(): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
      { type: 'text', text: 'ok' }
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 3000, output_tokens: 20, server_tool_use: { web_search_requests: 1 } }
  } as unknown as Anthropic.Message
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
    const create = vi.fn()
    const client = { messages: { create } } as never

    const outcome = await anthropicNativeSearch(config.llm.main, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.quota, succeeded: false })
    expect(create).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  // The reservation charges the request estimate and settles to what the provider reports. A settle that dropped the
  // usage would leave the minute holding an estimate that has nothing to do with the search-result prompt.
  it('settles the token charge to the real input tokens', async () => {
    const limits = { rpm: 100, tpm: 10_000 }
    const previous = config.llm.main.limits
    config.llm.main.limits = limits
    const create = vi.fn().mockResolvedValue(message())
    const client = { messages: { create } } as never

    try {
      await anthropicNativeSearch({ ...config.llm.main, limits }, call(), client)

      expect(create).toHaveBeenCalledOnce()
      // Approximate: the bucket drains continuously, so a millisecond of the minute has already refilled.
      expect(tokenBucketFor({ provider: 'anthropic', model: 'claude-haiku-5-5', limits })?.remaining()).toBeCloseTo(
        7_000,
        0
      )
    } finally {
      config.llm.main.limits = previous
    }
  })

  // Decision 9: without the registration the whole outer path answers "not configured" and never reaches this caller.
  it('reaches this caller through nativeSearch on an Anthropic main route', async () => {
    const limits = { rpm: 100 }
    const previous = config.llm.main.limits
    config.llm.main.limits = limits
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [
            { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
            { type: 'text', text: 'Found it.' }
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 20, server_tool_use: { web_search_requests: 1 } }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    try {
      const outcome = await nativeSearch({ query: 'q' })

      expect(outcome).toMatchObject({ answer: 'Found it.', succeeded: true })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      config.llm.main.limits = previous
      vi.unstubAllGlobals()
    }
  })
})
