import type { Path } from './yamlEdit'

export type JsonSchema = { [key: string]: unknown }

const asSchema = (value: unknown): JsonSchema | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonSchema) : undefined

/** Follows `$ref` and picks the most useful branch of a union, so callers see one concrete shape. */
function concrete(root: JsonSchema, node: JsonSchema | undefined): JsonSchema | undefined {
  let current = node
  for (let guard = 0; current && guard < 8; guard++) {
    const ref = current.$ref
    if (typeof ref === 'string' && ref.startsWith('#/')) {
      current = asSchema(
        ref
          .slice(2)
          .split('/')
          .reduce<unknown>((at, key) => asSchema(at)?.[key], root)
      )
      continue
    }
    const options = (current.anyOf ?? current.oneOf) as unknown[] | undefined
    if (Array.isArray(options)) {
      const branches = options.map(asSchema).filter((option): option is JsonSchema => Boolean(option))
      current = branches.find((option) => option.type === 'object' || option.type === 'array') ?? branches[0]
      continue
    }
    return current
  }
  return current
}

/** The schema of the value at `path`, or undefined where the schema says nothing. */
export function schemaAt(root: JsonSchema | undefined, path: Path): JsonSchema | undefined {
  if (!root) return undefined
  let node = concrete(root, root)
  for (const part of path) {
    if (!node) return undefined
    if (typeof part === 'number') node = concrete(root, asSchema(node.items))
    else node = concrete(root, asSchema(asSchema(node.properties)?.[part]) ?? asSchema(node.additionalProperties))
  }
  return node
}

/** A map whose keys are data (moods, faces, models), so entries may be added and removed. */
export function isRecordSchema(node: JsonSchema | undefined): boolean {
  return Boolean(node && asSchema(node.additionalProperties) && !asSchema(node.properties))
}

/** An empty value of the shape a schema describes, for a new list item or record entry. */
export function blankFor(root: JsonSchema | undefined, node: JsonSchema | undefined): unknown {
  const shape = root ? concrete(root, node) : node
  if (!shape) return ''
  if (Array.isArray(shape.enum) && shape.enum.length > 0) return shape.enum[0]
  if ('default' in shape) return shape.default
  switch (shape.type) {
    case 'array':
      return []
    case 'number':
    case 'integer':
      return typeof shape.minimum === 'number' ? shape.minimum : 0
    case 'boolean':
      return false
    case 'object': {
      const properties = asSchema(shape.properties)
      if (!properties) return {}
      const required = Array.isArray(shape.required) ? (shape.required as string[]) : Object.keys(properties)
      return Object.fromEntries(
        required.filter((key) => key in properties).map((key) => [key, blankFor(root, asSchema(properties[key]))])
      )
    }
    default:
      return ''
  }
}
