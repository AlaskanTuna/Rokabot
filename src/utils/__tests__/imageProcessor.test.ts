import { describe, expect, it } from 'vitest'
import { GEMINI_IMAGE_TOKENS } from '../imageProcessor.js'

describe('GEMINI_IMAGE_TOKENS', () => {
  // Measured with countTokens against gemini-3.5-flash-lite on 2026-08-19 (#121). Pinned as a literal
  // because the number is an external fact about the model, not something the code derives: 64x64,
  // 384x384, 512x512 and 1024x1024 all came back at exactly this, which is why no size or aspect-ratio
  // term survives here. An earlier 258-per-tile estimate from older Gemini docs was refuted by that run.
  it('is the measured flat per-image rate', () => {
    expect(GEMINI_IMAGE_TOKENS).toBe(1089)
  })
})
