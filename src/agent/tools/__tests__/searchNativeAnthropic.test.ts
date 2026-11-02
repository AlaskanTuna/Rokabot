import type Anthropic from '@anthropic-ai/sdk'
import { APIError, APIUserAbortError } from '@anthropic-ai/sdk'
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
import type { AnthropicMessagesClient } from '../../llm/anthropicLlm.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { profileFor } from '../../llm/profiles.js'
import { ProviderError } from '../../llm/providerError.js'
import type { CallUsage } from '../../llm/usage.js'
import { onUsage } from '../../llm/usage.js'
import type { NativeCall } from '../search/native.js'
import { nativeSearchPrompt } from '../search/native.js'
import { anthropicNativeSearch } from '../search/nativeAnthropic.js'
import { SEARCH_TEXT } from '../search/types.js'

type ContentBlock = Record<string, unknown>
type Create = ReturnType<typeof vi.fn>

function route(model: string, extra: Partial<ResolvedModel> = {}): ResolvedModel {
  const profile = profileFor('anthropic', model)
  if (!profile) throw new Error(`no profile for anthropic/${model}`)
  return {
    key: model,
    provider: 'anthropic',
    model,
    profile,
    apiKey: 'test-key',
    timeoutMs: 5_000,
    maxOutputTokens: 300,
    ...extra
  }
}

const HAIKU = route('claude-haiku-5-5')
const SONNET = route('claude-sonnet-5-5')

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
function message(
  content: ContentBlock[],
  extra: { stop_reason?: string; usage?: Record<string, unknown> } = {}
): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason: extra.stop_reason ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      ...extra.usage
    }
  } as unknown as Anthropic.Message
}

function searched(requests: number): Record<string, unknown> {
  return { server_tool_use: { web_search_requests: requests, web_fetch_requests: 0 } }
}

function searchBlock(results: Array<{ title: string; url: string }>, id = 'srvtoolu_1'): ContentBlock[] {
  return [
    { type: 'server_tool_use', id, name: 'web_search', input: { query: 'frieren' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: id,
      content: results.map((result) => ({
        type: 'web_search_result',
        title: result.title,
        url: result.url,
        encrypted_content: 'e',
        page_age: null
      }))
    }
  ]
}

function errorBlock(code: string): ContentBlock[] {
  return [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'q' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: { type: 'web_search_tool_result_error', error_code: code }
    }
  ]
}

function cited(url: string, cited_text: string): ContentBlock {
  return {
    type: 'text',
    text: 'answer text',
    citations: [{ type: 'web_search_result_location', url, title: null, cited_text, encrypted_index: 'i' }]
  }
}

function replies(...messages: Anthropic.Message[]): { client: AnthropicMessagesClient; create: Create } {
  const create = vi.fn()
  for (const reply of messages) create.mockResolvedValueOnce(reply)
  return { client: { messages: { create } } as unknown as AnthropicMessagesClient, create }
}

function rejected(error: unknown): { client: AnthropicMessagesClient; create: Create } {
  const create = vi.fn().mockRejectedValue(error)
  return { client: { messages: { create } } as unknown as AnthropicMessagesClient, create }
}

function sentBody(create: Create, index = 0): Record<string, unknown> {
  return create.mock.calls[index][0] as Record<string, unknown>
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

describe('anthropicNativeSearch', () => {
  it('sends one web search tool, the query verbatim and thinking off', async () => {
    const { client, create } = replies(
      message([...searchBlock([]), { type: 'text', text: 'It premiered in January.' }])
    )

    await anthropicNativeSearch(HAIKU, call(), client)

    const body = sentBody(create)
    expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }])
    expect(body.messages).toEqual([{ role: 'user', content: 'frieren season 2 date' }])
    expect(body.max_tokens).toBe(1024)
    expect(body.model).toBe('claude-haiku-5-5')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('carries the topic prompt as the system text', async () => {
    const { client, create } = replies(message(searchBlock([])))

    await anthropicNativeSearch(HAIKU, call({ topic: 'news' }), client)

    expect(sentBody(create).system).toBe(nativeSearchPrompt('news'))
  })

  it.each([
    ['claude-haiku-5-5', 'disabled'],
    ['claude-sonnet-5-5', 'between_tools']
  ])('spells thinking off for %s as %s', async (model, expected) => {
    const { client, create } = replies(message(searchBlock([])))

    await anthropicNativeSearch(route(model), call(), client)

    expect(sentBody(create).thinking).toEqual({ type: expected })
    expect(sentBody(create).output_config).toBeUndefined()
  })

  it('discards text written before the search', async () => {
    const { client } = replies(
      message([
        { type: 'text', text: "I'll search for that." },
        ...searchBlock([{ title: 'Crunchyroll', url: 'https://a.test' }]),
        { type: 'text', text: 'Found it.' }
      ])
    )

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome.answer).toBe('Found it.')
  })

  // Claude splits an answer at each citation, so one sentence arrives as several blocks that carry their own spacing.
  it('rejoins an answer that citations split across text blocks', async () => {
    const { client } = replies(
      message([
        ...searchBlock([{ title: 'A', url: 'https://a.test' }]),
        { type: 'text', text: 'Based on the results, ' },
        { ...cited('https://a.test', 'premiered January'), text: 'it premiered in January' },
        { type: 'text', text: ' ' },
        { ...cited('https://a.test', 'of 2026'), text: 'of 2026' },
        { type: 'text', text: '.' }
      ])
    )

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome.answer).toBe('Based on the results, it premiered in January of 2026.')
  })

  it('sends its default client to the base URL of the route', async () => {
    const fetchMock = vi.fn(
      async (_url: unknown) =>
        new Response(JSON.stringify(message([{ type: 'text', text: 'ok' }])), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await anthropicNativeSearch({ ...HAIKU, apiKey: 'test-key', baseUrl: 'https://proxy.test/anthropic' }, call())
    vi.unstubAllGlobals()

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://proxy.test/anthropic/v1/messages')
  })

  it('maps results with the cited text as snippet, cited results first, capped at maxResults, without duplicates', async () => {
    const { client } = replies(
      message([
        ...searchBlock([
          { title: 'A', url: 'https://a.test' },
          { title: 'B', url: 'https://b.test' },
          { title: 'C', url: 'https://c.test' }
        ]),
        cited('https://c.test', 'third fact'),
        { type: 'text', text: 'Answer.' }
      ])
    )

    const outcome = await anthropicNativeSearch(HAIKU, call({ maxResults: 2 }), client)

    expect(outcome.results).toEqual([
      { title: 'C', url: 'https://c.test', snippet: 'third fact' },
      { title: 'A', url: 'https://a.test', snippet: '' }
    ])
    expect(outcome.resultCount).toBe(2)
    expect(outcome.succeeded).toBe(true)
  })

  it('keeps one row for a URL two searches both returned, with the citation on it', async () => {
    const { client } = replies(
      message(
        [
          ...searchBlock([{ title: 'A', url: 'https://a.test' }], 'srvtoolu_1'),
          ...searchBlock([{ title: 'A again', url: 'https://a.test' }], 'srvtoolu_2'),
          cited('https://a.test', 'the fact'),
          { type: 'text', text: 'Answer.' }
        ],
        { usage: searched(2) }
      )
    )

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome.results).toEqual([{ title: 'A', url: 'https://a.test', snippet: 'the fact' }])
    expect(outcome.resultCount).toBe(1)
  })

  it('leaves the snippet empty when no citation names a result', async () => {
    const { client } = replies(
      message([
        ...searchBlock([{ title: 'A', url: 'https://a.test' }]),
        cited('https://other.test', 'unrelated'),
        { type: 'text', text: 'Answer.' }
      ])
    )

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome.results).toEqual([{ title: 'A', url: 'https://a.test', snippet: '' }])
  })

  it('returns the no-summary text with no results when no search ran', async () => {
    const { client } = replies(message([{ type: 'text', text: 'I think it premiered in January.' }]))

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.noSummary, results: [], resultCount: 0, succeeded: true })
  })

  it('keeps the results and uses the no-summary text when the answer has no text', async () => {
    const { client } = replies(message(searchBlock([{ title: 'A', url: 'https://a.test' }]), { usage: searched(1) }))

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.noSummary, resultCount: 1, succeeded: true })
  })

  it('maps too_many_requests to the quota text', async () => {
    const { client } = replies(message([...errorBlock('too_many_requests'), { type: 'text', text: 'No luck.' }]))

    await expect(anthropicNativeSearch(HAIKU, call(), client)).resolves.toMatchObject({
      answer: SEARCH_TEXT.quota,
      succeeded: false
    })
  })

  it.each(['max_uses_exceeded', 'invalid_tool_input', 'query_too_long', 'request_too_large', 'unavailable'])(
    'maps %s to the failure text',
    async (code) => {
      const { client } = replies(message([...errorBlock(code), { type: 'text', text: 'No luck.' }]))

      await expect(anthropicNativeSearch(HAIKU, call(), client)).resolves.toMatchObject({
        answer: SEARCH_TEXT.failed,
        succeeded: false
      })
    }
  )

  it('resends a paused turn once with the assistant content', async () => {
    const paused = message([{ type: 'text', text: 'Searching.' }], { stop_reason: 'pause_turn' })
    const { client, create } = replies(
      paused,
      message([...searchBlock([{ title: 'A', url: 'https://a.test' }]), { type: 'text', text: 'Found it.' }])
    )

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(create).toHaveBeenCalledTimes(2)
    const second = sentBody(create, 1)
    expect(second.messages).toEqual([
      { role: 'user', content: 'frieren season 2 date' },
      { role: 'assistant', content: paused.content }
    ])
    expect(outcome.answer).toBe('Found it.')
  })

  it('sends the abort signal with the resend too', async () => {
    const controller = new AbortController()
    const { client, create } = replies(
      message([{ type: 'text', text: '' }], { stop_reason: 'pause_turn' }),
      message([...searchBlock([]), { type: 'text', text: 'ok' }])
    )

    await anthropicNativeSearch(HAIKU, call({ signal: controller.signal }), client)

    expect(create.mock.calls[0][1].signal).toBe(controller.signal)
    expect(create.mock.calls[1][1].signal).toBe(controller.signal)
  })

  it('fails on a second pause and never returns partial text', async () => {
    const paused = message([{ type: 'text', text: 'Searching' }], { stop_reason: 'pause_turn' })
    const { client, create } = replies(paused, paused)

    const outcome = await anthropicNativeSearch(HAIKU, call(), client)

    expect(create).toHaveBeenCalledTimes(2)
    expect(outcome).toMatchObject({ answer: SEARCH_TEXT.failed, succeeded: false })
  })

  it('maps a refusal to the failure text', async () => {
    const { client } = replies(message([{ type: 'text', text: '' }], { stop_reason: 'refusal' }))

    await expect(anthropicNativeSearch(HAIKU, call(), client)).resolves.toMatchObject({
      answer: SEARCH_TEXT.failed,
      succeeded: false
    })
  })

  // Review Focus 5: a shutdown or an abandoned attempt aborts the call in flight, and the tool must not throw.
  it('returns the failure text when the signal aborts mid-call', async () => {
    const controller = new AbortController()
    const create = vi.fn(() => {
      controller.abort()
      return Promise.reject(new APIUserAbortError({ message: 'Request was aborted.' }))
    })
    const client = { messages: { create } } as unknown as AnthropicMessagesClient

    await expect(anthropicNativeSearch(HAIKU, call({ signal: controller.signal }), client)).resolves.toMatchObject({
      answer: SEARCH_TEXT.failed,
      succeeded: false
    })
  })

  it.each([
    [429, SEARCH_TEXT.quota],
    [402, SEARCH_TEXT.quota],
    [400, SEARCH_TEXT.failed],
    [500, SEARCH_TEXT.failed]
  ])('maps HTTP %s to the %s text', async (status, expected) => {
    // The real SDK error, so the classification under test is the one production gets rather than a fake kind.
    const { client } = rejected(APIError.generate(status, {}, `boom ${status}`, new Headers()))

    await expect(anthropicNativeSearch(HAIKU, call(), client)).resolves.toMatchObject({
      answer: expected,
      succeeded: false
    })
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  it('records usage per request with workload search and searchRequests', async () => {
    const { client } = replies(
      message([{ type: 'text', text: '' }], { stop_reason: 'pause_turn', usage: searched(0) }),
      message([...searchBlock([{ title: 'A', url: 'https://a.test' }]), { type: 'text', text: 'ok' }], {
        usage: searched(2)
      })
    )

    await anthropicNativeSearch(HAIKU, call(), client)

    expect(usageRecords).toHaveLength(2)
    expect(usageRecords[0]).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5', workload: 'search' })
    // `callUsage` keeps its current output for every existing caller, so a zero count leaves the field out.
    expect(usageRecords[0].searchRequests).toBeUndefined()
    expect(usageRecords[1].searchRequests).toBe(2)
  })

  it('takes a budget reservation for each request, including a resend', async () => {
    // The route's own limiter and bucket are the ones a reservation spends, so both are read before and after.
    const limited = route('claude-haiku-5-5', { limits: { rpm: 10, rpd: 100 } })
    const limiter = rateLimiterFor(limited)
    const before = limiter.remainingRpm
    const paused = message([{ type: 'text', text: '' }], { stop_reason: 'pause_turn' })
    const { client, create } = replies(paused, message(searchBlock([])))

    await anthropicNativeSearch(limited, call(), client)

    expect(create).toHaveBeenCalledTimes(2)
    // Two requests, two reservations: a resend that skipped the budget would leave the minute one slot down.
    expect(limiter.remainingRpm).toBe(before - 2)
  })
})
