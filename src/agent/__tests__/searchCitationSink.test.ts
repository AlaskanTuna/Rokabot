import { describe, expect, it } from 'vitest'
import {
  recordPageCitations,
  recordSearchCitations,
  resetSearchCitations,
  withSearchCitations
} from '../searchCitations.js'

const A = { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/news/a' }
const B = { title: 'Polygon', url: 'https://www.polygon.com/b' }

describe('search citation sink', () => {
  it('appends searches from one attempt instead of replacing them', async () => {
    const [, sink] = await withSearchCitations(async () => {
      recordSearchCitations([A])
      recordSearchCitations([B])
    })

    expect(sink).toEqual([A, B])
  })

  it('records an empty result without wiping earlier citations', async () => {
    const [, sink] = await withSearchCitations(async () => {
      recordSearchCitations([A])
      recordSearchCitations([])
    })

    expect(sink).toEqual([A])
  })

  it('de-duplicates by URL, keeping the first record', async () => {
    const [, sink] = await withSearchCitations(async () => {
      recordSearchCitations([A])
      recordSearchCitations([{ title: 'Crunchyroll again', url: A.url }])
    })

    expect(sink).toEqual([A])
  })

  it('appends page citations into the same sink without duplicating searched URLs', async () => {
    const [, sink] = await withSearchCitations(async () => {
      recordSearchCitations([A])
      recordPageCitations([{ title: 'Crunchyroll full text', url: A.url }, B])
    })

    expect(sink).toEqual([A, B])
  })

  it('resets when a new reply attempt starts, so a retried turn cites only what that attempt used', async () => {
    const [, sink] = await withSearchCitations(async () => {
      recordSearchCitations([A])
      resetSearchCitations()
      recordSearchCitations([B])
    })

    expect(sink).toEqual([B])
  })

  it('is a safe no-op with no turn scope open', () => {
    expect(() => {
      recordSearchCitations([A])
      recordPageCitations([A])
      resetSearchCitations()
    }).not.toThrow()
  })
})
