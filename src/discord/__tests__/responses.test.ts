import { describe, expect, it } from 'vitest'
import { getRandomDecline, getRandomError, splitResponse } from '../responses.js'

describe('getRandomDecline', () => {
  it('returns a non-empty string', () => {
    const result = getRandomDecline()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a string from the decline pool', () => {
    // Call multiple times to verify it always returns a valid string
    for (let i = 0; i < 20; i++) {
      const result = getRandomDecline()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

describe('getRandomError', () => {
  it('returns a non-empty string', () => {
    const result = getRandomError()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a string from the error pool', () => {
    for (let i = 0; i < 20; i++) {
      const result = getRandomError()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

/** Shapes chosen for how they steer splitResponse: newline path, space path, and the hard cut. */
const SHAPES: Record<string, (n: number) => string> = {
  solid: (n) => 'a'.repeat(n),
  spaced: (n) => Array.from({ length: n }, (_, i) => (i % 6 === 5 ? ' ' : 'a')).join(''),
  newlines: (n) => Array.from({ length: n }, (_, i) => (i % 17 === 16 ? '\n' : 'a')).join(''),
  emojiRun: (n) => '🌸'.repeat(n),
  mixedRoka: (n) => 'Fufu~ ♪ (◕‿◕✿) 🌸 '.repeat(n)
}

/** True when a chunk contains half of a surrogate pair, which Discord renders as a replacement character. */
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      const previous = text.charCodeAt(i - 1)
      if (!(previous >= 0xd800 && previous <= 0xdbff)) return true
    }
  }
  return false
}

function sweep(check: (chunks: string[], text: string, maxLength: number) => boolean): string[] {
  const offenders: string[] = []
  for (const maxLength of [3, 7, 50, 137]) {
    for (const [shape, make] of Object.entries(SHAPES)) {
      for (let n = 0; n <= 120; n++) {
        const text = make(n)
        if (!check(splitResponse(text, maxLength), text, maxLength)) offenders.push(`${shape} max=${maxLength} n=${n}`)
      }
    }
  }
  return offenders
}

// Swept rather than sampled: the tests below this block each pin one length and one shape, and a boundary
// defect only shows at the lengths where the cut lands on it. The emoji case was found exactly this way.
describe('splitResponse invariants', () => {
  it('never emits a chunk longer than the limit, at any length or shape', () => {
    expect(sweep((chunks, _text, maxLength) => chunks.every((chunk) => chunk.length <= maxLength))).toEqual([])
  })

  it('never emits an empty chunk for non-empty input', () => {
    expect(sweep((chunks, text) => text.length === 0 || chunks.every((chunk) => chunk.length > 0))).toEqual([])
  })

  // Roka's replies are dense with emoji, which are surrogate pairs; a hard cut between the halves used to
  // emit two lone surrogates. See the concrete case below.
  it('never cuts a surrogate pair in half', () => {
    expect(sweep((chunks, text) => hasLoneSurrogate(text) || !chunks.some(hasLoneSurrogate))).toEqual([])
  })
})

describe('splitResponse', () => {
  it('returns single chunk for short messages', () => {
    const result = splitResponse('Hello, world!')
    expect(result).toEqual(['Hello, world!'])
  })

  it('returns single chunk for exactly 2000 chars', () => {
    const text = 'a'.repeat(2000)
    const result = splitResponse(text, 2000)
    expect(result).toEqual([text])
  })

  it('splits messages over 2000 chars', () => {
    const text = 'a'.repeat(3000)
    const result = splitResponse(text, 2000)
    expect(result.length).toBeGreaterThan(1)
    expect(result.join('').length).toBe(3000)
  })

  it('prefers splitting at newlines', () => {
    const line = 'a'.repeat(1500)
    const text = line + '\n' + line
    const result = splitResponse(text, 2000)
    expect(result.length).toBe(2)
    expect(result[0]).toBe(line)
    expect(result[1]).toBe(line)
  })

  it('prefers splitting at spaces when no newline available', () => {
    // 400 * 6 - 1 = 2399 chars, exceeds 2000
    const words = Array(400).fill('hello').join(' ')
    const result = splitResponse(words, 2000)
    expect(result.length).toBeGreaterThan(1)
    // Each chunk should not exceed the limit
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000)
    }
  })

  it('hard splits when no spaces or newlines', () => {
    const text = 'a'.repeat(5000)
    const result = splitResponse(text, 2000)
    expect(result.length).toBe(3) // 2000 + 2000 + 1000
    expect(result[0].length).toBe(2000)
    expect(result[1].length).toBe(2000)
    expect(result[2].length).toBe(1000)
  })

  it('keeps emoji whole when it has to hard split', () => {
    expect(splitResponse('🌸'.repeat(10), 7)).toEqual(['🌸🌸🌸', '🌸🌸🌸', '🌸🌸🌸', '🌸'])
  })

  it('handles empty string', () => {
    const result = splitResponse('')
    expect(result).toEqual([''])
  })

  it('respects custom maxLength parameter', () => {
    const text = 'aaaa bbbb cccc'
    const result = splitResponse(text, 9)
    expect(result.length).toBe(2)
    expect(result[0]).toBe('aaaa bbbb')
    expect(result[1]).toBe('cccc')
  })
})
