import { describe, expect, it } from 'vitest'
import { clampToBudget, fitCitations } from '../citations.js'

const THREE = [
  { url: 'https://www.crunchyroll.com/news/a' },
  { url: 'https://www.polygon.com/b' },
  { url: 'https://vndb.org/c' }
]

describe('fitCitations', () => {
  it('cites sources as bare domains rather than raw URLs', () => {
    expect(fitCitations(THREE, 4000)).toBe(
      '-# 🔗 [crunchyroll.com](<https://www.crunchyroll.com/news/a>)  ·  [polygon.com](<https://www.polygon.com/b>)  ·  [vndb.org](<https://vndb.org/c>)'
    )
  })

  // Wikipedia disambiguation suffixes are common for anime and VN titles, and a bare ')' in the target
  // closes the markdown link early — rendering a link to '…/Frieren_(character' with a stray ')' after it.
  it('keeps a parenthesised URL inside the link target', () => {
    expect(fitCitations([{ url: 'https://en.wikipedia.org/wiki/Frieren_(character)' }], 4000)).toContain(
      '[en.wikipedia.org](<https://en.wikipedia.org/wiki/Frieren_(character)>)'
    )
  })

  it('drops whole citations rather than truncating one into a broken link', () => {
    const twoOfThree = fitCitations(THREE, fitCitations(THREE, 4000).length - 1)

    expect(twoOfThree).toBe(
      '-# 🔗 [crunchyroll.com](<https://www.crunchyroll.com/news/a>)  ·  [polygon.com](<https://www.polygon.com/b>)'
    )
  })

  it('omits the row entirely when not even one citation fits', () => {
    expect(fitCitations(THREE, 10)).toBe('')
  })

  it('caps the row at three sources however many were returned', () => {
    const many = [...THREE, { url: 'https://example.com/d' }, { url: 'https://example.org/e' }]

    expect(fitCitations(many, 4000)).not.toContain('example.com')
  })

  it('leaves a URL it cannot parse as its own label rather than throwing', () => {
    expect(fitCitations([{ url: 'not a url' }], 4000)).toBe('-# 🔗 [not a url](<not a url>)')
  })
})

describe('clampToBudget', () => {
  it('leaves text that already fits untouched', () => {
    expect(clampToBudget('short', 20)).toBe('short')
  })

  it('marks truncated text with an ellipsis so the cut is visible', () => {
    expect(clampToBudget('abcdefghij', 5)).toBe('abcd…')
  })

  it('returns nothing when the budget cannot hold even the ellipsis', () => {
    expect(clampToBudget('abcdefghij', 1)).toBe('')
  })
})
