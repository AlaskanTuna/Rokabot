/**
 * The bot's own eye: the configured main model names the character and product from the photo,
 * then one searchWeb call with that name collects source URLs.
 */
import type { LlmRequest } from '@google/adk'
import { z } from 'zod'
import { createRokaModel } from '../../src/agent/llm/createModel.js'
import { searchWeb } from '../../src/agent/tools/searchWeb.js'
import { config } from '../../src/config.js'
import type { IdentifyOutput, ImageIdBackend } from './types.js'

export const OWN_VISION_NAME = 'ownVision'
// No per-photo estimate: the call bills the configured main-model budget, not a bake-off key.
export const OWN_VISION_COST_USD = 0

const visionSchema = z.object({
  name: z.string(),
  series: z.string().optional(),
  maker: z.string().optional(),
  product: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
})

const VISION_PROMPT =
  'Identify the character or item in this photo. Reply with JSON only: ' +
  '{"name": "<character or item name>", "series": "<series if known>", ' +
  '"maker": "<manufacturer if known>", "product": "<product line if known>", ' +
  '"confidence": <0 to 1>}. Use an empty string for anything unknown.'

export interface OwnVisionDeps {
  runVision: (request: LlmRequest) => Promise<string>
  runSearch: (query: string) => Promise<{ title: string; url: string }[]>
}

const defaultDeps: OwnVisionDeps = {
  async runVision(request) {
    let text = ''
    for await (const response of createRokaModel().generateContentAsync(request, false)) {
      text += (response.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
    }
    return text
  },
  async runSearch(query) {
    const result = await searchWeb({ query, max_results: 5 })
    return result.results.map(({ title, url }) => ({ title, url }))
  }
}

/** The exact ADK request the bot would send for this photo, exported for tests. */
export function buildVisionRequest(imageBytes: Buffer, mime: string): LlmRequest {
  return {
    model: config.llm.main.model,
    contents: [
      {
        role: 'user',
        parts: [{ text: VISION_PROMPT }, { inlineData: { mimeType: mime, data: imageBytes.toString('base64') } }]
      }
    ],
    config: { maxOutputTokens: 512, responseMimeType: 'application/json' },
    liveConnectConfig: {},
    toolsDict: {}
  }
}

function parseVisionJson(text: string): z.infer<typeof visionSchema> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return visionSchema.parse(JSON.parse(text.slice(start, end + 1)))
  } catch {
    return null
  }
}

export function createOwnVisionBackend(deps: OwnVisionDeps = defaultDeps): ImageIdBackend {
  return {
    name: OWN_VISION_NAME,
    async identify(imageBytes: Buffer, mime: string): Promise<IdentifyOutput> {
      const parsed = parseVisionJson(await deps.runVision(buildVisionRequest(imageBytes, mime)))
      const name = parsed?.name.trim()
      if (!name) return { candidates: [], abstained: true, rawCost: OWN_VISION_COST_USD }
      const sources = await deps.runSearch(name)
      return {
        candidates: [{ name, confidence: parsed?.confidence, sourceUrls: sources.map((source) => source.url) }],
        abstained: false,
        rawCost: OWN_VISION_COST_USD
      }
    }
  }
}
