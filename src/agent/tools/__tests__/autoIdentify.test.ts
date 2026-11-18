import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { closeDb, getDb } from '../../../storage/database.js'

// config reads the key at import, so it is set before any module that loads config.
vi.hoisted(() => {
  process.env.SERPAPI_API_KEY = 'test-key'
})

import { fakeFetch, json } from '../../../../tests/harness/fakeFetch.js'
import type { MediaAttachment } from '../../media/attachments.js'
import { registerTurnImages, withTurnImages } from '../../media/turnImages.js'
import { withSearchSources } from '../../searchSources.js'
import { asksWhoIsPictured, autoIdentifyNote } from '../imageId/autoIdentify.js'
import { withTurnBudget } from '../search/turnBudget.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

function image(url: string, imageOrigin?: MediaAttachment['imageOrigin']): MediaAttachment {
  return { url, contentType: 'image/png', ...(imageOrigin ? { imageOrigin } : {}) }
}

function autoScopes(images: MediaAttachment[], run: () => Promise<string | null>): Promise<string | null> {
  return withTurnBudget(() =>
    withSearchSources(() =>
      withTurnImages(() => {
        registerTurnImages(images)
        return run()
      })
    )
  )
}

describe('asksWhoIsPictured', () => {
  it.each([
    'Roka who is this',
    'Roka look again who is this',
    'U sure? Same person in this image, who is this?',
    "what's this figure?",
    'which character is she',
    'can you identify this plush',
    'これは誰？',
    'なにこれ'
  ])('fires on %s with an image', (message) => {
    expect(asksWhoIsPictured(message, 1)).toBe(true)
  })

  it.each(['Roka', 'Roka look at this', 'cute right?', 'I bought this today'])(
    'stays quiet on %s, leaving the call to Roka',
    (message) => {
      expect(asksWhoIsPictured(message, 1)).toBe(false)
    }
  )

  it('never fires without an image', () => {
    expect(asksWhoIsPictured('who is this', 0)).toBe(false)
  })
})

describe('autoIdentifyNote', () => {
  it('does not fire on a bare name when the identity question sits in the quoted reply', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const note = await autoScopes([image('https://cdn.example/p.png', 'reply')], () =>
      autoIdentifyNote('Roka', fetchImpl)
    )
    expect(note).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("fires on the speaker's own who-is-this with a photo", async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Roka Nendoroid', link: 'https://shop.example/r', source: 'Shop' }] })
    )
    const note = await autoScopes([image('https://cdn.example/p.png', 'upload')], () =>
      autoIdentifyNote('who is this', fetchImpl)
    )
    expect(note).toContain('Roka Nendoroid')
    expect(calls).toHaveLength(1)
  })

  it('looks past a link preview at the first real image', async () => {
    const { fetchImpl } = fakeFetch(() => json({ visual_matches: [] }))
    const note = await autoScopes(
      [image('https://cdn.example/preview.jpg', 'link_preview'), image('https://cdn.example/p.png', 'upload')],
      () => autoIdentifyNote('who is this', fetchImpl)
    )
    expect(note).toContain('image 2')
  })

  it('stays quiet when every image is a link preview', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const note = await autoScopes([image('https://cdn.example/preview.jpg', 'link_preview')], () =>
      autoIdentifyNote('who is this', fetchImpl)
    )
    expect(note).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
