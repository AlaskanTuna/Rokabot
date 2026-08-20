import { beforeEach, describe, expect, it, vi } from 'vitest'

// The probe's whole job is to run on a path that is already failing, so every case here is about it
// failing too. Mocked at the SDK boundary rather than at diagnoseKey, because two of the three failure
// modes live in the SDK call itself and stubbing diagnoseKey would assert nothing about them.
const generateContent = vi.fn()
const GoogleGenAI = vi.fn(() => ({ models: { generateContent } }))
vi.mock('@google/genai', () => ({ GoogleGenAI }))

const { DIAGNOSTIC_TIMEOUT_MS, KEY_IS_LIVE, SPENT_FOR_THE_DAY, diagnoseKey } = await import('../quotaDiagnostic.js')

beforeEach(() => {
  generateContent.mockReset()
  GoogleGenAI.mockClear()
  GoogleGenAI.mockImplementation(() => ({ models: { generateContent } }))
})

describe('diagnoseKey', () => {
  it('reports a live key when the probe answers', async () => {
    generateContent.mockResolvedValue({ text: 'pong' })

    await expect(diagnoseKey()).resolves.toBe(KEY_IS_LIVE)
  })

  it('classifies the refusal when the probe is refused', async () => {
    generateContent.mockRejectedValue(new Error('quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'))

    await expect(diagnoseKey()).resolves.toBe(SPENT_FOR_THE_DAY)
  })

  // The client is constructed from config.gemini.apiKey, and a missing or malformed key throws in the
  // constructor — which is the state a spent-key run is most likely to be near. Constructed outside the
  // try, that throw escapes into a caller that is mid-abort and replaces the finding with an error about
  // the tool fetching it.
  it('does not reject when the client cannot even be constructed', async () => {
    GoogleGenAI.mockImplementation(() => {
      throw new Error('API key not valid')
    })

    await expect(diagnoseKey()).resolves.toContain('API key not valid')
  })

  // A hung socket does not throw; it waits. Without a bound the gate stops producing a verdict at all,
  // which is worse than the wrong message this module was written to replace.
  it('bounds the probe, so a hung socket cannot cost the run its verdict', async () => {
    generateContent.mockResolvedValue({ text: 'pong' })

    await diagnoseKey()

    const passed = generateContent.mock.calls[0][0]
    expect(passed.config?.abortSignal).toBeInstanceOf(AbortSignal)
    expect(passed.config.abortSignal.aborted).toBe(false)
  })

  // The signal being present is wiring; the bound is the protection, and nothing else reads the value.
  // At 600_000 the assertion above stays green while a ten-minute hang is back — the failure the constant
  // exists to prevent, with the test still passing. Asserted on the constant rather than by driving the
  // clock, because `AbortSignal.timeout` is native and vitest's fake timers do not reach it: measured, and
  // a test built on them would have been green because broken rather than green because correct.
  it('bounds the probe to a span shorter than a human would wait for it', () => {
    expect(DIAGNOSTIC_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
    expect(DIAGNOSTIC_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
