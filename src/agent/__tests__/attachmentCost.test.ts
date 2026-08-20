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

  // Every type comes back exactly as priced. Video used to be inflated by an allowance for the soundtrack
  // countTokens under-prices; measured against billing, the estimate was already 1.17x-1.63x above the bill
  // before the allowance, and the allowance pushed it to 1.53x-2.14x (#153).
  it.each([
    ['video/mp4', 2_133],
    ['audio/mp3', 643],
    ['application/pdf', 28_001],
    ['image/png', 1_089]
  ])('reports %s exactly as the API priced it', async (mimeType, total) => {
    countTokens.mockResolvedValueOnce({ totalTokens: total })

    await expect(measureAttachmentTokens([{ inlineData: { mimeType, data: 'x' } }])).resolves.toBe(total)
  })

  // The wire for the margin this module now depends on. Nothing here is conservative by itself — the estimate
  // runs above the bill only because `roka.ts` pins MEDIA_RESOLUTION_LOW on video requests while this call
  // cannot pin anything (`generationConfig` is "Not supported by the Gemini Developer API"). So the probe
  // prices video at the default resolution and the turn is billed at low. Asserted here, in the file whose
  // correctness rests on it, rather than only where the setting lives: someone removing that gate for a good
  // reason would see roka.test.ts fail, update it deliberately, and never learn they had flipped this guard
  // from over- to under-estimating.
  it('prices video at whatever resolution the request will use, which it cannot influence', async () => {
    countTokens.mockResolvedValueOnce({ totalTokens: 2_061 })

    await measureAttachmentTokens([{ inlineData: { mimeType: 'video/mp4', data: 'x' } }])

    const asked = countTokens.mock.calls[0][0]
    expect(asked.generationConfig).toBeUndefined()
    expect(asked.config).toBeUndefined()
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
