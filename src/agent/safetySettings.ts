/** Configurable safety thresholds applied to every Gemini generateContent call */

import { HarmBlockThreshold, HarmCategory } from '@google/genai'
import type { SafetySetting } from '@google/genai'
import { config } from '../config.js'

export const SUPPORTED_HARM_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT
] as const

const ALLOWED_HARM_BLOCK_THRESHOLDS: HarmBlockThreshold[] = [
  HarmBlockThreshold.OFF,
  HarmBlockThreshold.BLOCK_NONE,
  HarmBlockThreshold.BLOCK_ONLY_HIGH,
  HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
]

export function buildSafetySettings(threshold: string): SafetySetting[] {
  if (!ALLOWED_HARM_BLOCK_THRESHOLDS.includes(threshold as HarmBlockThreshold)) {
    throw new Error(
      `Invalid gemini.safetyThreshold: ${threshold}. Allowed values: ${ALLOWED_HARM_BLOCK_THRESHOLDS.join(', ')}`
    )
  }

  return SUPPORTED_HARM_CATEGORIES.map((category) => ({ category, threshold: threshold as HarmBlockThreshold }))
}

export const SAFETY_SETTINGS = buildSafetySettings(config.gemini.safetyThreshold)
