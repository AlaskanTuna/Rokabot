import { describe, expect, it } from 'vitest'
import { fakeFetch, hangingFetch, json } from '../../../../tests/harness/fakeFetch.js'
import { lookupLensImage, parseLensMatches } from '../imageId/lens.js'

const OPTIONS = { apiKey: 'key', timeoutMs: 1000, maxMatches: 5 }

function lensJson(matches: unknown[]): unknown {
  return { visual_matches: matches }
}

describe('lens client', () => {
  it('parses visual matches, skipping title-less entries', () => {
    expect(
      parseLensMatches(
        lensJson([
          { title: 'Roka Nendoroid', link: 'https://shop.example/roka', source: 'Shop' },
          { link: 'https://shop.example/nameless' },
          { title: 'Roka figure' }
        ]),
        5
      )
    ).toEqual([
      { title: 'Roka Nendoroid', link: 'https://shop.example/roka', source: 'Shop' },
      { title: 'Roka figure' }
    ])
  })

  it('caps matches at maxMatches in Lens order', () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json(
        lensJson([
          { title: 'One', link: 'https://a.example/1' },
          { title: 'Two', link: 'https://a.example/2' },
          { title: 'Three', link: 'https://a.example/3' }
        ])
      )
    )
    return lookupLensImage('https://cdn.example/p.jpg', { ...OPTIONS, maxMatches: 2, fetchImpl }).then((lookup) => {
      expect(lookup).toEqual({
        ok: true,
        matches: [
          { title: 'One', link: 'https://a.example/1' },
          { title: 'Two', link: 'https://a.example/2' }
        ]
      })
      expect(calls).toHaveLength(1)
    })
  })

  it('returns a failure reason on non-200 instead of throwing', async () => {
    const { fetchImpl } = fakeFetch(() => json({}, 500))
    const lookup = await lookupLensImage('https://cdn.example/p.jpg', { ...OPTIONS, fetchImpl })
    expect(lookup.ok).toBe(false)
    if (!lookup.ok) expect(lookup.reason).toContain('500')
  })

  it('returns a failure reason on timeout instead of throwing', async () => {
    const { fetchImpl } = hangingFetch()
    const lookup = await lookupLensImage('https://cdn.example/p.jpg', {
      ...OPTIONS,
      timeoutMs: 50,
      fetchImpl
    })
    expect(lookup).toEqual({ ok: false, reason: 'The reverse-image lookup timed out.' })
  })

  it('returns a failure reason on abort instead of throwing', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetchImpl } = fakeFetch(() => {
      throw new DOMException('Aborted', 'AbortError')
    })
    const lookup = await lookupLensImage('https://cdn.example/p.jpg', {
      ...OPTIONS,
      signal: controller.signal,
      fetchImpl
    })
    expect(lookup).toEqual({ ok: false, reason: 'The reverse-image lookup was aborted.' })
  })

  it('returns a failure reason when the network or the body fails instead of throwing', async () => {
    const down = fakeFetch(() => {
      throw new TypeError('down')
    })
    await expect(
      lookupLensImage('https://cdn.example/p.jpg', { ...OPTIONS, fetchImpl: down.fetchImpl })
    ).resolves.toEqual({ ok: false, reason: 'The reverse-image lookup failed.' })
    const broken = fakeFetch(() => new Response('not json', { status: 200 }))
    await expect(
      lookupLensImage('https://cdn.example/p.jpg', { ...OPTIONS, fetchImpl: broken.fetchImpl })
    ).resolves.toEqual({ ok: false, reason: 'The reverse-image lookup failed.' })
  })
})
