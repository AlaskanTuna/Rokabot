// Frozen copy of the hand-written Gemini schema extraction sent before #296; the generated schema must match it.
import { Type } from '@google/genai'
import { GUILD_PREDICATES, PREDICATES } from '../predicates.js'

const userSubjectResponseSchema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: ['user'] },
    userId: { type: Type.STRING }
  },
  required: ['kind', 'userId']
}
const guildSubjectResponseSchema = {
  type: Type.OBJECT,
  properties: { kind: { type: Type.STRING, enum: ['guild'] } },
  required: ['kind']
}
const calendarDateProperties = {
  year: { type: Type.INTEGER, description: 'The year, only when the messages state one. Omit it otherwise.' },
  month: { type: Type.INTEGER, description: 'The month, 1-12.' },
  day: { type: Type.INTEGER, description: 'The day of the month, 1-31.' }
}
const monthDateProperties = {
  year: { type: Type.INTEGER, description: 'The year, only when the messages state one. Omit it otherwise.' },
  month: { type: Type.INTEGER, description: 'The month, 1-12.' }
}
const relativeDateProperties = {
  relative: {
    type: Type.STRING,
    enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'next_month']
  },
  weekday: {
    type: Type.STRING,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    description: 'The day of the week, only with this_week or next_week.'
  }
}
const guildFactDateResponseSchema = {
  anyOf: [
    {
      type: Type.OBJECT,
      description: 'A calendar date named by the messages. Give the month and day whenever the messages name a day.',
      properties: calendarDateProperties,
      required: ['month', 'day']
    },
    {
      type: Type.OBJECT,
      description: 'Use this only when the messages name a month but no day. Never invent a day to fill this shape in.',
      properties: monthDateProperties,
      required: ['month']
    },
    {
      type: Type.OBJECT,
      description: 'A date given only relative to today. Use this when the messages give no calendar date or month.',
      properties: relativeDateProperties,
      required: ['relative']
    }
  ]
}

function responseOperationSchema(input: {
  op: 'add' | 'update' | 'remove' | 'retract' | 'noop'
  subject?: typeof userSubjectResponseSchema | typeof guildSubjectResponseSchema
  predicates?: string[]
  withObjectUserId?: boolean
  withTense?: boolean
  withDate?: boolean
  dateRequired?: boolean
}): Record<string, unknown> {
  if (input.op === 'noop') {
    return {
      type: Type.OBJECT,
      properties: { op: { type: Type.STRING, enum: ['noop'] } },
      required: ['op']
    }
  }

  const properties: Record<string, unknown> = {
    op: { type: Type.STRING, enum: [input.op] },
    subject: input.subject,
    predicate: { type: Type.STRING, enum: input.predicates },
    value: { type: Type.STRING }
  }
  const required = ['op', 'subject', 'predicate', 'value']
  if (input.op === 'update' || input.op === 'remove') {
    properties.existingId = { type: Type.INTEGER, minimum: 1 }
    required.push('existingId')
  }
  if (input.withObjectUserId) properties.objectUserId = { type: Type.STRING }
  if (input.withTense) {
    properties.tense = { type: Type.STRING, enum: ['current', 'past', 'planned'] }
    required.push('tense')
  }
  if (input.withDate) {
    properties.date = guildFactDateResponseSchema
    if (input.dateRequired) required.push('date')
  }
  return { type: Type.OBJECT, properties, required }
}

const userPredicates = Object.keys(PREDICATES)
const guildPredicates = Object.keys(GUILD_PREDICATES)
const datedGuildPredicates = ['upcoming_event', 'plan']
const undatedGuildPredicates = guildPredicates.filter((predicate) => !datedGuildPredicates.includes(predicate))

export const LEGACY_GEMINI_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ops: {
      type: Type.ARRAY,
      items: {
        anyOf: [
          responseOperationSchema({
            op: 'add',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withObjectUserId: true,
            withTense: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withObjectUserId: true,
            withTense: true
          }),
          responseOperationSchema({ op: 'remove', subject: userSubjectResponseSchema, predicates: userPredicates }),
          responseOperationSchema({ op: 'retract', subject: userSubjectResponseSchema, predicates: userPredicates }),
          responseOperationSchema({
            op: 'add',
            subject: guildSubjectResponseSchema,
            predicates: datedGuildPredicates,
            withDate: true,
            dateRequired: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: guildSubjectResponseSchema,
            predicates: datedGuildPredicates,
            withDate: true,
            dateRequired: true
          }),
          responseOperationSchema({ op: 'remove', subject: guildSubjectResponseSchema, predicates: guildPredicates }),
          responseOperationSchema({
            op: 'add',
            subject: guildSubjectResponseSchema,
            predicates: undatedGuildPredicates,
            withDate: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: guildSubjectResponseSchema,
            predicates: undatedGuildPredicates,
            withDate: true
          }),
          responseOperationSchema({ op: 'noop' })
        ]
      }
    },
    summary: { type: Type.STRING }
  },
  required: ['ops', 'summary']
}
