import { Type } from '@google/genai'
import { z } from 'zod'
import { GUILD_PREDICATES, type GuildPredicateId, PREDICATES, type PredicateId } from './predicates.js'

type DatedGuildPredicateId = 'upcoming_event' | 'plan'
type UndatedGuildPredicateId = Exclude<GuildPredicateId, DatedGuildPredicateId>

const DATED_GUILD_PREDICATES: readonly DatedGuildPredicateId[] = ['upcoming_event', 'plan']
const UNDATED_GUILD_PREDICATES = (Object.keys(GUILD_PREDICATES) as GuildPredicateId[]).filter(
  (predicate): predicate is UndatedGuildPredicateId =>
    !(DATED_GUILD_PREDICATES as readonly string[]).includes(predicate)
)

const UserSubjectSchema = z.object({ kind: z.literal('user'), userId: z.string().min(1) }).strict()
const GuildSubjectSchema = z.object({ kind: z.literal('guild') }).strict()
const PredicateSchema = z.enum(Object.keys(PREDICATES) as [PredicateId, ...PredicateId[]])
const GuildPredicateSchema = z.enum(Object.keys(GUILD_PREDICATES) as [GuildPredicateId, ...GuildPredicateId[]])
const DatedGuildPredicateSchema = z.enum(DATED_GUILD_PREDICATES as [DatedGuildPredicateId, ...DatedGuildPredicateId[]])
const UndatedGuildPredicateSchema = z.enum(
  UNDATED_GUILD_PREDICATES as [UndatedGuildPredicateId, ...UndatedGuildPredicateId[]]
)
const TenseSchema = z.enum(['current', 'past', 'planned'])
const ExistingIdSchema = z.number().int().min(1)
// The range is checked against the episode later: a wrong line must lose only the citation, never the extraction.
// Remove and retract write no evidence, but they accept the field too, so a stray citation cannot fail a strict parse.
const SourceLineSchema = z.number().int().optional()

const YearSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('The year, only when the messages state one. Omit it otherwise.')
const MonthSchema = z.number().int().min(1).max(12).describe('The month, 1-12.')
// One shape per way the messages can name a date, so a constrained decoder cannot invent a day for a month.
const GuildFactDateSchema = z.union([
  z
    .object({
      year: YearSchema.optional(),
      month: MonthSchema,
      day: z.number().int().min(1).max(31).describe('The day of the month, 1-31.')
    })
    .strict()
    .describe('A calendar date named by the messages. Give the month and day whenever the messages name a day.'),
  z
    .object({ year: YearSchema.optional(), month: MonthSchema })
    .strict()
    .describe('Use this only when the messages name a month but no day. Never invent a day to fill this shape in.'),
  z
    .object({
      relative: z.enum(['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'next_month']),
      weekday: z
        .enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
        .optional()
        .describe('The day of the week, only with this_week or next_week.')
    })
    .strict()
    .describe('A date given only relative to today. Use this when the messages give no calendar date or month.')
])

const AddOperationSchema = z
  .object({
    op: z.literal('add'),
    subject: UserSubjectSchema,
    predicate: PredicateSchema,
    value: z.string(),
    tense: TenseSchema,
    objectUserId: z.string().optional(),
    sourceLine: SourceLineSchema
  })
  .strict()
const UpdateOperationSchema = z
  .object({
    op: z.literal('update'),
    subject: UserSubjectSchema,
    existingId: ExistingIdSchema,
    predicate: PredicateSchema,
    value: z.string(),
    tense: TenseSchema,
    objectUserId: z.string().optional(),
    sourceLine: SourceLineSchema
  })
  .strict()
const RemoveOperationSchema = z
  .object({
    op: z.literal('remove'),
    subject: UserSubjectSchema,
    existingId: ExistingIdSchema,
    predicate: PredicateSchema,
    value: z.string(),
    sourceLine: SourceLineSchema
  })
  .strict()
export const RetractOperationSchema = z
  .object({
    op: z.literal('retract'),
    subject: UserSubjectSchema,
    predicate: PredicateSchema,
    value: z.string(),
    sourceLine: SourceLineSchema
  })
  .strict()
const DatedGuildAddOperationSchema = z
  .object({
    op: z.literal('add'),
    subject: GuildSubjectSchema,
    predicate: DatedGuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema,
    sourceLine: SourceLineSchema
  })
  .strict()
const DatedGuildUpdateOperationSchema = z
  .object({
    op: z.literal('update'),
    subject: GuildSubjectSchema,
    existingId: ExistingIdSchema,
    predicate: DatedGuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema,
    sourceLine: SourceLineSchema
  })
  .strict()
const GuildRemoveOperationSchema = z
  .object({
    op: z.literal('remove'),
    subject: GuildSubjectSchema,
    existingId: ExistingIdSchema,
    predicate: GuildPredicateSchema,
    value: z.string(),
    sourceLine: SourceLineSchema
  })
  .strict()
const UndatedGuildAddOperationSchema = z
  .object({
    op: z.literal('add'),
    subject: GuildSubjectSchema,
    predicate: UndatedGuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema.optional(),
    sourceLine: SourceLineSchema
  })
  .strict()
const UndatedGuildUpdateOperationSchema = z
  .object({
    op: z.literal('update'),
    subject: GuildSubjectSchema,
    existingId: ExistingIdSchema,
    predicate: UndatedGuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema.optional(),
    sourceLine: SourceLineSchema
  })
  .strict()
const NoopOperationSchema = z.object({ op: z.literal('noop') }).strict()

export const ExtractionOperationSchema = z.union([
  AddOperationSchema,
  UpdateOperationSchema,
  RemoveOperationSchema,
  RetractOperationSchema,
  DatedGuildAddOperationSchema,
  DatedGuildUpdateOperationSchema,
  GuildRemoveOperationSchema,
  UndatedGuildAddOperationSchema,
  UndatedGuildUpdateOperationSchema,
  NoopOperationSchema
])

export const ExtractionOutputSchema = z
  .object({
    ops: z.array(ExtractionOperationSchema),
    summary: z.string().min(1)
  })
  .strict()

export const ExtractionTransportSchema = z
  .object({ ops: z.array(z.unknown()), summary: z.string().min(1) })
  .strict()
  .transform((output, context) => {
    const ops: z.infer<typeof ExtractionOperationSchema>[] = []
    let invalidOps = 0
    for (const op of output.ops) {
      const result = ExtractionOperationSchema.safeParse(op)
      if (result.success) ops.push(result.data)
      else invalidOps++
    }
    if (output.ops.length > 0 && ops.length === 0) {
      context.addIssue({ code: 'custom', message: 'Every extraction operation was invalid' })
      return z.NEVER
    }
    return { ...output, ops, invalidOps }
  })

export type UserSubject = z.infer<typeof UserSubjectSchema>
export type GuildSubject = Readonly<{ kind: 'guild' }>
export type ExtractionSubject = UserSubject | GuildSubject
export type GuildFactDate = Readonly<{
  year?: number
  month?: number
  day?: number
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  relative?: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month' | 'next_month'
}>
export type ExtractionOp = z.infer<typeof ExtractionOutputSchema>['ops'][number]
export type UserExtractionOp = Extract<ExtractionOp, { subject: UserSubject }>
export type GuildExtractionOp = Exclude<ExtractionOp, UserExtractionOp | { op: 'noop' }>
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>

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
  withSourceLine?: boolean
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
  if (input.withSourceLine) {
    properties.sourceLine = { type: Type.INTEGER, minimum: 1 }
  }
  return { type: Type.OBJECT, properties, required }
}

const userPredicates = Object.keys(PREDICATES)
const guildPredicates = Object.keys(GUILD_PREDICATES)
const datedGuildPredicates = ['upcoming_event', 'plan']
const undatedGuildPredicates = guildPredicates.filter((predicate) => !datedGuildPredicates.includes(predicate))

export const EXTRACTION_RESPONSE_SCHEMA = {
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
            withTense: true,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withObjectUserId: true,
            withTense: true,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'remove',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'retract',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'add',
            subject: guildSubjectResponseSchema,
            predicates: datedGuildPredicates,
            withDate: true,
            dateRequired: true,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: guildSubjectResponseSchema,
            predicates: datedGuildPredicates,
            withDate: true,
            dateRequired: true,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'remove',
            subject: guildSubjectResponseSchema,
            predicates: guildPredicates,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'add',
            subject: guildSubjectResponseSchema,
            predicates: undatedGuildPredicates,
            withDate: true,
            withSourceLine: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: guildSubjectResponseSchema,
            predicates: undatedGuildPredicates,
            withDate: true,
            withSourceLine: true
          }),
          responseOperationSchema({ op: 'noop' })
        ]
      }
    },
    summary: { type: Type.STRING }
  },
  required: ['ops', 'summary']
}
