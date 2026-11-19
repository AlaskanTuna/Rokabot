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
import { autoIdentifyNote, planImageLookup, prefilter } from '../imageId/autoIdentify.js'
import { recordLensSearch } from '../imageId/lensLedger.js'
import type { GateJudge, GateVerdict } from '../imageId/lookupGate.js'
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

function planScopes<T>(images: MediaAttachment[], run: () => Promise<T>): Promise<T> {
  return withTurnBudget(() =>
    withSearchSources(() =>
      withTurnImages(() => {
        registerTurnImages(images)
        return run()
      })
    )
  )
}

function verdict(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return { asks: true, target: 1, subject: 'figure_or_merch', ...overrides }
}

const fireJudge: GateJudge = async () => verdict()
const denyJudge: GateJudge = async () => null
const throwingJudge: GateJudge = async () => {
  throw new Error('gate is down')
}

describe('prefilter', () => {
  it.each([
    // Fire rows: the text alone passes, the gate decides the rest.
    ['Roka who is this', 1, true],
    ['Roka what about this', 1, true],
    ['roka wtf is that', 1, true],
    ['wat dis', 1, true],
    ['whos she', 1, true],
    ['which anime', 1, true],
    ['how to do these', 1, true],
    ['where is this place', 1, true],
    ['when did this come out', 1, true],
    ['why is he like that', 1, true],
    ['siapa ni', 1, true],
    ['apa ni', 1, true],
    ['ni apa', 1, true],
    ['这是什么', 1, true],
    ['谁', 1, true],
    ['これ誰？', 1, true],
    ['なにこれ', 1, true],
    ['U sure? same person in this image', 1, true],
    ['u sure?', 1, true],
    ['look again', 1, true],
    ['and this one?', 1, true],
    ['who is the 2nd one', 2, true],
    ['kiri siapa', 2, true],
    ['who are both', 2, true],
    ['who is this', 1, true],
    ['what does this say', 1, true],
    ['what is this chart', 1, true],
    ['what time is the event tmr', 1, true],
    ['what is this', 1, true],
    ['which anime is this gif from', 1, true],
    // No-fire rows the text alone decides.
    ['u sure?', 0, false],
    ['look again', 0, false],
    ['Roka', 1, false],
    ['Roka thoughts?', 1, false],
    // Broad on purpose: "what" passes the prefilter, and the gate turns a share like this away.
    ['look what I got', 1, true],
    ['cute right?', 1, false],
    ['explain this meme', 1, false],
    ['who was that girl I sent earlier', 0, false],
    ['what is this', 0, false],
    ['who is this', 0, false],
    ['Roka', 1, false],
    ['who is this <@123456>', 1, false],
    ['rate my selfie', 1, false],
    ['what is this pfp', 1, false]
  ])('prefilter(%s, %d) is %s', (text, count, expected) => {
    expect(prefilter(text, count)).toBe(expected)
  })
})

describe('planImageLookup', () => {
  it('fires image 2 for "who is the 2nd one" over two uploads', async () => {
    const judge: GateJudge = async () => verdict({ target: 2, subject: 'figure_or_merch' })
    const plan = await planScopes([image('https://cdn.example/a.png'), image('https://cdn.example/b.png')], () =>
      planImageLookup('who is the 2nd one', judge, globalThis.fetch, 'on')
    )
    expect(plan?.attachment).toBe(2)
  })

  it('fires image 1 for "kiri siapa"', async () => {
    const plan = await planScopes([image('https://cdn.example/a.png'), image('https://cdn.example/b.png')], () =>
      planImageLookup('kiri siapa', fireJudge, globalThis.fetch, 'on')
    )
    expect(plan?.attachment).toBe(1)
  })

  it('clamps the gate target into the eligible range', async () => {
    const high: GateJudge = async () => verdict({ target: 99, subject: 'product' })
    const highPlan = await planScopes([image('https://cdn.example/a.png'), image('https://cdn.example/b.png')], () =>
      planImageLookup('which one', high, globalThis.fetch, 'on')
    )
    expect(highPlan?.attachment).toBe(2)
    const low: GateJudge = async () => verdict({ target: 0, subject: 'product' })
    const lowPlan = await planScopes([image('https://cdn.example/a.png'), image('https://cdn.example/b.png')], () =>
      planImageLookup('which one', low, globalThis.fetch, 'on')
    )
    expect(lowPlan?.attachment).toBe(1)
  })

  it('does not fire a selfie: real_person never fires', async () => {
    const judge: GateJudge = async () => verdict({ subject: 'real_person' })
    const plan = await planScopes([image('https://cdn.example/selfie.png')], () =>
      planImageLookup('who is this', judge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })

  it('does not fire a chat screenshot', async () => {
    const judge: GateJudge = async () => verdict({ subject: 'text_or_chat' })
    const plan = await planScopes([image('https://cdn.example/chat.png')], () =>
      planImageLookup('what does this say', judge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })

  it('does not fire a meme', async () => {
    const judge: GateJudge = async () => verdict({ subject: 'meme' })
    const plan = await planScopes([image('https://cdn.example/meme.png')], () =>
      planImageLookup('what is this', judge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })

  it('does not fire when the gate says the text does not ask', async () => {
    const judge: GateJudge = async () => verdict({ asks: false, subject: 'other' })
    const plan = await planScopes([image('https://cdn.example/meme.png')], () =>
      planImageLookup('what time is the event tmr', judge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })

  it('does not fire when the gate errors', async () => {
    const plan = await planScopes([image('https://cdn.example/a.png')], () =>
      planImageLookup('who is this', denyJudge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
    const thrown = await planScopes([image('https://cdn.example/a.png')], () =>
      planImageLookup('who is this', throwingJudge, globalThis.fetch, 'on')
    )
    expect(thrown).toBeNull()
  })

  it('in shadow mode fires on the prefilter even when the gate errors', async () => {
    const plan = await planScopes([image('https://cdn.example/a.png')], () =>
      planImageLookup('who is this', denyJudge, globalThis.fetch, 'shadow')
    )
    expect(plan?.attachment).toBe(1)
  })

  it('in off mode uses the first eligible image without calling the gate', async () => {
    const plan = await planScopes(
      [image('https://cdn.example/preview.jpg', 'link_preview'), image('https://cdn.example/p.png')],
      () => planImageLookup('who is this', throwingJudge, globalThis.fetch, 'off')
    )
    expect(plan?.attachment).toBe(2)
  })

  it('stays quiet when every image is a link preview, without calling the gate', async () => {
    const plan = await planScopes([image('https://cdn.example/preview.jpg', 'link_preview')], () =>
      planImageLookup('what is this', throwingJudge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })

  it('stays quiet when the shared ledger is spent, without calling the gate', async () => {
    const now = Date.now()
    for (let index = 0; index < 230; index++) recordLensSearch('auto', now)
    const plan = await planScopes([image('https://cdn.example/p.png')], () =>
      planImageLookup('who is this', throwingJudge, globalThis.fetch, 'on')
    )
    expect(plan).toBeNull()
  })
})

describe('autoIdentifyNote', () => {
  it('does not fire on a bare name when the identity question sits in the quoted reply', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const note = await autoScopes([image('https://cdn.example/p.png', 'reply')], () =>
      autoIdentifyNote('Roka', fetchImpl, throwingJudge, 'on')
    )
    expect(note).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("fires on the speaker's own who-is-this with a photo", async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ visual_matches: [{ title: 'Roka Nendoroid', link: 'https://shop.example/r', source: 'Shop' }] })
    )
    const note = await autoScopes([image('https://cdn.example/p.png', 'upload')], () =>
      autoIdentifyNote('who is this', fetchImpl, fireJudge, 'on')
    )
    expect(note).toContain('Roka Nendoroid')
    expect(calls).toHaveLength(1)
  })

  it('looks past a link preview at the first real image', async () => {
    const { fetchImpl } = fakeFetch(() => json({ visual_matches: [] }))
    const note = await autoScopes(
      [image('https://cdn.example/preview.jpg', 'link_preview'), image('https://cdn.example/p.png', 'upload')],
      () => autoIdentifyNote('who is this', fetchImpl, fireJudge, 'on')
    )
    expect(note).toContain('image 2')
  })

  it('stays quiet when every image is a link preview', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ visual_matches: [{ title: 'Someone' }] }))
    const note = await autoScopes([image('https://cdn.example/preview.jpg', 'link_preview')], () =>
      autoIdentifyNote('who is this', fetchImpl, throwingJudge, 'on')
    )
    expect(note).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
