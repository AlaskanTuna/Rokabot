import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: { logging: { level: 'silent' }, gemini: { apiKey: 'k', model: 'm', maxAttachmentTokens: 50_000 } }
}))

const countTokens = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { countTokens }
  }
}))

import { measureAttachmentTokens, needsMeasuring } from '../attachmentCost.js'

describe('needsMeasuring', () => {
  // Images are a flat 1,089 whatever their resolution, so a full turn of them is bounded at ~3,267 and
  // cannot reach any sane ceiling. Asking anyway would spend a round trip to learn something already known.
  it('does not ask when every attachment is an image', () => {
    expect(
      needsMeasuring([{ inlineData: { mimeType: 'image/jpeg' } }, { inlineData: { mimeType: 'image/png' } }])
    ).toBe(false)
  })

  it.each([['application/pdf'], ['audio/mpeg'], ['video/mp4']])('asks when a %s is present', (mimeType) => {
    expect(needsMeasuring([{ inlineData: { mimeType: 'image/png' } }, { inlineData: { mimeType } }])).toBe(true)
  })
})

describe('measureAttachmentTokens', () => {
  it('reports what the API charges', async () => {
    countTokens.mockResolvedValueOnce({ totalTokens: 28_001 })
    await expect(measureAttachmentTokens([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])).resolves.toBe(
      28_001
    )
  })

  // #153: countTokens returns the same total for a clip with and without its audio stream, while the model
  // demonstrably hears that audio. The estimate is therefore short by the soundtrack, in the permissive
  // direction, so video carries an allowance the other types do not.
  it('adds an allowance for the soundtrack countTokens does not price', async () => {
    countTokens.mockResolvedValueOnce({ totalTokens: 2_070 })

    await expect(measureAttachmentTokens([{ inlineData: { mimeType: 'video/mp4', data: 'x' } }])).resolves.toBe(2_712)
  })

  // The control. An allowance applied to everything would pass the test above while being wrong — audio and
  // documents are priced completely by countTokens and must come back untouched.
  it.each([
    ['audio/mp3', 643],
    ['application/pdf', 28_001],
    ['image/png', 1_089]
  ])('reports %s exactly as the API priced it', async (mimeType, total) => {
    countTokens.mockResolvedValueOnce({ totalTokens: total })

    await expect(measureAttachmentTokens([{ inlineData: { mimeType, data: 'x' } }])).resolves.toBe(total)
  })

  // Fails open deliberately. Blocking the turn when the probe cannot answer would turn a Gemini hiccup into a
  // total attachment outage, which is worse than the single over-budget request the probe exists to prevent.
  it('admits the turn unmeasured when the probe fails', async () => {
    countTokens.mockRejectedValueOnce(new Error('network'))
    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])
    ).resolves.toBeUndefined()
  })

  it('spends nothing on an empty turn', async () => {
    countTokens.mockClear()
    await expect(measureAttachmentTokens([])).resolves.toBe(0)
    expect(countTokens).not.toHaveBeenCalled()
  })
})
