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

function lineStart(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf('\n', index)
  return end === -1 ? text.length : end
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
