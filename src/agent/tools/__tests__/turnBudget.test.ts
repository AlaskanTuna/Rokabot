import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  tavilySearch: vi.fn(),
  exaSearch: vi.fn()
}))

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: mocks.debug, info: mocks.info, warn: mocks.warn }
}))
vi.mock('../search/tavily.js', () => ({ tavilySearch: mocks.tavilySearch }))
vi.mock('../search/exa.js', () => ({ exaSearch: mocks.exaSearch }))

import { withSearchAttempt } from '../search/attemptBudget.js'
import { timeLeftForLookupMs, trySpend, withTurnBudget } from '../search/turnBudget.js'
import { SEARCH_TEXT } from '../search/types.js'
import { searchWeb } from '../searchWeb.js'

const SUCCESS = {
  answer: 'It premiered in January.',
  results: [{ title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', snippet: 'a' }],
  resultCount: 1,
  succeeded: true
}

describe('turn lookup budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tavilySearch.mockResolvedValue(SUCCESS)
    mocks.exaSearch.mockResolvedValue(SUCCESS)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('admits two searches per turn, then refuses', () => {
    withTurnBudget(() => {
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(false)
    })
  })

  it('admits two page reads per turn, then refuses', () => {
    withTurnBudget(() => {
      expect(trySpend('pageRead')).toBe(true)
      expect(trySpend('pageRead')).toBe(true)
      expect(trySpend('pageRead')).toBe(false)
    })
  })

  it('caps provider calls in total across searches and page reads', () => {
    withTurnBudget(() => {
      expect(trySpend('search')).toBe(true)
      expect(trySpend('pageRead')).toBe(true)
      expect(trySpend('pageRead')).toBe(true)

      // One search and two reads spent the three provider calls, so even an unspent kind is refused.
      expect(trySpend('search')).toBe(false)
      expect(trySpend('pageRead')).toBe(false)
    })
  })

  it('stays open with no turn scope, for prefetch and unit tests', () => {
    expect(trySpend('search')).toBe(true)
    expect(trySpend('pageRead')).toBe(true)
  })

  it('resets per turn, not per attempt: retries share what the first attempt spent', () => {
    withTurnBudget(() => {
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(true)

      const attempt = { deadlineAtMs: performance.now() + 20_000, signal: new AbortController().signal }
      withSearchAttempt(attempt, () => expect(trySpend('search')).toBe(false))
      withSearchAttempt(attempt, () => expect(trySpend('search')).toBe(false))
    })

    withTurnBudget(() => {
      expect(trySpend('search')).toBe(true)
    })
  })

  it('reports no time without an attempt in scope', () => {
    expect(timeLeftForLookupMs()).toBeNull()
  })

  it('reports the attempt time left minus the reply reserve', () => {
    const attempt = { deadlineAtMs: 10_000, signal: new AbortController().signal }

    withSearchAttempt(attempt, () => {
      // reserve is 6000: 10000 - 1000 - 6000.
      expect(timeLeftForLookupMs(1000)).toBe(3000)
    })
  })
})

describe('searchWeb under the turn budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tavilySearch.mockResolvedValue(SUCCESS)
    mocks.exaSearch.mockResolvedValue(SUCCESS)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches twice, then answers the third call with what the turn already has', async () => {
    await withTurnBudget(async () => {
      await expect(searchWeb({ query: 'one' })).resolves.toMatchObject({ answer: SUCCESS.answer })
      await expect(searchWeb({ query: 'two' })).resolves.toMatchObject({ answer: SUCCESS.answer })

      await expect(searchWeb({ query: 'three' })).resolves.toEqual({
        answer: SEARCH_TEXT.budgetSpent,
        results: [],
        resultCount: 0
      })
    })

    expect(mocks.tavilySearch).toHaveBeenCalledTimes(2)
  })

  it('never throws when the budget is spent, so the attempt cannot fail on it', async () => {
    await withTurnBudget(async () => {
      await searchWeb({ query: 'one' })
      await searchWeb({ query: 'two' })

      await expect(searchWeb({ query: 'three' })).resolves.not.toThrow()
    })
  })

  it('stops a search when the attempt has no time left past the reserve', async () => {
    const spent = { deadlineAtMs: 1, signal: new AbortController().signal }

    await withTurnBudget(async () => {
      await withSearchAttempt(spent, async () => {
        await expect(searchWeb({ query: 'q' })).resolves.toEqual({
          answer: SEARCH_TEXT.budgetSpent,
          results: [],
          resultCount: 0
        })
      })
    })

    expect(mocks.tavilySearch).not.toHaveBeenCalled()
  })

  it('searches on when the attempt has time left', async () => {
    const attempt = { deadlineAtMs: performance.now() + 20_000, signal: new AbortController().signal }

    await withTurnBudget(async () => {
      await withSearchAttempt(attempt, async () => {
        await expect(searchWeb({ query: 'q' })).resolves.toMatchObject({ answer: SUCCESS.answer })
      })
    })

    expect(mocks.tavilySearch).toHaveBeenCalledOnce()
  })
})
