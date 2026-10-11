import { z } from 'zod'
import type { ModelProfile } from './profiles.js'
import { isRecord } from './requestShape.js'

export type StructuredOutputEncoding = ModelProfile['structuredOutput']
type JsonSchema = Record<string, unknown>

const NUMERIC_BOUNDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const STRING_BOUNDS = ['minLength', 'maxLength']

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
    else if ((key === 'anyOf' || key === 'allOf' || key === 'oneOf') && Array.isArray(value)) {
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
  return adjust(generated, encoding)
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
