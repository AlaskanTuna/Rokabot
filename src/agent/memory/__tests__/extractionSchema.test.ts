import { describe, expect, it } from 'vitest'
import { requestSchema } from '../../llm/objectSchema.js'
import { EXTRACTION_RESPONSE_SCHEMA, ExtractionOutputSchema, parseExtractionOutput } from '../extractionSchema.js'
import { PREDICATES } from '../predicates.js'
import { LEGACY_GEMINI_EXTRACTION_SCHEMA } from './legacyGeminiExtractionSchema.js'

const GEMINI_SCHEMA = requestSchema(ExtractionOutputSchema, 'response_json_schema')

/** The legacy schema spelled types in capitals and set no bounds or additionalProperties; compare the rest. */
function comparable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(comparable)
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'additionalProperties' || key === 'minimum' || key === 'maximum') continue
    if (key === 'type' && typeof value === 'string') out.type = value.toLowerCase()
    else if (key === 'required') out.required = [...(value as string[])].sort()
    else out[key] = comparable(value)
  }
  return out
}

function keysIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const item of node) keysIn(item, found)
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key)
      keysIn(value, found)
    }
  }
  return found
}

const subject = { kind: 'user', userId: 'u-1' }

describe('parseExtractionOutput', () => {
  it('accepts add, update, remove, and noop operations', () => {
    const output = {
      ops: [
        { op: 'add', subject, predicate: 'likes', value: 'tea', objectUserId: 'u-2', tense: 'current' },
        { op: 'update', subject, existingId: 1, predicate: 'likes', value: 'green tea', tense: 'planned' },
        { op: 'remove', subject, existingId: 2, predicate: 'likes', value: 'coffee' },
        { op: 'noop' }
      ],
      summary: 'The members shared preferences.'
    }

    expect(parseExtractionOutput(JSON.stringify(output))).toEqual(output)
  })

  it('accepts dated guild plans and rejects subject, predicate, and field mismatches', () => {
    const plan = {
      ops: [
        {
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'plan',
          value: 'Members planned a game night',
          date: { relative: 'tomorrow' }
        }
      ],
      summary: 'Members made a server plan.'
    }

    expect(parseExtractionOutput(JSON.stringify(plan))).toEqual(plan)
    for (const op of [
      { op: 'add', subject, predicate: 'plan', value: 'Game night', tense: 'current', date: { relative: 'tomorrow' } },
      { op: 'add', subject: { kind: 'guild' }, predicate: 'likes', value: 'tea' },
      {
        op: 'add',
        subject: { kind: 'guild' },
        predicate: 'plan',
        value: 'Game night',
        date: { relative: 'tomorrow' },
        objectUserId: 'u-2'
      },
      {
        op: 'add',
        subject: { kind: 'user', userId: 'u-1' },
        predicate: 'likes',
        value: 'tea',
        tense: 'current',
        date: {}
      },
      { op: 'add', subject: { kind: 'guild' }, predicate: 'plan', value: 'Game night' }
    ]) {
      expect(() => parseExtractionOutput(JSON.stringify({ ops: [op], summary: 'A fact.' }))).toThrow()
    }
  })

  it('rejects an update without an existing claim ID', () => {
    expect(() =>
      parseExtractionOutput(
        JSON.stringify({
          ops: [{ op: 'update', subject, predicate: 'likes', value: 'tea', tense: 'current' }],
          summary: 'A member shared a preference.'
        })
      )
    ).toThrow()
  })

  it.each([
    ['missing summary', { ops: [{ op: 'noop' }] }],
    [
      'unknown predicate',
      { ops: [{ op: 'add', subject, predicate: 'unlisted', value: 'tea', tense: 'current' }], summary: 'A fact.' }
    ],
    [
      'remove without an existing ID',
      { ops: [{ op: 'remove', subject, predicate: 'likes', value: 'tea' }], summary: 'A fact.' }
    ],
    [
      'invalid user subject',
      { ops: [{ op: 'add', subject: { kind: 'guild' }, predicate: 'likes', value: 'tea' }], summary: 'A fact.' }
    ],
    ['extra operation fields', { ops: [{ op: 'noop', value: 'tea' }], summary: 'A fact.' }],
    ['extra output fields', { ops: [{ op: 'noop' }], summary: 'A fact.', episodeId: 'e-1' }]
  ])('rejects %s', (_, output) => {
    expect(() => parseExtractionOutput(JSON.stringify(output))).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseExtractionOutput('{')).toThrow()
  })

  it('requires a month and day, but not a year, on a calendar date in the response schema', () => {
    type DateVariant = {
      description: string
      required: string[]
      properties: {
        year: { description: string }
        day: { description: string }
        relative: { enum: string[] }
      }
    }
    const date = (
      GEMINI_SCHEMA as unknown as {
        properties: {
          ops: {
            items: { anyOf: Array<{ properties: { date?: { anyOf: DateVariant[] } } }> }
          }
        }
      }
    ).properties.ops.items.anyOf
      .map((variant) => variant.properties.date)
      .find((value) => value?.anyOf)
    const [calendar, monthOnly, relative] = date?.anyOf ?? []

    expect(calendar.required).toEqual(['month', 'day'])
    expect(calendar.properties.day.description).toContain('day of the month')
    expect(calendar.properties.year.description).toContain('only when the messages state one')
    expect(calendar.description).toContain('Give the month and day whenever the messages name a day')
    expect(relative.required).toEqual(['relative'])
    expect(relative.properties.relative.enum).toContain('this_month')
    expect(relative.properties.relative.enum).toContain('next_month')
    expect(monthOnly.required).toEqual(['month'])
    expect(monthOnly.properties.day).toBeUndefined()
    expect(monthOnly.description).toContain('name a month but no day')
  })

  it('accepts a month-only or relative-month guild fact date', () => {
    const output = {
      ops: [
        {
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'upcoming_event',
          value: 'Server tournament',
          date: { month: 10 }
        },
        {
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'plan',
          value: 'Start a Minecraft server',
          date: { relative: 'next_month' }
        }
      ],
      summary: 'The members dated two guild facts.'
    }

    expect(parseExtractionOutput(JSON.stringify(output))).toEqual(output)
  })

  it('requires a tense on user add and update', () => {
    const user = { kind: 'user', userId: 'u1' }
    const parse = (op: object) => parseExtractionOutput(JSON.stringify({ ops: [op], summary: 's' }))

    expect(() => parse({ op: 'add', subject: user, predicate: 'hobby', value: 'chess' })).toThrow()
    expect(() => parse({ op: 'update', subject: user, existingId: 1, predicate: 'hobby', value: 'go' })).toThrow()
    expect(() => parse({ op: 'add', subject: user, predicate: 'hobby', value: 'chess', tense: 'someday' })).toThrow()
    expect(parse({ op: 'add', subject: user, predicate: 'hobby', value: 'chess', tense: 'past' }).ops[0]).toMatchObject(
      {
        tense: 'past'
      }
    )
    expect(
      parse({ op: 'update', subject: user, existingId: 1, predicate: 'hobby', value: 'go', tense: 'planned' }).ops[0]
    ).toMatchObject({ tense: 'planned' })
  })

  it('accepts a retract with no claim ID', () => {
    const user = { kind: 'user', userId: 'u1' }
    const retract = { op: 'retract', subject: user, predicate: 'hobby', value: 'chess' }

    expect(parseExtractionOutput(JSON.stringify({ ops: [retract], summary: 's' })).ops[0]).toEqual(retract)
    for (const op of [
      { ...retract, existingId: 1 },
      { ...retract, tense: 'past' },
      { ...retract, subject: { kind: 'guild' }, predicate: 'rule' },
      { op: 'retract', subject: user, predicate: 'hobby' }
    ]) {
      expect(() => parseExtractionOutput(JSON.stringify({ ops: [op], summary: 's' }))).toThrow()
    }
  })

  it('offers retract and tense in the Gemini response schema', () => {
    type Variant = { properties: Record<string, { enum?: string[] }>; required: string[] }
    const variants = ((GEMINI_SCHEMA.properties as { ops: { items: unknown } }).ops.items as { anyOf: Variant[] }).anyOf
    const userVariant = (op: string) =>
      variants.find(
        (variant) =>
          variant.properties.op?.enum?.[0] === op &&
          (variant.properties.subject as unknown as Variant).properties.kind.enum?.[0] === 'user'
      )

    const retract = userVariant('retract')
    expect(retract?.required).toEqual(['op', 'subject', 'predicate', 'value'])
    expect(retract?.properties.existingId).toBeUndefined()
    expect(retract?.properties.predicate.enum).toEqual(Object.keys(PREDICATES))
    for (const op of ['add', 'update']) {
      expect(userVariant(op)?.required).toContain('tense')
      expect(userVariant(op)?.properties.tense.enum).toEqual(['current', 'past', 'planned'])
    }
    expect(userVariant('remove')).toBeDefined()
    expect(userVariant('remove')?.properties.tense).toBeUndefined()
    const guildVariants = variants.filter(
      (variant) => (variant.properties.subject as unknown as Variant | undefined)?.properties.kind.enum?.[0] === 'guild'
    )
    expect(guildVariants.length).toBeGreaterThan(0)
    for (const variant of guildVariants) expect(variant.properties.tense).toBeUndefined()
  })

  it('generates the Gemini schema the extractor sent before #296, bounds aside', () => {
    expect(comparable(GEMINI_SCHEMA)).toEqual(comparable(LEGACY_GEMINI_EXTRACTION_SCHEMA))
  })

  it('keeps sending the frozen legacy Gemini schema on the legacy config', () => {
    expect(EXTRACTION_RESPONSE_SCHEMA).toEqual(LEGACY_GEMINI_EXTRACTION_SCHEMA)
  })

  it('keeps the existing-claim ID floor the legacy schema sent', () => {
    type Variant = { properties: Record<string, unknown> }
    const variants = ((GEMINI_SCHEMA.properties as { ops: { items: unknown } }).ops.items as { anyOf: Variant[] }).anyOf
    for (const variant of variants.filter((candidate) => 'existingId' in candidate.properties)) {
      expect(variant.properties.existingId).toEqual({ type: 'integer', minimum: 1 })
    }
  })

  it('encodes the extraction schema for Anthropic without bounds and for OpenAI strict mode', () => {
    const anthropic = requestSchema(ExtractionOutputSchema, 'forced_tool')
    for (const key of ['minimum', 'maximum', 'minLength']) expect(keysIn(anthropic).has(key)).toBe(false)
    const strict = requestSchema(ExtractionOutputSchema, 'json_schema_strict')
    const strictJson = JSON.stringify(strict)
    expect(strictJson).toContain('"objectUserId":{"anyOf":[{"type":"string"},{"type":"null"}]}')
    expect(strictJson).not.toContain('minLength')
  })
})
