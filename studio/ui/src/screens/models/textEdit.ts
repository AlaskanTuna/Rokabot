import { type Document, type Node, type Pair, type Scalar, isMap, isScalar, parseDocument } from 'yaml'
import { type Path, type Primitive, deleteNode, setNode, setScalar } from '../../lib/yamlEdit'

export type Flow = Primitive | { [key: string]: Flow }

const RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i

/** A scalar as YAML text: plain when that reads back as the same string, else single-quoted, as config.yml does. */
export function yamlScalar(value: Primitive): string {
  if (typeof value !== 'string') return String(value)
  return /^[A-Za-z_][\w./-]*$/.test(value) && !RESERVED.test(value) ? value : `'${value.replaceAll("'", "''")}'`
}

export function flowMap(value: { [key: string]: Flow }): string {
  const entries = Object.entries(value).map(
    ([key, entry]) =>
      `${yamlScalar(key)}: ${entry !== null && typeof entry === 'object' ? flowMap(entry) : yamlScalar(entry)}`
  )
  return `{ ${entries.join(', ')} }`
}

export function readDoc(text: string): Document.Parsed | null {
  try {
    const doc = parseDocument(text)
    return doc.errors.length > 0 ? null : doc
  } catch {
    return null
  }
}

export function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1
}

export function lineEnd(text: string, index: number): number {
  const end = text.indexOf('\n', index)
  return end === -1 ? text.length : end
}

function pairOf(map: Node, key: string): Pair | undefined {
  if (!isMap(map)) return undefined
  return (map.items as Pair[]).find((pair) => String((pair.key as Scalar | null)?.value) === key)
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => sameValue(left[key], right[key]))
}

function withPath(data: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const node = (data && typeof data === 'object' ? data : {}) as Record<string | number, unknown>
  const copy = (Array.isArray(node) ? [...node] : { ...node }) as Record<string | number, unknown>
  if (rest.length === 0 && value === undefined) delete copy[head]
  else copy[head] = withPath(node[head], rest, value)
  return copy
}

/** Whether `next` parses to exactly `expected`, so an in-place edit can never change more than it meant to. */
function reads(next: string, expected: unknown): boolean {
  const doc = readDoc(next)
  return doc !== null && sameValue(doc.toJS(), expected)
}

/**
 * Adds a line to a block map after the first `after` key present, or after its last entry, leaving every other byte
 * (comments and layout included) as it was. Returns null when the map cannot take a line in place.
 */
function insertLine(
  text: string,
  mapPath: Path,
  build: (indent: string) => string,
  expected: unknown,
  after: string[]
) {
  const doc = readDoc(text)
  const map = doc?.getIn(mapPath, true) as Node | undefined
  if (!doc || !isMap(map) || map.flow || map.items.length === 0) return null
  const firstKey = (map.items[0] as Pair).key as Node | null
  if (!firstKey?.range) return null
  const indent = text.slice(lineStart(text, firstKey.range[0]), firstKey.range[0])
  if (!/^ *$/.test(indent)) return null
  const anchor = after.map((name) => pairOf(map, name)).find(Boolean) ?? (map.items.at(-1) as Pair)
  const end = ((anchor.value as Node | null)?.range ?? (anchor.key as Node | null)?.range)?.[1]
  if (end === undefined) return null
  const at = lineEnd(text, Math.max(end - 1, 0))
  const next = `${text.slice(0, at)}\n${build(indent)}${text.slice(at)}`
  return reads(next, expected) ? next : null
}

function valueText(value: Flow): string {
  return value !== null && typeof value === 'object' ? flowMap(value) : yamlScalar(value)
}

/** Writes `mapPath.key` as one new line (a flow map for objects); falls back to re-serializing the document. */
export function insertPair(text: string, mapPath: Path, key: string, value: Flow, after: string[] = []): string {
  const doc = readDoc(text)
  if (!doc) return text
  const expected = withPath(doc.toJS(), [...mapPath, key], value)
  const line = (indent: string) => `${indent}${yamlScalar(key)}: ${valueText(value)}`
  return insertLine(text, mapPath, line, expected, after) ?? setNode(text, [...mapPath, key], value)
}

/** Sets a scalar in place, or adds it as a new line after one of the `after` keys when it is missing. */
export function putScalar(text: string, path: Path, value: Primitive, after: string[] = []): string {
  const doc = readDoc(text)
  if (doc?.hasIn(path)) return setScalar(text, path, value)
  return insertPair(text, path.slice(0, -1), String(path.at(-1)), value, after)
}

/** Deletes a block-map entry by removing its own lines; other comments and layout stay byte for byte. */
export function removePair(text: string, mapPath: Path, key: string): string {
  const doc = readDoc(text)
  const map = doc?.getIn(mapPath, true) as Node | undefined
  const pair = doc && map && isMap(map) && !map.flow ? pairOf(map, key) : undefined
  const keyRange = (pair?.key as Node | null | undefined)?.range
  if (doc && pair && keyRange) {
    const start = lineStart(text, keyRange[0])
    const end = ((pair.value as Node | null)?.range ?? keyRange)[1]
    if (/^ *$/.test(text.slice(start, keyRange[0]))) {
      const stop = lineEnd(text, Math.max(end - 1, keyRange[0]))
      const next = text.slice(0, start) + text.slice(Math.min(text.length, stop + 1))
      if (reads(next, withPath(doc.toJS(), [...mapPath, key], undefined))) return next
    }
  }
  return deleteNode(text, [...mapPath, key])
}

let removedFallback: { prefix: string; suffix: string } | null = null

/**
 * Points `llm.fallback` at a model key, or removes it for "None". The removed line is remembered for this session, so
 * picking a fallback again restores its inline comment instead of writing a bare line.
 */
export function setFallback(text: string, key: string | null): string {
  const doc = readDoc(text)
  if (!doc) return text
  const node = doc.getIn(['llm', 'fallback'], true) as Node | undefined
  if (key === null) {
    if (node === undefined) return text
    if (isScalar(node) && node.range) {
      const start = lineStart(text, node.range[0])
      const line = text.slice(start, lineEnd(text, node.range[0]))
      removedFallback = { prefix: line.slice(0, node.range[0] - start), suffix: line.slice(node.range[1] - start) }
    }
    return removePair(text, ['llm'], 'fallback')
  }
  if (node !== undefined) return setScalar(text, ['llm', 'fallback'], key)
  const remembered = removedFallback
  if (remembered) {
    const expected = withPath(doc.toJS(), ['llm', 'fallback'], key)
    const next = insertLine(
      text,
      ['llm'],
      () => `${remembered.prefix}${yamlScalar(key)}${remembered.suffix}`,
      expected,
      ['main']
    )
    if (next) return next
  }
  return insertPair(text, ['llm'], 'fallback', key, ['main'])
}
