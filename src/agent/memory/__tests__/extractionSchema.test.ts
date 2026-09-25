import { describe, expect, it } from 'vitest'
import { EXTRACTION_RESPONSE_SCHEMA, parseExtractionOutput } from '../extractionSchema.js'

const subject = { kind: 'user', userId: 'u-1' }

describe('parseExtractionOutput', () => {
  it('accepts add, update, remove, and noop operations', () => {
    const output = {
      ops: [
        { op: 'add', subject, predicate: 'likes', value: 'tea', objectUserId: 'u-2' },
        { op: 'update', subject, existingId: 1, predicate: 'likes', value: 'green tea' },
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
      { op: 'add', subject, predicate: 'plan', value: 'Game night', date: { relative: 'tomorrow' } },
      { op: 'add', subject: { kind: 'guild' }, predicate: 'likes', value: 'tea' },
      {
        op: 'add',
        subject: { kind: 'guild' },
        predicate: 'plan',
        value: 'Game night',
        date: { relative: 'tomorrow' },
        objectUserId: 'u-2'
      },
      { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea', date: {} },
      { op: 'add', subject: { kind: 'guild' }, predicate: 'plan', value: 'Game night' }
    ]) {
      expect(() => parseExtractionOutput(JSON.stringify({ ops: [op], summary: 'A fact.' }))).toThrow()
    }
  })

  it('rejects an update without an existing claim ID', () => {
    expect(() =>
      parseExtractionOutput(
        JSON.stringify({
          ops: [{ op: 'update', subject, predicate: 'likes', value: 'tea' }],
          summary: 'A member shared a preference.'
        })
      )
    ).toThrow()
  })

  it.each([
    ['missing summary', { ops: [{ op: 'noop' }] }],
    ['unknown predicate', { ops: [{ op: 'add', subject, predicate: 'unlisted', value: 'tea' }], summary: 'A fact.' }],
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
})
