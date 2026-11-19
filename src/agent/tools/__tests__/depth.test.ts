import type { CallbackContext, LlmRequest } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  lookup: vi.fn()
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../../../searchSettings.js', () => ({
  searchProviderSetting: () => 'tavily',
  searchIsAvailable: () => true
}))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

import { fakeFetch, json } from '../../../../tests/harness/fakeFetch.js'
import { closeDb } from '../../../storage/database.js'
import { __resetBudgetsForTest } from '../../llm/budget.js'
import { rokaAgent, steeringForRequest } from '../../roka.js'
import { registerMessageSources, registerSources, withSearchSources } from '../../searchSources.js'
import { rokaTools } from '../index.js'
import { withSearchAttempt } from '../search/attemptBudget.js'
import { assessField } from '../search/coverage.js'
import { LOOKUP_TEXT, runLookup } from '../search/depth.js'
import { didReadPage, readPages, withPageReadFlag } from '../search/readPages.js'
import { withTurnBudget } from '../search/turnBudget.js'
import { SEARCH_TEXT, type SearchField, type SearchWebParams } from '../search/types.js'
import { searchWeb } from '../searchWeb.js'

const PUBLIC_ANSWER = [{ address: '93.184.216.34', family: 4 }]

const originalFetch = globalThis.fetch
const originalKey = process.env.TAVILY_API_KEY

interface SearchHit {
  title: string
  url: string
  content: string
}

let searchReplies: Array<{ answer: string; results: SearchHit[] }>
let extractBodies: Record<string, { title: string; content: string } | 'slow-miss'>
let searchQueries: string[]
let extractUrls: string[]

function tavilySearchBody(answer: string, results: SearchHit[]): unknown {
  return {
    answer,
    results: results.map(({ title, url, content }) => ({ title, url, content, score: 1 })),
    response_time: 1
  }
}

function installFetch() {
  const { fetchImpl } = fakeFetch(({ url, init }) => {
    if (url === 'https://api.tavily.com/search') {
      const body = JSON.parse(init.body as string) as { query: string }
      searchQueries.push(body.query)
      const reply = searchReplies.shift() ?? { answer: 'No summary available.', results: [] }
      return json(tavilySearchBody(reply.answer, reply.results))
    }
    if (url === 'https://api.tavily.com/extract') {
      const body = JSON.parse(init.body as string) as { urls: string[] }
      const target = body.urls[0] as string
      extractUrls.push(target)
      const page = extractBodies[target]
      // A slow miss: the fetch outlives the attempt, so the loop stops on the deadline with a partial brief.
      if (page === 'slow-miss') {
        return new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                json({ results: [{ url: target, title: 'Slow page', content: 'open daily, see the menu page' }] })
              ),
            800
          )
        })
      }
      if (!page) return json({ results: [] })
      return json({ results: [{ url: target, title: page.title, content: page.content }] })
    }
    throw new Error(`unexpected fetch to ${url}`)
  })
  globalThis.fetch = fetchImpl
}

function scoped<T>(run: () => Promise<T>): Promise<T> {
  return withSearchSources(() => withTurnBudget(run))
}

const MENU_HIT: SearchHit = {
  title: 'Coffee Marufuku Menu',
  url: 'https://example.test/marufuku/menu',
  content: 'Osaka coffee shop. See the menu page for details.'
}

describe('runLookup search path', () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
    searchReplies = []
    extractBodies = {}
    searchQueries = []
    extractUrls = []
    installFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('returns a cited brief and reads one page even when the first search covers every field', async () => {
    searchReplies = [
      {
        answer: 'The hotcake set is ¥1,100 at Hoshino Coffee.',
        results: [{ title: 'Hoshino menu', url: 'https://example.test/hoshino', content: 'hotcake set ¥1,100' }]
      }
    ]
    extractBodies = {
      'https://example.test/hoshino': {
        title: 'Hoshino menu',
        content: 'The hotcake set is ¥1,100 at Hoshino Coffee. Hot coffee ¥600, iced latte ¥650.'
      }
    }

    const field: SearchField = { kind: 'price', subject: 'hotcake set' }
    const result = await scoped(() =>
      searchWeb({
        query: 'price of the hotcake set at hoshino coffee',
        fields: [field],
        local_query: '星乃珈琲 ホットケーキ 値段'
      })
    )

    expect(searchQueries).toEqual(['price of the hotcake set at hoshino coffee'])
    expect(extractUrls).toEqual(['https://example.test/hoshino'])
    expect(result.answer).not.toContain('Still missing')
    expect(result.answer).toContain('[s1]')
    expect(result.answer).toContain('hotcake set')
  })

  it('runs the local query and then a page read when a field is missing', async () => {
    searchReplies = [
      { answer: 'Coffee Marufuku is in Osaka.', results: [MENU_HIT] },
      {
        answer: 'コーヒー丸福は大阪にあります。',
        results: [{ title: '丸福メニュー', url: 'https://example.test/marufuku/menu', content: 'ドリンクメニュー' }]
      }
    ]
    extractBodies = {
      'https://example.test/marufuku/menu': {
        title: 'Marufuku drinks',
        content: 'ブレンド ¥500 アイスコーヒー ¥550 ドリンクメニュー'
      }
    }

    const result = await scoped(() =>
      searchWeb({
        query: 'menu of coffee marufuku osaka',
        fields: [{ kind: 'price', subject: 'drinks' }],
        local_query: 'コーヒー丸福 メニュー 値段'
      })
    )

    expect(searchQueries).toEqual(['menu of coffee marufuku osaka', 'コーヒー丸福 メニュー 値段'])
    expect(extractUrls).toEqual(['https://example.test/marufuku/menu'])
    expect(result.answer).toContain('¥500')
    expect(result.answer).toContain('[s1] Marufuku drinks')
    expect(result.answer).not.toContain('Still missing')
  })

  it('gives a partial brief with Still missing when the budget is spent mid-loop', async () => {
    searchReplies = [
      { answer: 'Coffee Marufuku is in Osaka.', results: [MENU_HIT] },
      {
        answer: 'コーヒー丸福は大阪にあります。',
        results: [{ title: 'Marufuku shop', url: 'https://example.test/marufuku/shop', content: 'shop guide' }]
      }
    ]
    extractBodies = {
      'https://example.test/marufuku/menu': { title: 'Marufuku drinks', content: 'open daily, see the menu page' }
    }

    // Two searches and one read spend the three provider calls; the second read is refused.
    const result = await scoped(() =>
      searchWeb({
        query: 'menu of coffee marufuku osaka',
        fields: [{ kind: 'price', subject: 'drinks' }],
        local_query: 'コーヒー丸福 メニュー 値段'
      })
    )

    expect(searchQueries).toHaveLength(2)
    expect(extractUrls).toHaveLength(1)
    expect(result.answer).toContain('Still missing: drinks.')
  })

  it('gives a partial brief when the deadline arrives mid-loop', async () => {
    searchReplies = [
      { answer: 'Coffee Marufuku is in Osaka.', results: [MENU_HIT] },
      { answer: 'コーヒー丸福は大阪にあります。', results: [MENU_HIT] }
    ]
    extractBodies = { 'https://example.test/marufuku/menu': 'slow-miss' }
    // Past the 6 s reply reserve, so the searches run, but the 800 ms read crosses the deadline.
    const attempt = { deadlineAtMs: performance.now() + 6300, signal: new AbortController().signal }

    // One plain search, without fields or source, so searchWeb never re-enters the loop.
    const single = async (params: SearchWebParams) => {
      const outcome = await searchWeb({
        query: params.query,
        ...(params.signal ? { signal: params.signal } : {})
      })
      const failed = [SEARCH_TEXT.budgetSpent, SEARCH_TEXT.failed, SEARCH_TEXT.quota, SEARCH_TEXT.notConfigured]
      return { ...outcome, succeeded: !failed.includes(outcome.answer) }
    }

    const result = await withSearchSources(() =>
      withTurnBudget(() =>
        withSearchAttempt(attempt, () =>
          runLookup(
            {
              query: 'menu of coffee marufuku osaka',
              fields: [{ kind: 'price', subject: 'drinks' }],
              local_query: 'コーヒー丸福 メニュー 値段'
            },
            single
          )
        )
      )
    )

    expect(result.answer).toContain('Still missing: drinks.')
  })

  it('caps the brief at search.maxBriefChars', async () => {
    searchReplies = [{ answer: 'Coffee Marufuku is in Osaka.', results: [MENU_HIT] }]
    extractBodies = {
      'https://example.test/marufuku/menu': { title: 'Marufuku drinks', content: `ブレンド ¥500 ${'x'.repeat(9000)}` }
    }

    const result = await scoped(() =>
      searchWeb({ query: 'menu of coffee marufuku osaka', fields: [{ kind: 'price', subject: 'drinks' }] })
    )

    expect(result.answer.length).toBeLessThanOrEqual(4000)
    expect(result.answer).toContain('¥500')
  })
})

describe('runLookup source path', () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
    searchReplies = []
    extractBodies = {}
    searchQueries = []
    extractUrls = []
    installFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('reads a source id registered from the message', async () => {
    extractBodies = {
      'https://example.test/marufuku/menu': { title: 'Marufuku drinks', content: 'ブレンド ¥500 ドリンクメニュー' }
    }

    const result = await scoped(async () => {
      registerMessageSources('look at https://example.test/marufuku/menu')
      return searchWeb({ query: 'what is on this menu?', source: 's1', fields: [{ kind: 'price', subject: 'drinks' }] })
    })

    expect(searchQueries).toEqual([])
    expect(extractUrls).toEqual(['https://example.test/marufuku/menu'])
    expect(result.answer).toContain('[s1] Marufuku drinks')
    expect(result.answer).toContain('¥500')
  })

  it('refuses an unregistered URL without calling out', async () => {
    const result = await scoped(() => searchWeb({ query: 'q', source: 'https://unregistered.test/x' }))

    expect(result.answer).toBe(LOOKUP_TEXT.unknownSource)
    expect(searchQueries).toEqual([])
    expect(extractUrls).toEqual([])
  })

  it('refuses an unknown source id without calling out', async () => {
    const result = await scoped(() => searchWeb({ query: 'q', source: 's99' }))

    expect(result.answer).toBe(LOOKUP_TEXT.unknownSource)
    expect(searchQueries).toEqual([])
    expect(extractUrls).toEqual([])
  })

  it('refuses a social URL with the note that the post was already read', async () => {
    const result = await scoped(async () => {
      registerMessageSources('look at https://x.com/someone/status/1234567890123456789')
      return searchWeb({ query: 'what does this post say?', source: 's1' })
    })

    expect(result.answer).toBe(LOOKUP_TEXT.socialSource)
    expect(searchQueries).toEqual([])
    expect(extractUrls).toEqual([])
  })
})

describe('assessField', () => {
  const one = (body: string) => [{ sourceId: 's1', heading: 'Title', body }]

  it('covers English fields per passage, and no longer trusts a menu title alone', () => {
    expect(assessField({ kind: 'price', subject: 'hotcake set' }, one('The hotcake set is ¥1,100.')).covered).toBe(true)
    // The Tripadvisor "See our menu" positive is now reported missing: the title carries no items.
    expect(assessField({ kind: 'list', subject: 'menu items' }, one('See our menu for details.')).covered).toBe(false)
    expect(assessField({ kind: 'other', subject: 'opening hours' }, one('We are open daily.')).covered).toBe(true)
    expect(assessField({ kind: 'other', subject: 'drinks' }, one('Try the morning coffee blend.')).covered).toBe(true)
  })

  it('covers Japanese pages through the hint table, one passage at a time', () => {
    expect(assessField({ kind: 'price', subject: 'ブレンド' }, one('ブレンド ¥500')).covered).toBe(true)
    // A category price field needs two distinct pairs; one pair leaves it missing.
    expect(assessField({ kind: 'price', subject: 'drinks' }, one('ブレンド ¥500')).covered).toBe(false)
    expect(assessField({ kind: 'list', subject: 'menu items' }, one('ドリンクメニュー')).covered).toBe(false)
    expect(assessField({ kind: 'hours', subject: 'opening hours' }, one('営業時間 9:00-22:00')).covered).toBe(true)
  })

  it('leaves genuinely missing fields uncovered', () => {
    expect(assessField({ kind: 'price', subject: 'drinks' }, one('Coffee Marufuku is in Osaka.')).covered).toBe(false)
    expect(assessField({ kind: 'other', subject: 'price' }, one('The hotcakes are fluffy.')).covered).toBe(false)
  })
})

describe('side-effect tools after a page read', () => {
  const context = { state: { get: () => 'a prompt' } } as unknown as CallbackContext
  const callback = rokaAgent.beforeModelCallback as (params: {
    context: CallbackContext
    request: LlmRequest
  }) => Promise<unknown>

  function requestWithEveryTool() {
    return {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: {
        tools: [{ functionDeclarations: rokaTools.map((tool) => tool._getDeclaration()) as Array<{ name?: string }> }]
      },
      toolsDict: Object.fromEntries(rokaTools.map((tool) => [tool.name, tool]))
    } as unknown as LlmRequest
  }

  const declaredNames = (request: LlmRequest) =>
    (request.config?.tools as Array<{ functionDeclarations?: Array<{ name?: string }> }>).flatMap(
      (tool) => tool.functionDeclarations?.map(({ name }) => name ?? '') ?? []
    )

  const WITHHELD = ['remember_user', 'forget_user', 'set_reminder', 'cancel_reminder']

  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
    extractBodies = {
      'https://example.test/page': { title: 'The Page', content: 'page body' }
    }
    installFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('withholds memory and reminder writes once readPages has returned page text', async () => {
    const request = requestWithEveryTool()

    await withSearchSources(() =>
      withPageReadFlag(async () => {
        registerSources(['https://example.test/page'], 'message')
        await readPages([{ id: 's1', url: 'https://example.test/page' }])
        expect(didReadPage()).toBe(true)
        await steeringForRequest.run({ memoryScope: 'full' }, () => callback({ context, request }))
      })
    )

    for (const name of WITHHELD) {
      expect(declaredNames(request)).not.toContain(name)
      expect(request.toolsDict[name]).toBeUndefined()
    }
    expect(request.toolsDict.list_reminders).toBeDefined()
  })

  it('offers them when no page was read', async () => {
    const request = requestWithEveryTool()

    await withPageReadFlag(async () => {
      expect(didReadPage()).toBe(false)
      await steeringForRequest.run({ memoryScope: 'full' }, () => callback({ context, request }))
    })

    for (const name of WITHHELD) expect(declaredNames(request)).toContain(name)
  })
})
