import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {
    logging: { level: 'silent' },
    gemini: { apiKey: 'k', model: 'm', maxAttachmentTokens: 50_000 },
    llm: { main: {} as Record<string, unknown> }
  }
}))
vi.mock('../../config.js', () => ({ config: mocks.config }))

const countTokens = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { countTokens }
  }
}))

const anthropicCountTokens = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { countTokens: anthropicCountTokens }
  }
}))

import { measureAttachmentTokens, needsMeasuring } from '../attachmentCost.js'

const input = { image: true, pdf: true, audio: false, video: false }
const geminiMain = {
  provider: 'gemini',
  model: 'm',
  apiKey: 'k',
  timeoutMs: 20_000,
  profile: { tokenCounter: 'gemini', input: { ...input, audio: true, video: true } }
}
const anthropicMain = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  apiKey: 'a',
  timeoutMs: 15_000,
  profile: { tokenCounter: 'anthropic', input }
}
const estimateMain = {
  provider: 'openai',
  model: 'estimate-test',
  apiKey: 'o',
  timeoutMs: 15_000,
  profile: { tokenCounter: 'estimate', input }
}

beforeEach(() => {
  mocks.config.llm.main = geminiMain
})

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

describe('measureAttachmentTokens per main model', () => {
  const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString('base64')

  it('asks Anthropic count_tokens with image and PDF blocks when Anthropic is the main model', async () => {
    mocks.config.llm.main = anthropicMain
    anthropicCountTokens.mockResolvedValueOnce({ input_tokens: 2_940 })
    countTokens.mockClear()

    await expect(
      measureAttachmentTokens([
        { inlineData: { mimeType: 'image/jpeg', data: 'aW1n' } },
        { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } }
      ])
    ).resolves.toBe(2_940)
    expect(anthropicCountTokens).toHaveBeenCalledWith({
      model: 'claude-haiku-5-5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aW1n' } },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' } }
          ]
        }
      ]
    })
    expect(countTokens).not.toHaveBeenCalled()
  })

  it('admits the turn unmeasured when Anthropic counting fails', async () => {
    mocks.config.llm.main = anthropicMain
    anthropicCountTokens.mockRejectedValueOnce(new Error('network'))

    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'application/pdf', data: 'x' } }])
    ).resolves.toBeUndefined()
  })

  it('keeps Gemini countTokens for the Gemini watcher whatever the main model', async () => {
    mocks.config.llm.main = anthropicMain
    anthropicCountTokens.mockClear()
    countTokens.mockResolvedValueOnce({ totalTokens: 640 })

    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'audio/mp3', data: 'x' } }], 'gemini')
    ).resolves.toBe(640)
    expect(countTokens.mock.calls.at(-1)?.[0].model).toBe('m')
    expect(anthropicCountTokens).not.toHaveBeenCalled()
  })

  it('estimates an image from its dimensions', async () => {
    mocks.config.llm.main = estimateMain
    const image = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffffff' } })
      .jpeg()
      .toBuffer()

    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }])
    ).resolves.toBe(640)
  })

  it('estimates a PDF from its page objects', async () => {
    mocks.config.llm.main = estimateMain
    const pages =
      '1 0 obj << /Type /Pages /Count 3 >> endobj\n2 0 obj << /Type /Page >>\n3 0 obj << /Type /Page >>\n4 0 obj << /Type /Page >>'

    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'application/pdf', data: pdf(pages) } }])
    ).resolves.toBe(4_500)
  })

  it('reads the page tree count when page objects are compressed', async () => {
    mocks.config.llm.main = estimateMain

    await expect(
      measureAttachmentTokens([
        { inlineData: { mimeType: 'application/pdf', data: pdf('<< /Type /Pages /Count 12 >>') } }
      ])
    ).resolves.toBe(18_000)
  })

  it('prices media the model cannot take as its text marker', async () => {
    mocks.config.llm.main = estimateMain

    const tokens = await measureAttachmentTokens([{ inlineData: { mimeType: 'audio/mp3', data: 'x' } }])
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(20)
  })

  it('gives no estimate for audio a profile would hear, rather than a wrong one', async () => {
    mocks.config.llm.main = { ...estimateMain, profile: { tokenCounter: 'estimate', input: { ...input, audio: true } } }

    await expect(
      measureAttachmentTokens([{ inlineData: { mimeType: 'audio/mp3', data: 'x' } }])
    ).resolves.toBeUndefined()
  })
})
