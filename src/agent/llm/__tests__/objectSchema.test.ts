import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { normalizeReply, requestSchema } from '../objectSchema.js'

const Sample = z
  .object({
    op: z.literal('add'),
    id: z.number().int().min(1),
    count: z.number().int(),
    score: z.number().min(0).max(1),
    name: z.string().min(1),
    note: z.string().optional(),
    date: z
      .union([
        z.object({ month: z.number().int().min(1).max(12) }).strict(),
        z.object({ relative: z.enum(['today']) }).strict()
      ])
      .optional()
  })
  .strict()

type Node = Record<string, unknown>

function keysIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) keysIn(item, found)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key)
      keysIn(value, found)
    }
  }
  return found
}

describe('requestSchema', () => {
  it('drops the dialect and sends literals as one-value enums for every encoding', () => {
    for (const encoding of ['response_json_schema', 'json_schema_strict', 'forced_tool', 'json_object'] as const) {
      const schema = requestSchema(Sample, encoding)
      expect(schema.$schema).toBeUndefined()
      expect((schema.properties as Record<string, Node>).op).toEqual({ type: 'string', enum: ['add'] })
      expect(keysIn(schema).has('const')).toBe(false)
    }
  })

  it('removes the safe-integer range zod writes on every int and keeps real bounds for Gemini', () => {
    const properties = requestSchema(Sample, 'response_json_schema').properties as Record<string, Node>
    expect(properties.count).toEqual({ type: 'integer' })
    expect(properties.id).toEqual({ type: 'integer', minimum: 1 })
    expect(properties.score).toEqual({ type: 'number', minimum: 0, maximum: 1 })
    expect(properties.name).toEqual({ type: 'string' })
  })

  it('drops every numeric and string bound for Anthropic and closes every object', () => {
    const schema = requestSchema(Sample, 'forced_tool')
    const keys = keysIn(schema)
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'minLength']) expect(keys.has(key)).toBe(false)
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(['op', 'id', 'count', 'score', 'name'])
  })

  it('sends optional fields as required-nullable for OpenAI strict mode', () => {
    const schema = requestSchema(Sample, 'json_schema_strict')
    const properties = schema.properties as Record<string, Node>
    expect(schema.required).toEqual(['op', 'id', 'count', 'score', 'name', 'note', 'date'])
    expect(properties.note).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
    expect((properties.date.anyOf as Node[])[1]).toEqual({ type: 'null' })
    expect(properties.id).toEqual({ type: 'integer', minimum: 1 })
    expect(keysIn(schema).has('minLength')).toBe(false)
  })

  it('refuses a nullable schema for strict mode, where a null already means omitted', () => {
    expect(() => requestSchema(z.object({ note: z.string().nullable() }), 'json_schema_strict')).toThrow(
      'must not be nullable'
    )
  })
})

describe('normalizeReply', () => {
  it('reads strict-mode nulls as omitted fields so the zod schema accepts them', () => {
    const reply = { op: 'add', id: 1, count: 2, score: 0.5, name: 'x', note: null, date: null }
    expect(Sample.parse(normalizeReply(reply, 'json_schema_strict'))).toEqual({
      op: 'add',
      id: 1,
      count: 2,
      score: 0.5,
      name: 'x'
    })
  })

  it('leaves the other encodings untouched', () => {
    const reply = { note: null }
    expect(normalizeReply(reply, 'forced_tool')).toBe(reply)
  })
})
