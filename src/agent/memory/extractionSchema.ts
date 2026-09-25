import { Type } from '@google/genai'
import { z } from 'zod'
import { GUILD_PREDICATES, type GuildPredicateId, PREDICATES, type PredicateId } from './predicates.js'

const UserSubjectSchema = z.object({ kind: z.literal('user'), userId: z.string().min(1) }).strict()
const GuildSubjectSchema = z.object({ kind: z.literal('guild') }).strict()
const PredicateSchema = z.enum(Object.keys(PREDICATES) as [PredicateId, ...PredicateId[]])
const GuildPredicateSchema = z.enum(Object.keys(GUILD_PREDICATES) as [GuildPredicateId, ...GuildPredicateId[]])
const GuildFactDateSchema = z
  .object({
    year: z.number().int().min(1).max(9999).optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    weekday: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional(),
    relative: z.enum(['today', 'tomorrow', 'this_week', 'next_week']).optional()
  })
  .strict()
  .refine((date) => Object.values(date).some((value) => value !== undefined))

const AddOperationSchema = z
  .object({
    op: z.literal('add'),
    subject: UserSubjectSchema,
    predicate: PredicateSchema,
    value: z.string(),
    objectUserId: z.string().optional()
  })
  .strict()
const UpdateOperationSchema = z
  .object({
    op: z.literal('update'),
    subject: UserSubjectSchema,
    existingId: z.number().int().positive(),
    predicate: PredicateSchema,
    value: z.string(),
    objectUserId: z.string().optional()
  })
  .strict()
const RemoveOperationSchema = z
  .object({
    op: z.literal('remove'),
    subject: UserSubjectSchema,
    existingId: z.number().int().positive(),
    predicate: PredicateSchema,
    value: z.string()
  })
  .strict()

function requireEventDate(
  operation: { predicate: GuildPredicateId; date?: GuildFactDate },
  context: z.RefinementCtx
): void {
  if ((operation.predicate === 'upcoming_event' || operation.predicate === 'plan') && !operation.date) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Guild events and plans require a date' })
  }
}

const GuildAddOperationSchema = z
  .object({
    op: z.literal('add'),
    subject: GuildSubjectSchema,
    predicate: GuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema.optional()
  })
  .strict()
  .superRefine(requireEventDate)
const GuildUpdateOperationSchema = z
  .object({
    op: z.literal('update'),
    subject: GuildSubjectSchema,
    existingId: z.number().int().positive(),
    predicate: GuildPredicateSchema,
    value: z.string(),
    date: GuildFactDateSchema.optional()
  })
  .strict()
  .superRefine(requireEventDate)
const GuildRemoveOperationSchema = z
  .object({
    op: z.literal('remove'),
    subject: GuildSubjectSchema,
    existingId: z.number().int().positive(),
    predicate: GuildPredicateSchema,
    value: z.string()
  })
  .strict()
const NoopOperationSchema = z.object({ op: z.literal('noop') }).strict()

export const ExtractionOutputSchema = z
  .object({
    ops: z.array(
      z.union([
        AddOperationSchema,
        UpdateOperationSchema,
        RemoveOperationSchema,
        GuildAddOperationSchema,
        GuildUpdateOperationSchema,
        GuildRemoveOperationSchema,
        NoopOperationSchema
      ])
    ),
    summary: z.string().min(1)
  })
  .strict()

export type UserSubject = z.infer<typeof UserSubjectSchema>
export type GuildSubject = Readonly<{ kind: 'guild' }>
export type ExtractionSubject = UserSubject | GuildSubject
export type GuildFactDate = Readonly<{
  year?: number
  month?: number
  day?: number
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  relative?: 'today' | 'tomorrow' | 'this_week' | 'next_week'
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
const guildFactDateResponseSchema = {
  type: Type.OBJECT,
  properties: {
    year: { type: Type.INTEGER },
    month: { type: Type.INTEGER },
    day: { type: Type.INTEGER },
    weekday: {
      type: Type.STRING,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    relative: { type: Type.STRING, enum: ['today', 'tomorrow', 'this_week', 'next_week'] }
  }
}

function responseOperationSchema(input: {
  op: 'add' | 'update' | 'remove' | 'noop'
  subject?: typeof userSubjectResponseSchema | typeof guildSubjectResponseSchema
  predicates?: string[]
  withObjectUserId?: boolean
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
            withObjectUserId: true
          }),
          responseOperationSchema({
            op: 'update',
            subject: userSubjectResponseSchema,
            predicates: userPredicates,
            withObjectUserId: true
          }),
          responseOperationSchema({ op: 'remove', subject: userSubjectResponseSchema, predicates: userPredicates }),
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

export function parseExtractionOutput(text: string): ExtractionOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Memory extraction returned invalid JSON')
  }
  const result = ExtractionOutputSchema.safeParse(parsed)
  if (!result.success) throw new Error('Memory extraction output failed schema validation')
  return result.data
}
