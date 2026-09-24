import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  searchWeb: vi.fn()
}))

vi.mock('../../utils/logger.js', () => ({ logger: { info: mocks.info, warn: mocks.warn, debug: vi.fn() } }))
vi.mock('../tools/searchWeb.js', () => ({ searchWeb: mocks.searchWeb }))

import type { TurnJudgment } from '../jev/judgments.js'
import {
  buildLookedUpBlock,
  decidePrefetch,
  runPrefetchForJudgment,
  settlePrefetch,
  startSearchPrefetch
} from '../searchPrefetch.js'

const judgmentWith = (needsLookup: number | null): TurnJudgment => ({
  tone: null,
  referents: [],
  needsLookup,
  latencyMs: 2,
  inputTokens: 9
})

describe('decidePrefetch', () => {
  it.each([
    ['off', 0.99, 'off', false],
    ['shadow', 0.95, 'shadow_would_fire', false],
    ['shadow', 0.2, 'below_threshold', false],
    ['on', 0.7, 'fired', true],
    ['on', 0.69, 'below_threshold', false],
    ['on', 0, 'below_threshold', false]
  ] as const)('mode %s with noul %s decides %s', (mode, noul, reason, fire) => {
    expect(decidePrefetch(judgmentWith(noul), mode, 0.7)).toEqual({ fire, reason })
  })

  it('never fires without a judgment or without a noul', () => {
    expect(decidePrefetch(null, 'on', 0.7)).toEqual({ fire: false, reason: 'no_judgment' })
    expect(decidePrefetch(judgmentWith(null), 'on', 0.7)).toEqual({ fire: false, reason: 'no_noul' })
  })

  it('separates a shadow would-fire from a shadow would-not-fire', () => {
    expect(decidePrefetch(judgmentWith(0.95), 'shadow', 0.7)).toEqual({
      fire: false,
      reason: 'shadow_would_fire'
    })
    expect(decidePrefetch(judgmentWith(0.95), 'on', 0.7)).toEqual({ fire: true, reason: 'fired' })
  })
})

describe('startSearchPrefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchWeb.mockResolvedValue({
      answer: 'It premiered in January.',
      results: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', snippet: 'a' },
        { title: 'Polygon', url: 'https://www.polygon.com/b', snippet: 'b' }
      ],
      resultCount: 2
    })
  })

  it('sends the raw query and abort signal and reports the sources it found', async () => {
    const signal = new AbortController().signal
    const outcome = await startSearchPrefetch({ query: 'what is the raw text?', signal })

    expect(mocks.searchWeb).toHaveBeenCalledWith({ query: 'what is the raw text?', signal })
    expect(outcome).toEqual({
      status: 'ready',
      text: 'It premiered in January.',
      sources: [
        { title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a' },
        { title: 'Polygon', url: 'https://www.polygon.com/b' }
      ]
    })
  })

  it.each([
    { answer: 'Search request failed.', results: [], resultCount: 0 },
    { answer: 'Search quota exceeded. Try again later.', results: [], resultCount: 0 },
    { answer: 'No summary available.', results: [{ title: 'A', url: 'https://a.test', snippet: 'a' }], resultCount: 1 }
  ])('reports an empty search as empty, not as a failure or a finding', async (result) => {
    mocks.searchWeb.mockResolvedValue(result)

    await expect(startSearchPrefetch({ query: 'q', signal: new AbortController().signal })).resolves.toEqual({
      status: 'empty'
    })
  })

  it('reports a thrown search as failed without rejecting', async () => {
    mocks.searchWeb.mockRejectedValue(new Error('socket hang up'))

    await expect(startSearchPrefetch({ query: 'q', signal: new AbortController().signal })).resolves.toEqual({
      status: 'failed',
      error: 'socket hang up'
    })
  })

  it('reports an aborted search as aborted without rejecting', async () => {
    const controller = new AbortController()
    mocks.searchWeb.mockImplementation(() => {
      controller.abort()
      return Promise.reject(new DOMException('This operation was aborted', 'AbortError'))
    })

    await expect(startSearchPrefetch({ query: 'q', signal: controller.signal })).resolves.toEqual({ status: 'aborted' })
  })
})

describe('runPrefetchForJudgment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchWeb.mockResolvedValue({
      answer: 'It premiered in January.',
      results: [{ title: 'Crunchyroll', url: 'https://www.crunchyroll.com/a', snippet: 'a' }],
      resultCount: 1
    })
  })

  it('logs a shadow verdict without calling searchWeb', async () => {
    await expect(
      runPrefetchForJudgment(
        judgmentWith(0.95),
        { mode: 'shadow', minimumNoul: 0.7, channelId: 'channel-1' },
        {
          query: 'raw question',
          signal: new AbortController().signal
        }
      )
    ).resolves.toMatchObject({ decision: { fire: false, reason: 'shadow_would_fire' }, outcome: null })

    expect(mocks.searchWeb).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'shadow_would_fire' }),
      'Jev search prefetch'
    )
  })

  it('searches once when the on-mode threshold clears', async () => {
    await expect(
      runPrefetchForJudgment(
        judgmentWith(0.95),
        { mode: 'on', minimumNoul: 0.7, channelId: 'channel-1' },
        {
          query: 'raw question',
          signal: new AbortController().signal
        }
      )
    ).resolves.toMatchObject({ decision: { fire: true, reason: 'fired' }, outcome: { status: 'ready' } })

    expect(mocks.searchWeb).toHaveBeenCalledOnce()
  })
})

describe('buildLookedUpBlock', () => {
  it('renders the summary and at most three titled source lines', () => {
    const block = buildLookedUpBlock({
      status: 'ready',
      text: 'It premiered in January.',
      sources: Array.from({ length: 5 }, (_, index) => ({
        title: `Source ${index}`,
        url: `https://example.com/${index}`
      }))
    })

    expect(block).toContain('## Looked It Up')
    expect(block).toContain('It premiered in January.')
    expect(block).toContain('https://example.com/2')
    expect(block).not.toContain('https://example.com/3')
  })

  it('bounds each source line and the whole block', () => {
    const block = buildLookedUpBlock({
      status: 'ready',
      text: 'x'.repeat(5000),
      sources: [{ title: 't'.repeat(500), url: `https://example.com/${'x'.repeat(500)}` }]
    })

    expect(
      block
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .every((line) => line.length <= 200)
    ).toBe(true)
    expect(block.length).toBeLessThanOrEqual(2000)
    expect(block).toContain('…')
  })
})

describe('settlePrefetch', () => {
  it('returns the outcome when it beats the wait', async () => {
    const outcome = { status: 'empty' } as const
    await expect(settlePrefetch(Promise.resolve(outcome), 50)).resolves.toBe(outcome)
  })

  it('returns null when the wait gives up and drops a late result', async () => {
    const late = new Promise<{ status: 'ready'; text: string; sources: [] }>((resolve) =>
      setTimeout(() => resolve({ status: 'ready', text: 'late', sources: [] }), 10)
    )

    await expect(settlePrefetch(late, 1)).resolves.toBeNull()
  })

  it('never rejects on a late prefetch rejection', async () => {
    const late = new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('late boom')), 5))

    await expect(settlePrefetch(late, 1)).resolves.toBeNull()
  })

  it('returns null when there is no prefetch at all', async () => {
    await expect(settlePrefetch(undefined, 50)).resolves.toBeNull()
  })

  it('clears its timer, leaving no pending handle behind', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    await settlePrefetch(Promise.resolve({ status: 'empty' } as const), 4000)

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
