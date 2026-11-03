import type { LlmRequest } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { profileFor } from '../profiles.js'
import { IMAGE_TYPES, functionDeclarations, shapeRequest, systemText } from '../requestShape.js'
import { orphanResultText, parseRetryAfterMs } from '../requestShape.js'

const GEMINI = {
  provider: 'gemini',
  profile: profileFor('gemini', 'gemini-3.5-flash-lite')!,
  maxOutputTokens: 500
} as const
const HAIKU = {
  provider: 'anthropic',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  maxOutputTokens: 400
} as const
const SAFETY = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]

function request(config: Record<string, unknown> | undefined): LlmRequest {
  return { model: 'm', contents: [], config, toolsDict: {}, liveConnectConfig: {} } as unknown as LlmRequest
}

describe('shapeRequest', () => {
  it('leaves a Gemini request as today: sampling and safety kept, cap unchanged, contents shared', () => {
    const original = request({ temperature: 0.9, topP: 0.95, maxOutputTokens: 500, safetySettings: SAFETY })

    const shaped = shapeRequest(original, GEMINI)

    expect(shaped.config).toEqual(original.config)
    expect(shaped.contents).toBe(original.contents)
  })

  it('drops sampling and safety for Claude and clamps the output cap to the resolved value', () => {
    const shaped = shapeRequest(
      request({ temperature: 0.9, topP: 0.95, maxOutputTokens: 500, safetySettings: SAFETY, systemInstruction: 'sys' }),
      HAIKU
    )

    expect(shaped.config).toEqual({ maxOutputTokens: 400, systemInstruction: 'sys' })
  })

  it('never raises a lower cap the request asked for, and fills a missing one', () => {
    expect(shapeRequest(request({ maxOutputTokens: 100 }), HAIKU).config?.maxOutputTokens).toBe(100)
    expect(shapeRequest(request({}), HAIKU).config?.maxOutputTokens).toBe(400)
  })

  it('does not mutate the request it shapes', () => {
    const original = request({ temperature: 0.9, maxOutputTokens: 500 })

    shapeRequest(original, HAIKU)

    expect(original.config).toEqual({ temperature: 0.9, maxOutputTokens: 500 })
  })
})

describe('request readers', () => {
  it('reads system text from a string, a part or a content', () => {
    expect(systemText('plain')).toBe('plain')
    expect(systemText({ text: 'part' })).toBe('part')
    expect(systemText({ parts: [{ text: 'a' }, { text: 'b' }] })).toBe('a\nb')
    expect(systemText(undefined)).toBeUndefined()
  })

  it('reads declarations, converting Gemini Schema and passing JSON Schema through', () => {
    const declared = functionDeclarations(
      request({
        tools: [
          {
            functionDeclarations: [
              {
                name: 'roll_dice',
                description: 'Roll',
                parameters: { type: 'OBJECT', properties: { sides: { type: 'INTEGER' } }, propertyOrdering: ['sides'] }
              },
              { name: 'recall_user', parametersJsonSchema: { type: 'object', properties: {} } },
              { name: 'flip_coin' }
            ]
          }
        ]
      })
    )

    expect(declared).toEqual([
      {
        name: 'roll_dice',
        description: 'Roll',
        parameters: { type: 'object', properties: { sides: { type: 'integer' } } }
      },
      { name: 'recall_user', parameters: { type: 'object', properties: {} } },
      { name: 'flip_coin' }
    ])
  })
})

describe('retry-after parsing', () => {
  it('gives 7000 for a 7-second header', () => {
    expect(parseRetryAfterMs('7')).toBe(7000)
  })

  it('gives 0 for a 0-second header', () => {
    expect(parseRetryAfterMs('0')).toBe(0)
  })

  it('gives undefined for a missing or unreadable header', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined()
    expect(parseRetryAfterMs('')).toBeUndefined()
    expect(parseRetryAfterMs('soon')).toBeUndefined()
    expect(parseRetryAfterMs('-1')).toBeUndefined()
    expect(parseRetryAfterMs('Infinity')).toBeUndefined()
    expect(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined()
  })
})

describe('orphan results', () => {
  it('reads an unmatched result inline with its name and body', () => {
    expect(orphanResultText('x', '{}')).toBe('(result of x: {})')
  })
})

describe('image types', () => {
  it('holds exactly jpeg, png, gif and webp', () => {
    expect([...IMAGE_TYPES].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  })
})
