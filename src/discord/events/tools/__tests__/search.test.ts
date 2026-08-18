import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ searchWeb: vi.fn() }))

vi.mock('../../../../agent/tools/searchWeb.js', () => ({ searchWeb: mocks.searchWeb }))

import { handleSearch } from '../search.js'
import { TEXT_DISPLAY_LIMIT } from '../shared.js'

type SearchResult = { title: string; url: string; snippet: string }

function replies(answer: string, results: SearchResult[] = []) {
  mocks.searchWeb.mockResolvedValue({ answer, results, resultCount: results.length })
}

function interaction(query = 'frieren season 2') {
  return { options: { getString: () => query } } as never
}

/** The single TextDisplay buildToolMessage assembles — the whole rendered message. */
async function rendered(query?: string): Promise<string> {
  const payload = await handleSearch(interaction(query))
  const container = payload.components[0].toJSON() as { components: Array<{ content?: string }> }
  return container.components.map((component) => component.content ?? '').join('')
}

const THREE_RESULTS: SearchResult[] = [
  { title: 'Some Very Long Editorial Headline About The Show', url: 'https://www.crunchyroll.com/news/a', snippet: '' },
  { title: 'Another Headline', url: 'https://www.polygon.com/b', snippet: '' },
  { title: 'A Third Headline', url: 'https://vndb.org/c', snippet: '' }
]

describe('handleSearch', () => {
  afterEach(() => vi.clearAllMocks())

  it('cites sources as numbered domains rather than page titles', async () => {
    replies('Season 2 premiered in January 2026.', THREE_RESULTS)

    expect(await rendered()).toContain(
      '-# 🔗 1. [crunchyroll.com](<https://www.crunchyroll.com/news/a>)  ·  2. [polygon.com](<https://www.polygon.com/b>)  ·  3. [vndb.org](<https://vndb.org/c>)'
    )
  })

  // result.answer is unbounded provider output. TextDisplayBuilder.setContent does not truncate an
  // over-budget string, it throws "Invalid string length" — so without a clamp the whole command fails.
  it('returns a message instead of throwing when the answer exceeds the budget', async () => {
    replies('x'.repeat(TEXT_DISPLAY_LIMIT * 2), THREE_RESULTS)

    await expect(handleSearch(interaction())).resolves.toBeDefined()
  })

  it('clamps an oversized answer to fit the TextDisplay budget', async () => {
    replies('x'.repeat(TEXT_DISPLAY_LIMIT * 2), THREE_RESULTS)

    expect((await rendered()).length).toBeLessThanOrEqual(TEXT_DISPLAY_LIMIT)
  })

  it('still renders the citations when an oversized answer is clamped', async () => {
    replies('x'.repeat(TEXT_DISPLAY_LIMIT * 2), THREE_RESULTS)

    expect(await rendered()).toContain('3. [vndb.org](<https://vndb.org/c>)')
  })

  it('omits the summary block when the provider returned no synthesised answer', async () => {
    replies('No summary available.', THREE_RESULTS)

    expect(await rendered()).not.toContain('No summary available.')
  })

  it('falls back to the not-found line when there is neither a summary nor a result', async () => {
    replies('No summary available.', [])

    expect(await rendered()).toContain("Hmm, I couldn't find anything for that~")
  })

  // Wikipedia disambiguation suffixes are common for anime and VN titles, and a bare ')' in the target
  // closes the markdown link early — rendering a link to '…/Frieren_(character' with a stray ')' after it.
  it('keeps a parenthesised URL inside the link target', async () => {
    replies('a', [{ title: 't', url: 'https://en.wikipedia.org/wiki/Frieren_(character)', snippet: '' }])

    expect(await rendered()).toContain('[en.wikipedia.org](<https://en.wikipedia.org/wiki/Frieren_(character)>)')
  })

  // Discord permits a string option far longer than one TextDisplay holds; /search sets no maxLength.
  it('survives a query longer than the whole TextDisplay budget', async () => {
    replies('a short answer', THREE_RESULTS)

    await expect(handleSearch(interaction('q'.repeat(TEXT_DISPLAY_LIMIT * 2)))).resolves.toBeDefined()
  })

  it('still cites its sources when the query is oversized', async () => {
    replies('a short answer', THREE_RESULTS)

    expect(await rendered('q'.repeat(TEXT_DISPLAY_LIMIT * 2))).toContain('3. [vndb.org](<https://vndb.org/c>)')
  })

  it('still answers when the query is oversized', async () => {
    replies('a short answer', THREE_RESULTS)

    expect(await rendered('q'.repeat(TEXT_DISPLAY_LIMIT * 2))).toContain('a short answer')
  })

  it('drops citations that do not fit rather than overflowing on long URLs', async () => {
    const longUrl = `https://example.com/${'p'.repeat(TEXT_DISPLAY_LIMIT)}`
    replies('a short answer', [
      { title: 't', url: longUrl, snippet: '' },
      { title: 't', url: longUrl, snippet: '' }
    ])

    await expect(handleSearch(interaction())).resolves.toBeDefined()
  })

  it('leaves a short answer untouched rather than clamping it', async () => {
    replies('Season 2 premiered on January 16, 2026.', THREE_RESULTS)

    expect(await rendered()).toContain('Season 2 premiered on January 16, 2026.')
  })
})
