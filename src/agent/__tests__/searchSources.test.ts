import { describe, expect, it } from 'vitest'
import {
  extractUrls,
  registerMessageSources,
  registerSources,
  resolveSource,
  withSearchSources
} from '../searchSources.js'

describe('search source registry', () => {
  it('hands out stable ids s1, s2, ... in registration order', () => {
    withSearchSources(() => {
      expect(registerSources(['https://a.test/x', 'https://b.test/y'], 'search')).toEqual(['s1', 's2'])
    })
  })

  it('returns the first id when a URL is registered twice, keeping its first origin', () => {
    withSearchSources(() => {
      expect(registerSources(['https://a.test/x'], 'message')).toEqual(['s1'])
      expect(registerSources(['https://a.test/x'], 'search')).toEqual(['s1'])
      expect(resolveSource('s1')).toBe('https://a.test/x')
    })
  })

  it('resolves an id to its URL, and unknown ids to undefined', () => {
    withSearchSources(() => {
      registerSources(['https://a.test/x'], 'search')

      expect(resolveSource('s1')).toBe('https://a.test/x')
      expect(resolveSource('s99')).toBeUndefined()
    })
  })

  it('restarts ids at s1 in a new turn scope', () => {
    withSearchSources(() => {
      registerSources(['https://a.test/x'], 'search')
    })
    withSearchSources(() => {
      expect(registerSources(['https://b.test/y'], 'search')).toEqual(['s1'])
      expect(resolveSource('s1')).toBe('https://b.test/y')
    })
  })

  it('is a safe no-op with no turn scope open', () => {
    expect(registerSources(['https://a.test/x'], 'search')).toEqual([])
    expect(resolveSource('s1')).toBeUndefined()
    expect(registerMessageSources('see https://a.test/x')).toEqual([])
  })
})

describe('extractUrls', () => {
  it('finds bare and angle-wrapped URLs in order without duplicates', () => {
    expect(extractUrls('see https://a.test/x and <https://b.test/y> and https://a.test/x')).toEqual([
      'https://a.test/x',
      'https://b.test/y'
    ])
  })

  it('strips trailing sentence punctuation but keeps balanced parens', () => {
    expect(extractUrls('read https://a.test/Frieren_(character), then https://b.test/y.')).toEqual([
      'https://a.test/Frieren_(character)',
      'https://b.test/y'
    ])
  })

  it('drops a paren that only closes markdown, and skips non-http schemes', () => {
    expect(extractUrls('[post](https://a.test/x)) and ftp://files.test/y')).toEqual(['https://a.test/x'])
  })

  it('finds nothing in text without links', () => {
    expect(extractUrls('just chatting, no links here')).toEqual([])
  })
})

describe('registerMessageSources', () => {
  it('registers the URLs in the triggering message with the message origin', () => {
    withSearchSources(() => {
      const ids = registerMessageSources('look at https://a.test/x and https://b.test/y!')

      expect(ids).toEqual(['s1', 's2'])
      expect(resolveSource('s1')).toBe('https://a.test/x')
    })
  })
})
