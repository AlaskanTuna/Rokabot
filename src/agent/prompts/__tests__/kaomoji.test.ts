import { describe, expect, it } from 'vitest'
import { guardMarkdown } from '../../../discord/markdownGuard.js'
import { FACES, TONE_FACES } from '../kaomoji.js'
import { TONE_PROMPTS, type ToneKey } from '../tones.js'

const allFaces = Object.values(FACES).flat()

describe('kaomoji pool', () => {
  it('is big enough that a channel rarely sees the same face twice in a row', () => {
    expect(new Set(allFaces).size).toBeGreaterThanOrEqual(70)
    expect(new Set(allFaces).size).toBe(allFaces.length)
  })

  it('gives every tone at least eight faces to choose from', () => {
    for (const tone of Object.keys(TONE_PROMPTS) as ToneKey[]) {
      const pool = TONE_FACES[tone].flatMap((group) => FACES[group])
      expect(pool.length, tone).toBeGreaterThanOrEqual(8)
    }
  })

  // markdownGuard escapes markdown inside a face only when the face is plain-bracketed, at most 20 characters
  // inside and free of two adjacent ASCII letters or digits; anything else could italicise half a message.
  it('keeps every face inside what markdownGuard can make render as typed', () => {
    for (const face of allFaces) {
      const bracketed = face.match(/\(([^()\n]*)\)/)
      expect(bracketed, face).not.toBeNull()
      const inner = bracketed?.[1] ?? ''
      expect(inner.length, face).toBeLessThanOrEqual(20)
      expect(/[A-Za-z0-9]{2}/.test(inner), face).toBe(false)
      expect(face, face).not.toMatch(/[|`（）]/)
      const guarded = guardMarkdown(`${face} and ${face}`)
      expect(guarded.replace(/\\[*_~]/g, ''), face).not.toMatch(/[*_~]/)
    }
  })
})
