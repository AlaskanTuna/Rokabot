import type Anthropic from '@anthropic-ai/sdk'
import { APIError } from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  provider: 'tavily' as string,
  lookup: vi.fn()
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../../../searchSettings.js', () => ({
  searchProviderSetting: () => mocks.provider,
  searchIsAvailable: () => true
}))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

import { fakeFetch, json } from '../../../../tests/harness/fakeFetch.js'
import type { ResolvedModel } from '../../../config.js'
import { closeDb } from '../../../storage/database.js'
import type { AnthropicMessagesClient } from '../../llm/anthropicLlm.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { profileFor } from '../../llm/profiles.js'
import { PAGE_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import { withSearchCitations } from '../../searchCitations.js'
import { PAGE_TEXT, nativeReadPage, readPages } from '../search/readPages.js'
import type { PageSource } from '../search/readPages.js'
import { SEARCH_TEXT } from '../search/types.js'

const PUBLIC_ANSWER = [{ address: '93.184.216.34', family: 4 }]

const originalFetch = globalThis.fetch
const originalExaKey = process.env.EXA_API_KEY
const originalTavilyKey = process.env.TAVILY_API_KEY

function restoreKeys() {
  // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
  if (originalExaKey === undefined) delete process.env.EXA_API_KEY
  else process.env.EXA_API_KEY = originalExaKey
  // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
  if (originalTavilyKey === undefined) delete process.env.TAVILY_API_KEY
  else process.env.TAVILY_API_KEY = originalTavilyKey
}

function source(id: string, url: string): PageSource {
  return { id, url }
}

function anthropicRoute(): ResolvedModel {
  const profile = profileFor('anthropic', 'claude-haiku-5-5')
  if (!profile) throw new Error('no profile for anthropic/claude-haiku-5-5')
  return {
    key: 'haiku',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    profile,
    apiKey: 'test-key',
    timeoutMs: 5_000,
    maxOutputTokens: 300
  }
}

function geminiRoute(): ResolvedModel {
  return { ...anthropicRoute(), provider: 'gemini', model: 'gemini-3.5-flash-lite' }
}

/** A fetch response body shaped as the SDK types it, with only the fields these tests read made explicit. */
function fetchMessage(
  content: unknown[],
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

function fetchResult(texts: string[], extra: Record<string, unknown> = {}): unknown {
  return {
    type: 'web_fetch_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: texts.map((text) => ({ type: 'text', text })),
    ...extra
  }
}

function fakeClient(message: Anthropic.Message): { client: AnthropicMessagesClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue(message)
  return { client: { messages: { create } } as unknown as AnthropicMessagesClient, create }
}

describe('readPages', () => {
  beforeEach(() => {
    mocks.provider = 'tavily'
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    restoreKeys()
    vi.clearAllMocks()
  })

  it('reads a page through Exa with the contents shape and the untrusted-data label', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ results: [{ url: 'https://example.test/page', title: 'The Page', text: 'page body' }] })
    )
    globalThis.fetch = fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.exa.ai/contents')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>)['x-api-key']).toBe('test-key')
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      urls: ['https://example.test/page'],
      text: { maxCharacters: 8000 }
    })
    expect(result).toEqual({
      id: 's1',
      url: 'https://example.test/page',
      title: 'The Page',
      text: `${PAGE_UNTRUSTED_DATA_LABEL}\npage body`,
      truncated: false,
      ok: true
    })
  })

  it('reads a page through Tavily with the extract shape', async () => {
    mocks.provider = 'tavily'
    process.env.TAVILY_API_KEY = 'test-key'
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ results: [{ url: 'https://example.test/page', title: 'The Page', content: 'page body' }] })
    )
    globalThis.fetch = fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.tavily.com/extract')
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ urls: ['https://example.test/page'] })
    expect(result).toMatchObject({ id: 's1', title: 'The Page', truncated: false, ok: true })
    expect(result.text).toBe(`${PAGE_UNTRUSTED_DATA_LABEL}\npage body`)
  })

  it('picks the matching URL when the backend returns several pages', async () => {
    mocks.provider = 'tavily'
    process.env.TAVILY_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() =>
      json({
        results: [
          { url: 'https://example.test/other', title: 'Other', content: 'other body' },
          { url: 'https://example.test/page', title: 'The Page', content: 'page body' }
        ]
      })
    ).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ title: 'The Page', ok: true })
    expect(result.text).toContain('page body')
  })

  it('truncates past search.maxPageChars and marks the cut', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() =>
      json({ results: [{ url: 'https://example.test/page', title: 'T', text: 'x'.repeat(9000) }] })
    ).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result.truncated).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.text).toBe(`${PAGE_UNTRUSTED_DATA_LABEL}\n${'x'.repeat(8000)}`)
  })

  it('uses the URL as the title when the backend names none', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() =>
      json({ results: [{ url: 'https://example.test/page', text: 'page body' }] })
    ).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ title: 'https://example.test/page', ok: true })
  })

  it('fails a page with no text rather than citing an empty read', async () => {
    mocks.provider = 'tavily'
    process.env.TAVILY_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() => json({ results: [] })).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it.each([402, 429])('maps Exa HTTP %s to the quota message', async (status) => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() => json({}, status)).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: SEARCH_TEXT.quota })
  })

  it('maps other Exa failures to the failed message', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() => json({}, 500)).fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it('maps Tavily HTTP 429 to the quota message and 500 to the failed message', async () => {
    mocks.provider = 'tavily'
    process.env.TAVILY_API_KEY = 'test-key'

    globalThis.fetch = fakeFetch(() => json({}, 429)).fetchImpl
    const [quota] = await readPages([source('s1', 'https://example.test/page')])
    expect(quota).toMatchObject({ ok: false, error: SEARCH_TEXT.quota })

    globalThis.fetch = fakeFetch(() => json({}, 500)).fetchImpl
    const [failed] = await readPages([source('s2', 'https://example.test/page')])
    expect(failed).toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it('reports page reading unavailable with no backend key', async () => {
    mocks.provider = 'exa'
    // biome-ignore lint/performance/noDelete: assigning undefined coerces to "undefined", defeating the guard
    delete process.env.EXA_API_KEY
    const { fetchImpl, calls } = fakeFetch(() => json({ results: [] }))
    globalThis.fetch = fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.unavailable })
    expect(calls).toHaveLength(0)
  })

  it('reports page reading unavailable when search is off', async () => {
    mocks.provider = 'off'

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.unavailable })
  })

  it('refuses private addresses, non-http schemes and unparsable URLs without calling out', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    mocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    const { fetchImpl, calls } = fakeFetch(() => json({ results: [] }))
    globalThis.fetch = fetchImpl

    const results = await readPages([
      source('s1', 'http://127.0.0.1/page'),
      source('s2', 'http://localhost/page'),
      source('s3', 'https://private.test/page'),
      source('s4', 'ftp://files.test/page'),
      source('s5', 'not a url')
    ])

    expect(results.map(({ ok, error }) => ({ ok, error }))).toEqual(
      Array(5).fill({ ok: false, error: PAGE_TEXT.refused })
    )
    expect(calls).toHaveLength(0)
  })

  it('returns the failed message when the signal aborts before the fetch', async () => {
    mocks.provider = 'exa'
    process.env.EXA_API_KEY = 'test-key'
    const { fetchImpl, calls } = fakeFetch(() => json({ results: [] }))
    globalThis.fetch = fetchImpl

    const [result] = await readPages([source('s1', 'https://example.test/page')], {
      signal: AbortSignal.abort()
    })

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.failed })
    expect(calls).toHaveLength(0)
  })

  it('records read pages in the citation sink, and failures record nothing', async () => {
    mocks.provider = 'tavily'
    process.env.TAVILY_API_KEY = 'test-key'
    globalThis.fetch = fakeFetch(() =>
      json({ results: [{ url: 'https://example.test/page', title: 'The Page', content: 'page body' }] })
    ).fetchImpl

    const [, sink] = await withSearchCitations(async () => {
      await readPages([source('s1', 'https://example.test/page')])
      await readPages([source('s2', 'ftp://files.test/page')])
    })

    expect(sink).toEqual([{ title: 'The Page', url: 'https://example.test/page' }])
  })
})

describe('native page reads', () => {
  beforeEach(() => {
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
  })

  afterEach(() => {
    restoreKeys()
    vi.clearAllMocks()
  })

  it('fetches one page with the web_fetch server tool, verbatim URL and thinking off', async () => {
    const { client, create } = fakeClient(
      fetchMessage([
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_fetch', input: { url: 'https://example.test/page' } },
        fetchResult(['page body'])
      ])
    )

    const result = await nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client })

    const body = create.mock.calls[0][0] as Record<string, unknown>
    expect(body.tools).toEqual([{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 1 }])
    expect(body.messages).toEqual([{ role: 'user', content: 'Fetch this page: https://example.test/page' }])
    expect(body.max_tokens).toBe(1024)
    expect(body.model).toBe('claude-haiku-5-5')
    expect(create).toHaveBeenCalledOnce()
    expect(result).toEqual({
      id: 's1',
      url: 'https://example.test/page',
      title: 'https://example.test/page',
      text: `${PAGE_UNTRUSTED_DATA_LABEL}\npage body`,
      truncated: false,
      ok: true
    })
  })

  it('joins the fetched text blocks and keeps the reported title', async () => {
    const { client } = fakeClient(fetchMessage([fetchResult(['first half ', 'second half'], { title: 'The Page' })]))

    const result = await nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client })

    expect(result).toMatchObject({ title: 'The Page', ok: true })
    expect(result.text).toBe(`${PAGE_UNTRUSTED_DATA_LABEL}\nfirst half \nsecond half`)
  })

  it('maps too_many_requests to the quota message and other error codes to failed', async () => {
    const { client: quotaClient } = fakeClient(
      fetchMessage([
        { type: 'web_fetch_tool_result', tool_use_id: 'srvtoolu_1', content: { error_code: 'too_many_requests' } }
      ])
    )
    const { client: failedClient } = fakeClient(
      fetchMessage([
        { type: 'web_fetch_tool_result', tool_use_id: 'srvtoolu_1', content: { error_code: 'unavailable' } }
      ])
    )

    await expect(
      nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client: quotaClient })
    ).resolves.toMatchObject({ ok: false, error: SEARCH_TEXT.quota })
    await expect(
      nativeReadPage(anthropicRoute(), source('s2', 'https://example.test/page'), { client: failedClient })
    ).resolves.toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it('fails when the fetch returns no text', async () => {
    const { client } = fakeClient(fetchMessage([{ type: 'text', text: 'no fetch ran' }]))

    await expect(
      nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client })
    ).resolves.toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it('maps a refusal to the failed message', async () => {
    const { client } = fakeClient(fetchMessage([{ type: 'text', text: '' }], { stop_reason: 'refusal' }))

    await expect(
      nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client })
    ).resolves.toMatchObject({ ok: false, error: PAGE_TEXT.failed })
  })

  it('maps HTTP 429 to the quota message', async () => {
    const create = vi.fn().mockRejectedValue(APIError.generate(429, {}, 'boom 429', new Headers()))
    const client = { messages: { create } } as unknown as AnthropicMessagesClient

    await expect(
      nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), { client })
    ).resolves.toMatchObject({ ok: false, error: SEARCH_TEXT.quota })
    expect(mocks.warn).toHaveBeenCalledOnce()
  })

  it('returns the failed message when the signal aborts before the request', async () => {
    const { client, create } = fakeClient(fetchMessage([fetchResult(['page body'])]))

    const result = await nativeReadPage(anthropicRoute(), source('s1', 'https://example.test/page'), {
      client,
      signal: AbortSignal.abort()
    })

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.failed })
    expect(create).not.toHaveBeenCalled()
  })

  it('reports page reading unavailable on a non-Anthropic main', async () => {
    const { client } = fakeClient(fetchMessage([fetchResult(['page body'])]))

    const result = await nativeReadPage(geminiRoute(), source('s1', 'https://example.test/page'), { client })

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.unavailable })
  })

  it('routes readPages on native through the configured main, which the legacy route leaves on Gemini', async () => {
    mocks.provider = 'native'

    const [result] = await readPages([source('s1', 'https://example.test/page')])

    expect(result).toMatchObject({ ok: false, error: PAGE_TEXT.unavailable })
  })
})
