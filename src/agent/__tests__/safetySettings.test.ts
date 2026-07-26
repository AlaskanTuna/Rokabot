import { HarmBlockThreshold, HarmCategory } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_HARM_CATEGORIES, buildSafetySettings } from '../safetySettings.js'

describe('buildSafetySettings', () => {
  it('returns one entry per supported category, all at the requested threshold', () => {
    const settings = buildSafetySettings('OFF')

    expect(settings).toHaveLength(4)
    expect(settings.every((setting) => setting.threshold === HarmBlockThreshold.OFF)).toBe(true)
    expect(settings.map((setting) => setting.category)).toEqual(SUPPORTED_HARM_CATEGORIES)
  })

  it('never sends deprecated or unsupported harm categories', () => {
    const settings = buildSafetySettings('OFF')
    const categories = settings.map((setting) => setting.category)

    expect(categories).not.toContain(HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY)
    expect(categories).not.toContain(HarmCategory.HARM_CATEGORY_IMAGE_HATE)
    expect(categories).not.toContain(HarmCategory.HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT)
    expect(categories).not.toContain(HarmCategory.HARM_CATEGORY_IMAGE_HARASSMENT)
    expect(categories).not.toContain(HarmCategory.HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT)
  })

  it('throws a descriptive error naming the allowed values for an invalid threshold', () => {
    expect(() => buildSafetySettings('NOPE')).toThrowError(/Invalid gemini\.safetyThreshold.*OFF/s)
  })

  it('rejects HARM_BLOCK_THRESHOLD_UNSPECIFIED and lists only the five real thresholds', () => {
    expect(() => buildSafetySettings(HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED)).toThrowError(
      /Invalid gemini\.safetyThreshold.*OFF, BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE/s
    )
  })
})
