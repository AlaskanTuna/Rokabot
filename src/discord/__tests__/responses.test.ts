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
