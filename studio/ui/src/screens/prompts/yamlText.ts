import { type Document, type Node, type Pair, isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { stringifyDoc } from '../../lib/yaml'
import { type Path, deleteNode, setNode } from '../../lib/yamlEdit'

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf('\n', index)
  return end === -1 ? text.length : end
}

function readIn(value: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined),
    value
  )
}

function toJS(text: string): unknown {
  try {
    const doc = parseDocument(text)
    return doc.errors.length > 0 ? undefined : doc.toJS()
  } catch {
    return undefined
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A scalar spelled so it reads back as itself, plain when it can be, else single-quoted. */
export function spellScalar(value: string | number | boolean, flow = false): string {
  if (typeof value !== 'string') return String(value)
  const parsed = toJS(flow ? `[${value}]` : `k: ${value}`)
  const back = flow ? (parsed as unknown[] | undefined)?.[0] : (parsed as { k?: unknown } | undefined)?.k
  if (value !== '' && back === value) return value
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Replaces a list of strings. A flow list is rewritten in place, so every other byte of the file (comments, quoting)
 * stays as it was; a block list keeps its style through the document.
 */
export function setStringList(text: string, path: Path, values: string[]): string {
  const doc = parseDocument(text)
  const seq = doc.getIn(path, true) as Node | undefined
  if (isSeq(seq) && seq.flow && seq.range) {
    const next = `${text.slice(0, seq.range[0])}[${values.map((value) => spellScalar(value, true)).join(', ')}]${text.slice(seq.range[1])}`
    if (same(readIn(toJS(next), path), values)) return next
  }
  if (isSeq(seq)) {
    seq.items = values.map((value) => doc.createNode(value))
    return stringifyDoc(doc)
  }
  return setNode(text, path, values)
}

function expectAfter(doc: Document.Parsed, edit: (value: Record<string, unknown>) => void): unknown {
  const value = doc.toJS() as Record<string, unknown>
  edit(value)
  return value
}

/** Removes `key` from the block map at `path` by cutting its lines, so the rest of the file keeps its layout. */
export function removeKey(text: string, path: Path, key: string): string {
  const doc = parseDocument(text)
  const map = doc.getIn(path, true) as Node | undefined
  if (!isMap(map)) return text
  const pair = (map.items as Pair[]).find((item) => isScalar(item.key) && item.key.value === key)
  if (!pair) return text
  const keyNode = pair.key as Node
  const valueNode = pair.value as Node | null
  if (!map.flow && keyNode.range && valueNode?.range) {
    const from = lineStart(text, keyNode.range[0])
    const to = lineEnd(text, Math.max(valueNode.range[1] - 1, keyNode.range[0]))
    const next = text.slice(0, from) + text.slice(Math.min(text.length, to + 1))
    const expected = expectAfter(doc, (value) => {
      delete (readIn(value, path) as Record<string, unknown>)[key]
    })
    if (same(toJS(next), expected)) return next
  }
  return deleteNode(text, [...path, key])
}

/** Removes one item of the block list at `path` by cutting its lines. */
export function removeListItem(text: string, path: Path, index: number): string {
  const doc = parseDocument(text)
  const seq = doc.getIn(path, true) as Node | undefined
  if (!isSeq(seq)) return text
  const item = seq.items[index] as Node | undefined
  if (!seq.flow && item?.range) {
    const from = lineStart(text, item.range[0])
    const to = lineEnd(text, Math.max(item.range[1] - 1, item.range[0]))
    const next = text.slice(0, from) + text.slice(Math.min(text.length, to + 1))
    const expected = expectAfter(doc, (value) => {
      ;(readIn(value, path) as unknown[]).splice(index, 1)
    })
    if (same(toJS(next), expected)) return next
  }
  seq.delete(index)
  return stringifyDoc(doc)
}

function spellValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => spellScalar(item as string, true)).join(', ')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => `${key}: ${spellScalar(item as string, true)}`)
    return `{ ${entries.join(', ')} }`
  }
  return spellScalar(value as string)
}

/**
 * Appends `key: entry` to the block map at `path`, writing the entry's lists and maps in flow style like its
 * neighbours; falls back to the document when the text cannot be extended in place.
 */
export function appendEntry(text: string, path: Path, key: string, entry: Record<string, unknown>): string {
  const doc = parseDocument(text)
  const map = doc.getIn(path, true) as Node | undefined
  const first = isMap(map) ? (map.items[0] as Pair | undefined) : undefined
  const firstKey = first?.key as Node | undefined
  const firstValue = first?.value as Node | undefined
  const innerKey = isMap(firstValue) ? ((firstValue.items[0] as Pair | undefined)?.key as Node | undefined) : undefined
  if (isMap(map) && !map.flow && map.range && firstKey?.range && innerKey?.range) {
    const indent = ' '.repeat(firstKey.range[0] - lineStart(text, firstKey.range[0]))
    const inner = ' '.repeat(innerKey.range[0] - lineStart(text, innerKey.range[0]))
    const lines = [
      `${indent}${spellScalar(key)}:`,
      ...Object.entries(entry).map(([name, value]) => `${inner}${name}: ${spellValue(value)}`)
    ]
    const at = lineEnd(text, Math.max(map.range[1] - 1, 0))
    const next = `${text.slice(0, at)}\n${lines.join('\n')}${text.slice(at)}`
    const expected = expectAfter(doc, (value) => {
      ;(readIn(value, path) as Record<string, unknown>)[key] = entry
    })
    if (same(toJS(next), expected)) return next
  }
  return setNode(text, [...path, key], entry)
}
