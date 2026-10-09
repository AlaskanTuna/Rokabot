import { describe, expect, it } from 'vitest'
import { EXTRACTION_RESPONSE_SCHEMA, parseExtractionOutput } from '../extractionSchema.js'
import { PREDICATES } from '../predicates.js'

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
      EXTRACTION_RESPONSE_SCHEMA as unknown as {
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
    const variants = (EXTRACTION_RESPONSE_SCHEMA.properties.ops.items as { anyOf: Variant[] }).anyOf
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
})
