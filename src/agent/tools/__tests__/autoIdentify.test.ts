import { describe, expect, it } from 'vitest'
import { asksWhoIsPictured } from '../imageId/autoIdentify.js'

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
