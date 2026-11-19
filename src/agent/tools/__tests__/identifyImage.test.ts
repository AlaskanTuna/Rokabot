import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gateMocks = vi.hoisted(() => ({ judgeImageLookup: vi.fn() }))

vi.mock('../imageId/lookupGate.js', () => ({ judgeImageLookup: gateMocks.judgeImageLookup }))

// config reads the key at import, so it is set before any module that loads config.
vi.hoisted(() => {
  process.env.SERPAPI_API_KEY = 'test-key'
})
import { fakeFetch, json } from '../../../../tests/harness/fakeFetch.js'
import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import { registerTurnImages, withTurnImages, withTurnSpeakerText } from '../../media/turnImages.js'
import { resolveSource, withSearchSources } from '../../searchSources.js'
import {
  GATE_UNAVAILABLE_TEXT,
  LENS_EXHAUSTED_TEXT,
  REAL_PERSON_REFUSAL_TEXT,
  identifyImage
} from '../imageId/identifyImage.js'
import { lensCacheKey, recordLensSearch, storeLens } from '../imageId/lensLedger.js'
import { judgeImageLookup } from '../imageId/lookupGate.js'
import { trySpend, withTurnBudget } from '../search/turnBudget.js'
import { SEARCH_TEXT } from '../search/types.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
  gateMocks.judgeImageLookup.mockReset()
  // Existing tests drive the tool directly and expect a Lens answer: the gate clears them by default.
  gateMocks.judgeImageLookup.mockResolvedValue({ asks: true, target: 1, subject: 'figure_or_merch' })
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
      withTurnImages(() =>
        withTurnSpeakerText('who is this', () => {
          registerTurnImages([{ url: imageUrl, contentType: 'image/png' }])
          return run()
        })
      )
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

describe('identify_image model-path privacy gate', () => {
  function mockVerdict(verdict: unknown) {
    vi.mocked(judgeImageLookup).mockResolvedValue(verdict as never)
  }

  it('refuses a real person with zero Lens fetches', async () => {
    mockVerdict({ asks: true, target: 1, subject: 'real_person' })
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const answer = await scopes('https://cdn.example/selfie.jpg', () =>
      identifyImage({ attachment: 1 }, fetchImpl, 'model')
    )
    expect(answer).toBe(REAL_PERSON_REFUSAL_TEXT)
    expect(calls).toHaveLength(0)
    expect(judgeImageLookup).toHaveBeenCalledOnce()
  })

  it('looks up a pictured thing the gate clears', async () => {
    mockVerdict({ asks: true, target: 1, subject: 'figure_or_merch' })
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Roka Nendoroid', link: 'https://shop.example/r', source: 'Shop' }] })
    )
    const answer = await scopes('https://cdn.example/p.jpg', () => identifyImage({ attachment: 1 }, fetchImpl, 'model'))
    expect(answer).toContain('Roka Nendoroid')
    expect(calls).toHaveLength(1)
  })

  it('fails closed when the gate errors', async () => {
    vi.mocked(judgeImageLookup).mockResolvedValue(null)
    const errored = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const refused = await scopes('https://cdn.example/p.jpg', () =>
      identifyImage({ attachment: 1 }, errored.fetchImpl, 'model')
    )
    expect(refused).toBe(GATE_UNAVAILABLE_TEXT)
    expect(errored.calls).toHaveLength(0)

    vi.mocked(judgeImageLookup).mockRejectedValue(new Error('gate is down'))
    const thrown = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const refusedThrow = await scopes('https://cdn.example/p.jpg', () =>
      identifyImage({ attachment: 1 }, thrown.fetchImpl, 'model')
    )
    expect(refusedThrow).toBe(GATE_UNAVAILABLE_TEXT)
    expect(thrown.calls).toHaveLength(0)
  })

  it('does not screen the automatic path, which the plan already gated', async () => {
    mockVerdict({ asks: true, target: 1, subject: 'real_person' })
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Roka Nendoroid', link: 'https://shop.example/r', source: 'Shop' }] })
    )
    const answer = await scopes('https://cdn.example/p.jpg', () => identifyImage({ attachment: 1 }, fetchImpl, 'auto'))
    expect(answer).toContain('Roka Nendoroid')
    expect(calls).toHaveLength(1)
    expect(judgeImageLookup).not.toHaveBeenCalled()
  })
})
