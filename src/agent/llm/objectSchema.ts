import { z } from 'zod'
import type { ModelProfile } from './profiles.js'
import { isRecord } from './requestShape.js'

export type StructuredOutputEncoding = ModelProfile['structuredOutput']
type JsonSchema = Record<string, unknown>

const NUMERIC_BOUNDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const STRING_BOUNDS = ['minLength', 'maxLength']
const ANTHROPIC_OPTIONAL_PARAMETER_LIMIT = 24
const ANTHROPIC_UNION_PARAMETER_LIMIT = 24

// What each encoding rejects. The original zod schema still enforces every bound when the reply is validated.
const UNSUPPORTED: Record<StructuredOutputEncoding, ReadonlySet<string>> = {
  response_json_schema: new Set(['exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', ...STRING_BOUNDS]),
  json_schema_strict: new Set(STRING_BOUNDS),
  forced_tool: new Set([...NUMERIC_BOUNDS, ...STRING_BOUNDS]),
  json_object: new Set()
}

function allowsNull(node: JsonSchema): boolean {
  if (node.type === 'null' || (Array.isArray(node.type) && node.type.includes('null'))) return true
  return Array.isArray(node.anyOf) && node.anyOf.some((branch) => isRecord(branch) && allowsNull(branch))
}

function anthropicParameterCounts(node: unknown): { optional: number; unions: number } {
  let optional = 0
  let unions = 0
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
    } else if (isRecord(current)) {
      if (Array.isArray(current.anyOf) || (Array.isArray(current.type) && current.type.length > 1)) unions++
      if (current.type === 'object' && isRecord(current.properties)) {
        const required = new Set(Array.isArray(current.required) ? (current.required as string[]) : [])
        optional += Object.keys(current.properties).filter((name) => !required.has(name)).length
      }
      for (const [key, value] of Object.entries(current)) {
        if (key !== '$ref') visit(value)
      }
    }
  }
  visit(node)
  return { optional, unions }
}

function objectBranches(value: unknown): value is JsonSchema[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((branch) => isRecord(branch) && branch.type === 'object' && isRecord(branch.properties))
  )
}

function mergeObjectBranches(branches: JsonSchema[]): JsonSchema {
  const properties = new Map<string, JsonSchema[]>()
  const requiredSets = branches.map(
    (branch) => new Set(Array.isArray(branch.required) ? (branch.required as string[]) : [])
  )
  for (const branch of branches) {
    for (const [name, child] of Object.entries(branch.properties as Record<string, JsonSchema>)) {
      properties.set(name, [...(properties.get(name) ?? []), child])
    }
  }

  const mergedProperties = Object.fromEntries([...properties].map(([name, children]) => [name, mergeSchemas(children)]))
  const required = [...(requiredSets[0] ?? [])].filter((name) => requiredSets.every((set) => set.has(name)))
  const descriptions = [
    ...new Set(branches.map((branch) => branch.description).filter((value) => typeof value === 'string'))
  ]
  return {
    type: 'object',
    ...(descriptions.length > 0 ? { description: descriptions.join(' ') } : {}),
    properties: mergedProperties,
    required,
    additionalProperties: false
  }
}

function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  const distinct = [...new Map(schemas.map((schema) => [JSON.stringify(schema), schema])).values()]
  if (distinct.length === 1) return distinct[0]
  if (distinct.every((schema) => schema.type === 'object' && isRecord(schema.properties))) {
    return mergeObjectBranches(distinct)
  }
  if (
    distinct.every(
      (schema) =>
        schema.type === 'string' &&
        Array.isArray(schema.enum) &&
        schema.enum.every((value) => typeof value === 'string')
    )
  ) {
    return { ...distinct[0], enum: [...new Set(distinct.flatMap((schema) => schema.enum as string[]))] }
  }
  return { anyOf: distinct }
}

// Anthropic's grammar expands object unions; the original Zod schema validates the looser reply after generation.
function compactObjectUnions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(compactObjectUnions)
  if (!isRecord(node)) return node

  const out = Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== 'anyOf')
      .map(([key, value]) => [key, compactObjectUnions(value)])
  ) as JsonSchema
  if (!objectBranches(node.anyOf)) {
    if (Array.isArray(node.anyOf)) out.anyOf = node.anyOf.map(compactObjectUnions)
    return out
  }

  const branches = node.anyOf.map((branch) => compactObjectUnions(branch) as JsonSchema)
  const byOperation = new Map<string, JsonSchema[]>()
  let hasOperationTag = true
  for (const branch of branches) {
    const properties = branch.properties as Record<string, JsonSchema>
    const operation = properties.op
    const values = operation?.enum
    if (operation?.type !== 'string' || !Array.isArray(values) || values.length !== 1) {
      hasOperationTag = false
      break
    }
    const operationName = values[0] as string
    const subject = properties.subject
    const subjectProperties =
      subject && isRecord(subject.properties) ? (subject.properties as Record<string, JsonSchema>) : undefined
    const subjectKind = subjectProperties?.kind
    const subjectKinds = subjectKind && isRecord(subjectKind) && Array.isArray(subjectKind.enum) ? subjectKind.enum : []
    // This add split fixes the observed predicate mismatch; wider subject splits exceed Anthropic's grammar limit.
    const key =
      operationName === 'add' && subjectKinds.length === 1
        ? JSON.stringify([operationName, subjectKinds[0]])
        : JSON.stringify([operationName])
    byOperation.set(key, [...(byOperation.get(key) ?? []), branch])
  }

  if (!hasOperationTag) return { ...out, anyOf: branches }

  const groups = [...byOperation.values()]
  const merged = groups.map(mergeObjectBranches)
  if (merged.length === 1) return { ...out, ...merged[0] }
  return { ...out, anyOf: merged }
}

function strictObject(node: JsonSchema): JsonSchema {
  const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : [])
  const properties: Record<string, JsonSchema> = {}
  for (const [name, child] of Object.entries(node.properties as Record<string, JsonSchema>)) {
    // A null in a strict reply is read back as "omitted", which is only sound when the schema never allows null.
    if (allowsNull(child)) throw new Error(`Structured output property ${name} must not be nullable`)
    properties[name] = required.has(name) ? child : { anyOf: [child, { type: 'null' }] }
  }
  return { ...node, properties, required: Object.keys(properties), additionalProperties: false }
}

function adjust(node: JsonSchema, encoding: StructuredOutputEncoding): JsonSchema {
  const out: JsonSchema = {}
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED[encoding].has(key)) continue
    // zod writes the safe-integer range on every int; it constrains nothing and some providers reject it.
    if ((key === 'minimum' || key === 'maximum') && Math.abs(value as number) === Number.MAX_SAFE_INTEGER) continue
    if (key === 'const') out.enum = [value]
    else if (key === 'properties' && isRecord(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, adjust(child as JsonSchema, encoding)])
      )
    } else if (key === 'items' && isRecord(value)) out.items = adjust(value, encoding)
    else if (key === '$defs' && isRecord(value)) {
      out.$defs = Object.fromEntries(
        Object.entries(value).map(([name, definition]) => [name, adjust(definition as JsonSchema, encoding)])
      )
    } else if ((key === 'anyOf' || key === 'allOf' || key === 'oneOf') && Array.isArray(value)) {
      out[key] = value.map((branch) => adjust(branch as JsonSchema, encoding))
    } else out[key] = value
  }
  if (out.type !== 'object' || !isRecord(out.properties)) return out
  if (encoding === 'json_schema_strict') return strictObject(out)
  if (encoding === 'forced_tool') out.additionalProperties = false
  return out
}

export function requestSchema(schema: z.ZodType, encoding: StructuredOutputEncoding): JsonSchema {
  const { $schema: _dialect, ...generated } = z.toJSONSchema(schema) as JsonSchema
  const adjusted = adjust(generated, encoding)
  if (encoding !== 'forced_tool') return adjusted
  const compacted = compactObjectUnions(adjusted) as JsonSchema
  const counts = anthropicParameterCounts(compacted)
  if (counts.optional > ANTHROPIC_OPTIONAL_PARAMETER_LIMIT || counts.unions > ANTHROPIC_UNION_PARAMETER_LIMIT) {
    throw new Error('Anthropic forced-tool schema exceeds its optional and union parameter limits')
  }
  return compacted
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, stripNulls(child)])
  )
}

export function normalizeReply(value: unknown, encoding: StructuredOutputEncoding): unknown {
  return encoding === 'json_schema_strict' ? stripNulls(value) : value
}
