import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// config reads the key at import, so it is set before any module that loads config.
vi.hoisted(() => {
  process.env.SERPAPI_API_KEY = 'test-key'
})
import { fakeFetch, json } from '../../../../tests/harness/fakeFetch.js'
import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import { registerTurnImages, withTurnImages } from '../../media/turnImages.js'
import { resolveSource, withSearchSources } from '../../searchSources.js'
import { LENS_EXHAUSTED_TEXT, identifyImage } from '../imageId/identifyImage.js'
import { lensCacheKey, recordLensSearch, storeLens } from '../imageId/lensLedger.js'
import { trySpend, withTurnBudget } from '../search/turnBudget.js'
import { SEARCH_TEXT } from '../search/types.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.unstubAllEnvs()
  vi.resetModules()
})

function scopes<T>(imageUrl: string, run: () => T): T {
  return withTurnBudget(() =>
    withSearchSources(() =>
      withTurnImages(() => {
        registerTurnImages([{ url: imageUrl, contentType: 'image/png' }])
        return run()
      })
    )
  )
}

describe('identify_image', () => {
  it('refuses an unknown attachment index without a provider call', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [] }))
    const answer = await withTurnBudget(() => withTurnImages(() => identifyImage({ attachment: 2 }, fetchImpl)))
    expect(answer).toContain('no image 2')
    expect(calls).toHaveLength(0)
    // The refusal spent nothing: a fresh turn still has both of its searches.
    await withTurnBudget(async () => {
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(true)
    })
  })

  it('returns the budget text without a call when the budget is spent', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [] }))
    const answer = await scopes('https://cdn.example/p.jpg', async () => {
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(true)
      return identifyImage({ attachment: 1 }, fetchImpl)
    })
    expect(answer).toBe(SEARCH_TEXT.budgetSpent)
    expect(calls).toHaveLength(0)
  })

  it('registers match links as sources and returns [sN] lines', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({
        visual_matches: [
          { title: 'Roka Nendoroid', link: 'https://shop.example/roka', source: 'Shop' },
          { title: 'Roka figure', link: 'https://wiki.example/roka', source: 'Wiki' }
        ]
      })
    )
    const { answer, first, second } = await scopes('https://cdn.example/p.jpg', async () => ({
      answer: await identifyImage({ attachment: 1 }, fetchImpl),
      first: resolveSource('s1'),
      second: resolveSource('s2')
    }))
    expect(calls).toHaveLength(1)
    expect(answer).toContain('[s1] Roka Nendoroid (Shop)')
    expect(answer).toContain('[s2] Roka figure (Wiki)')
    expect(first).toBe('https://shop.example/roka')
    expect(second).toBe('https://wiki.example/roka')
  })

  it('says there are no matches when Lens has none', async () => {
    const { fetchImpl } = fakeFetch(() => json({ visual_matches: [] }))
    const answer = await scopes('https://cdn.example/p.jpg', () => identifyImage({}, fetchImpl))
    expect(answer).toContain('No reverse-image matches')
  })

  it('refuses with plain text when the ledger is spent, without a provider call', async () => {
    const now = Date.now()
    for (let index = 0; index < config.imageId.monthlyCap; index++) recordLensSearch('model', now)
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const answer = await scopes('https://cdn.example/capped.jpg', () => identifyImage({ attachment: 1 }, fetchImpl))
    expect(answer).toBe(LENS_EXHAUSTED_TEXT)
    expect(calls).toHaveLength(0)
  })

  it('rebuilds cached matches with fresh source ids, with no fetch and no budget spend', async () => {
    const url = 'https://cdn.discordapp.com/attachments/1/9/p.png'
    storeLens(
      lensCacheKey(url),
      JSON.stringify([{ title: 'Kita Ikuyo', link: 'https://wiki.example/kita', source: 'Wiki' }])
    )
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const { answer, resolved } = await scopes(url, async () => {
      const cached = await identifyImage({ attachment: 1 }, fetchImpl)
      // The cached answer spent nothing: a fresh turn still has both of its searches.
      expect(trySpend('search')).toBe(true)
      expect(trySpend('search')).toBe(true)
      return { answer: cached, resolved: resolveSource('s1') }
    })
    expect(answer).toContain('[s1] Kita Ikuyo (Wiki)')
    expect(resolved).toBe('https://wiki.example/kita')
    expect(calls).toHaveLength(0)
  })

  it('is offered only when SERPAPI_API_KEY is set', async () => {
    vi.resetModules()
    vi.stubEnv('SERPAPI_API_KEY', '')
    const without = await import('../index.js')
    expect(without.rokaTools.map((tool) => tool.name)).not.toContain('identify_image')

    vi.resetModules()
    vi.stubEnv('SERPAPI_API_KEY', 'test-key')
    const withKey = await import('../index.js')
    expect(withKey.rokaTools.map((tool) => tool.name)).toContain('identify_image')
  }, 20_000)
})
