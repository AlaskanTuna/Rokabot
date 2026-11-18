import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  lookup: vi.fn()
}))

vi.mock('../../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../../../../searchSettings.js', () => ({
  searchProviderSetting: () => 'exa',
  searchIsAvailable: () => true
}))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))

import { fakeFetch, json } from '../../../../../tests/harness/fakeFetch.js'
import { closeDb } from '../../../../storage/database.js'
import { __resetBudgetsForTest } from '../../../llm/budget.js'
import { withSearchSources } from '../../../searchSources.js'
import { searchWeb } from '../../searchWeb.js'
import { withTurnBudget } from '../turnBudget.js'

const PUBLIC_ANSWER = [{ address: '93.184.216.34', family: 4 }]

const originalFetch = globalThis.fetch
const originalKey = process.env.EXA_API_KEY

interface SearchHit {
  title: string
  url: string
  highlights: string[]
}

let searchReplies: SearchHit[][]
let contentBodies: Record<string, { title: string; text: string }>
let searchQueries: string[]
let contentUrls: string[]

function installFetch() {
  const { fetchImpl, calls } = fakeFetch(({ url, init }) => {
    if (url === 'https://api.exa.ai/search') {
      const body = JSON.parse(init.body as string) as { query: string }
      searchQueries.push(body.query)
      const hits = searchReplies.shift() ?? []
      return json({
        results: hits.map(({ title, url: hitUrl, highlights }) => ({ title, url: hitUrl, highlights }))
      })
    }
    if (url === 'https://api.exa.ai/contents') {
      const body = JSON.parse(init.body as string) as { urls: string[] }
      const target = body.urls[0] as string
      contentUrls.push(target)
      const page = contentBodies[target]
      if (!page) return json({ results: [] })
      return json({ results: [{ url: target, title: page.title, text: page.text }] })
    }
    throw new Error(`unexpected fetch to ${url}`)
  })
  globalThis.fetch = fetchImpl
  return calls
}

function scoped<T>(run: () => Promise<T>): Promise<T> {
  return withSearchSources(() => withTurnBudget(run))
}

describe('runLookup brief', () => {
  beforeEach(() => {
    process.env.EXA_API_KEY = 'test-key'
    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue(PUBLIC_ANSWER)
    closeDb()
    __resetBudgetsForTest()
    vi.clearAllMocks()
    searchReplies = []
    contentBodies = {}
    searchQueries = []
    contentUrls = []
    installFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined"
    if (originalKey === undefined) delete process.env.EXA_API_KEY
    else process.env.EXA_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('returns the first search untouched when every field is covered on it', async () => {
    searchReplies = [
      [
        {
          title: 'Hoshino menu',
          url: 'https://example.test/hoshino',
          highlights: ['The hotcake set is ¥1,100 at Hoshino Coffee.']
        }
      ]
    ]

    const result = await scoped(() => searchWeb({ query: 'price of the hotcake set', fields: ['price'] }))

    expect(searchQueries).toEqual(['price of the hotcake set'])
    expect(contentUrls).toEqual([])
    expect(result.answer).not.toContain('Still missing')
    expect(result).toEqual({
      answer: result.answer,
      results: [
        {
          title: 'Hoshino menu',
          url: 'https://example.test/hoshino',
          snippet: 'The hotcake set is ¥1,100 at Hoshino Coffee.'
        }
      ],
      resultCount: 1
    })
  })

  it('briefs with Still missing when the first search falls short and its page read finds nothing', async () => {
    searchReplies = [
      [
        {
          title: 'Marufuku Coffee',
          url: 'https://example.test/marufuku',
          highlights: ['Old coffee shop in Osaka.']
        }
      ]
    ]

    const result = await scoped(() => searchWeb({ query: 'menu of coffee marufuku', fields: ['menu items'] }))

    expect(searchQueries).toEqual(['menu of coffee marufuku'])
    expect(contentUrls).toEqual(['https://example.test/marufuku'])
    expect(result.answer).toContain('[s1] Marufuku Coffee')
    expect(result.answer).toContain('Still missing: menu items.')
  })

  it('reads a menu-specific page before a generic same-host page', async () => {
    searchReplies = [
      [
        {
          title: 'Marufuku Sennichimae branch',
          url: 'https://branch.example.test/sennichimae',
          highlights: ['Old shop.']
        },
        {
          title: 'Drink menu',
          url: 'https://menu.example.test/menu',
          highlights: ['See the menu page.']
        }
      ]
    ]
    contentBodies = {
      'https://menu.example.test/menu': {
        title: 'Marufuku drink menu',
        text: 'ブレンドコーヒー 680円\nアイスコーヒー 550円\nホットケーキ 700円'
      }
    }

    const result = await scoped(() =>
      searchWeb({ query: 'menu of coffee marufuku', fields: ['menu items', 'drink prices'] })
    )

    expect(contentUrls).toEqual(['https://menu.example.test/menu'])
    expect(result.answer).not.toContain('Still missing')
    expect(result.answer).toContain('ブレンドコーヒー')
  })

  it('still returns the cited partial evidence when every page read fails', async () => {
    searchReplies = [
      [
        {
          title: 'Marufuku Coffee',
          url: 'https://example.test/marufuku',
          highlights: ['Hot Coffee (680 yen), almond au lait.']
        }
      ]
    ]

    const result = await scoped(() => searchWeb({ query: 'drinks at marufuku', fields: ['drink prices'] }))

    expect(contentUrls).toHaveLength(1)
    expect(result.answer).toContain('[s1] Marufuku Coffee')
    expect(result.answer).toContain('Hot Coffee')
    expect(result.answer).toContain('Still missing: drink prices.')
  })

  it('keeps list entries whole when the brief is capped', async () => {
    searchReplies = [
      [
        {
          title: 'Old shop',
          url: 'https://example.test/shop',
          highlights: ['Old shop in Osaka.']
        }
      ]
    ]
    const lines = Array.from({ length: 300 }, (_, index) => `Dish ${index} curry rice`)
    const text = lines.join('\n')
    contentBodies = { 'https://example.test/shop': { title: 'Old shop menu', text } }

    const result = await scoped(() =>
      searchWeb({ query: 'menu of the old shop', fields: ['menu items', 'drink prices'] })
    )

    expect(result.answer.length).toBeLessThanOrEqual(4000)
    expect(result.answer).toContain('Still missing: drink prices.')
    const evidence = result.answer.split('Still missing:')[0] as string
    for (const line of evidence.split('\n')) {
      if (line.startsWith('[') || line.trim() === '' || !line.includes('curry')) continue
      expect(lines).toContain(line)
    }
  })
})
