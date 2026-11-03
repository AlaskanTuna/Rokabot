import {
  type Document,
  type Node,
  type Pair,
  type Scalar,
  type YAMLSeq,
  isMap,
  isScalar,
  isSeq,
  parseDocument
} from 'yaml'
import { stringifyDoc } from './yaml'

export type Path = (string | number)[]
export type Primitive = string | number | boolean | null

export function pathString(path: Path): string {
  return path.reduce<string>(
    (text, part) => (typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part),
    ''
  )
}

const singleQuoted = (value: string) => `'${value.replaceAll("'", "''")}'`

function representations(value: Primitive, type: Scalar.Type | undefined): string[] {
  if (value === null) return ['', 'null']
  if (typeof value !== 'string') return [String(value)]
  if (type === 'QUOTE_DOUBLE') return [JSON.stringify(value), singleQuoted(value)]
  if (type === 'QUOTE_SINGLE') return [singleQuoted(value), JSON.stringify(value)]
  return [value, singleQuoted(value), JSON.stringify(value)]
}

function parses(text: string, check: (doc: Document.Parsed) => boolean): boolean {
  try {
    const doc = parseDocument(text)
    return doc.errors.length === 0 && check(doc)
  } catch {
    return false
  }
}

function toJS(text: string): unknown {
  try {
    const doc = parseDocument(text)
    return doc.errors.length > 0 ? undefined : doc.toJS()
  } catch {
    return undefined
  }
}

function readIn(value: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined),
    value
  )
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The document's value after `edit`, to check an in-place text edit against. */
function expected(
  text: string,
  edit: (parent: Record<string | number, unknown>, key: string | number) => void,
  path: Path
) {
  const value = toJS(text) as Record<string, unknown>
  edit(readIn(value, path.slice(0, -1)) as Record<string | number, unknown>, path.at(-1) as string | number)
  return value
}

/** A value spelled in flow style: plain where it reads back as itself, else single-quoted. */
export function spellFlow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(spellFlow).join(', ')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    return entries.length === 0
      ? '{}'
      : `{ ${entries.map(([key, item]) => `${spellFlow(key)}: ${spellFlow(item)}`).join(', ')} }`
  }
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'string') return String(value)
  if (value !== '' && same((toJS(`[${value}]`) as unknown[] | undefined)?.[0], value)) return value
  return singleQuoted(value)
}

/**
 * Sets one scalar by rewriting only its own characters, so comments, quoting and layout elsewhere stay byte for byte;
 * falls back to re-serializing the document when a value cannot be spelled in place (a block scalar, say).
 */
export function setScalar(text: string, path: Path, value: Primitive): string {
  const doc = parseDocument(text)
  const node = doc.getIn(path, true) as Node | undefined
  if (isScalar(node) && node.range && node.type !== 'BLOCK_LITERAL' && node.type !== 'BLOCK_FOLDED') {
    const [start, end] = node.range
    // An empty string is quoted only because it is empty, so the value typed into it starts plain.
    for (const spelling of representations(value, node.value === '' ? 'PLAIN' : node.type)) {
      const next = text.slice(0, start) + spelling + text.slice(end)
      if (parses(next, (parsed) => parsed.getIn(path) === value)) return next
    }
  }
  if (isScalar(node)) node.value = value
  else doc.setIn(path, value)
  return stringifyDoc(doc)
}

/** Appends an item to a sequence, in place for flow and block lists; a map or list item is spelled in flow style. */
export function addItem(text: string, path: Path, value: unknown): string {
  const doc = parseDocument(text)
  const seq = doc.getIn(path, true) as YAMLSeq | undefined
  const expectLength = (seq?.items.length ?? 0) + 1
  const valid = (next: string) =>
    parses(next, (parsed) => {
      const list = readIn(parsed.toJS(), path)
      return Array.isArray(list) && list.length === expectLength && same(list.at(-1), value)
    })
  const isPrimitive = value === null || ['string', 'number', 'boolean'].includes(typeof value)
  if (isSeq(seq) && seq.range) {
    const last = seq.items.at(-1) as Node | undefined
    for (const spelling of isPrimitive ? representations(value as Primitive, 'PLAIN') : [spellFlow(value)]) {
      let next: string | null = null
      if (seq.flow) {
        if (last?.range) next = `${text.slice(0, last.range[1])}, ${spelling}${text.slice(last.range[1])}`
        else next = `${text.slice(0, seq.range[0])}[${spelling}]${text.slice(seq.range[1])}`
      } else if (last?.range) {
        const start = lineStart(text, last.range[0])
        const prefix = text.slice(start, last.range[0])
        if (/^\s*-\s+$/.test(prefix)) {
          const end = lineEnd(text, Math.max(last.range[1] - 1, last.range[0]))
          next = `${text.slice(0, end)}\n${prefix}${spelling}${text.slice(end)}`
        }
      }
      if (next !== null && valid(next)) return next
    }
  }
  if (isSeq(seq)) seq.add(doc.createNode(value))
  else doc.setIn(path, doc.createNode([value]))
  return stringifyDoc(doc)
}

/** Removes one sequence item by cutting its own text, else through the document. */
export function removeItem(text: string, path: Path, index: number): string {
  const doc = parseDocument(text)
  const seq = doc.getIn(path, true) as YAMLSeq | undefined
  if (!isSeq(seq)) return text
  const item = seq.items[index] as Node | undefined
  const after = (seq.toJSON() as unknown[]).filter((_, position) => position !== index)
  const valid = (next: string) => parses(next, (parsed) => same(readIn(parsed.toJS(), path), after))
  if (item?.range) {
    const [start, end] = item.range
    let next: string | null = null
    if (seq.flow) {
      if (index > 0) {
        const comma = text.lastIndexOf(',', start)
        next = text.slice(0, comma) + text.slice(end)
      } else {
        const after = /^\s*,\s*/.exec(text.slice(end))
        next = text.slice(0, start) + text.slice(end + (after ? after[0].length : 0))
      }
    } else {
      const from = lineStart(text, start)
      const to = lineEnd(text, Math.max(item.range[2] - 1, start))
      next = text.slice(0, from) + text.slice(Math.min(text.length, to + 1))
      // Without its last item a block list's `key:` would read as null, so it becomes `key: []`.
      const owner = (path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents) as Node | null
      const keyEnd = isMap(owner)
        ? ((owner.items as Pair[]).find((pair) => pair.value === seq)?.key as Node | undefined)?.range?.[1]
        : undefined
      const colon = keyEnd === undefined ? -1 : text.indexOf(':', keyEnd)
      if (seq.items.length === 1 && colon !== -1 && colon < from) {
        next = `${next.slice(0, colon + 1)} []${next.slice(colon + 1)}`
      }
    }
    if (next !== null && valid(next)) return next
  }
  seq.delete(index)
  return stringifyDoc(doc)
}

/**
 * Sets any value. A scalar or flow value is respelled in place and a new key is appended after its siblings, so the
 * rest of the file keeps every byte; anything else goes through the document.
 */
export function setNode(text: string, path: Path, value: unknown): string {
  const doc = parseDocument(text)
  const want = expected(
    text,
    (parent, key) => {
      parent[key] = value
    },
    path
  )
  const valid = (next: string) => same(toJS(next), want)
  const node = doc.getIn(path, true) as Node | undefined
  const flowish = isScalar(node) || ((isMap(node) || isSeq(node)) && node.flow)
  if (node?.range && flowish) {
    const next = text.slice(0, node.range[0]) + spellFlow(value) + text.slice(node.range[1])
    if (valid(next)) return next
  }
  const parent = doc.getIn(path.slice(0, -1), true) as Node | undefined
  const key = path.at(-1)
  if (node === undefined && isMap(parent) && parent.range && typeof key === 'string') {
    const last = parent.items.at(-1) as Pair | undefined
    const lastKey = last?.key as Node | undefined
    const lastValue = last?.value as Node | undefined
    let next: string | null = null
    if (parent.flow && lastValue?.range) {
      next = `${text.slice(0, lastValue.range[1])}, ${spellFlow(key)}: ${spellFlow(value)}${text.slice(lastValue.range[1])}`
    } else if (!parent.flow && lastKey?.range) {
      const indent = text.slice(lineStart(text, lastKey.range[0]), lastKey.range[0])
      const end = lineEnd(text, Math.max((lastValue?.range ?? lastKey.range)[1] - 1, lastKey.range[0]))
      if (/^ *$/.test(indent))
        next = `${text.slice(0, end)}\n${indent}${spellFlow(key)}: ${spellFlow(value)}${text.slice(end)}`
    }
    if (next !== null && valid(next)) return next
  }
  doc.setIn(path, doc.createNode(value, { flow: true }))
  return stringifyDoc(doc)
}

/** Deletes a key with the comment lines right above it, or a list item, cutting only its own lines. */
export function deleteNode(text: string, path: Path): string {
  const doc = parseDocument(text)
  const parent = doc.getIn(path.slice(0, -1), true) as Node | undefined
  const key = path.at(-1) as string | number
  if (isSeq(parent) && typeof key === 'number') return removeItem(text, path.slice(0, -1), key)
  const want = expected(text, (owner, name) => Reflect.deleteProperty(owner, name), path)
  if (isMap(parent)) {
    const pair = (parent.items as Pair[]).find((item) => isScalar(item.key) && item.key.value === key)
    const keyNode = pair?.key as Node | undefined
    const valueNode = pair?.value as Node | undefined
    if (keyNode?.range) {
      const valueEnd = (valueNode?.range ?? keyNode.range)[1]
      let next: string | null = null
      if (parent.flow) {
        const before = text.lastIndexOf(',', keyNode.range[0])
        const opener = text.lastIndexOf('{', keyNode.range[0])
        if (before > opener) next = text.slice(0, before) + text.slice(valueEnd)
        else {
          const after = /^\s*,\s*/.exec(text.slice(valueEnd))
          next = text.slice(0, keyNode.range[0]) + text.slice(valueEnd + (after ? after[0].length : 0))
        }
      } else {
        let from = lineStart(text, keyNode.range[0])
        while (from > 0) {
          const previous = lineStart(text, from - 1)
          if (!/^\s*#/.test(text.slice(previous, from - 1))) break
          from = previous
        }
        const to = lineEnd(text, Math.max(valueEnd - 1, keyNode.range[0]))
        next = text.slice(0, from) + text.slice(Math.min(text.length, to + 1))
      }
      if (next !== null && same(toJS(next), want)) return next
    }
  }
  doc.deleteIn(path)
  return stringifyDoc(doc)
}

/** An empty value of the same shape, for a new list item or record entry modelled on an existing one. */
export function blankLike(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, blankLike(entry)]))
  }
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return false
  return ''
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
