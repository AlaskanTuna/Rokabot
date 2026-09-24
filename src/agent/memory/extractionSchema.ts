import { Type } from '@google/genai'
import { z } from 'zod'
import { PREDICATES, type PredicateId } from './predicates.js'

const UserSubjectSchema = z.object({ kind: z.literal('user'), userId: z.string().min(1) }).strict()
const PredicateSchema = z.enum(Object.keys(PREDICATES) as [PredicateId, ...PredicateId[]])
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
const NoopOperationSchema = z.object({ op: z.literal('noop') }).strict()

export const ExtractionOutputSchema = z
  .object({
    ops: z.array(
      z.discriminatedUnion('op', [
        AddOperationSchema,
        UpdateOperationSchema,
        RemoveOperationSchema,
        NoopOperationSchema
      ])
    ),
    summary: z.string().min(1)
  })
  .strict()

export type UserSubject = z.infer<typeof UserSubjectSchema>
export type ExtractionOp = z.infer<typeof ExtractionOutputSchema>['ops'][number]
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>

const userSubjectResponseSchema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: ['user'] },
    userId: { type: Type.STRING }
  },
  required: ['kind', 'userId']
}

export const EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ops: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          op: { type: Type.STRING, enum: ['add', 'update', 'remove', 'noop'] },
          subject: userSubjectResponseSchema,
          existingId: { type: Type.INTEGER, minimum: 1 },
          predicate: { type: Type.STRING, enum: Object.keys(PREDICATES) },
          value: { type: Type.STRING },
          objectUserId: { type: Type.STRING }
        },
        required: ['op']
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
