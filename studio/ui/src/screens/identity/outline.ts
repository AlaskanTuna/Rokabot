import {
  type Document,
  LineCounter,
  type Node,
  type Pair,
  type Scalar,
  isMap,
  isScalar,
  isSeq,
  parseDocument
} from 'yaml'
import type { Problem } from '../../lib/api'
import { type Path, pathString } from '../../lib/yamlEdit'

export interface Section {
  key: string
  path: string
  children: Section[]
}

function parse(text: string): Document.Parsed | null {
  try {
    const doc = parseDocument(text)
    return doc.errors.length > 0 ? null : doc
  } catch {
    return null
  }
}

const isLeaf = (node: unknown) => node === null || node === undefined || isScalar(node)
const keyOf = (pair: Pair) => (pair.key as Scalar).value as string | number

/**
 * The file's top-level keys in the order YamlForm shows them (scalars first), each with its nested groups when it has
 * two or more, so the index can point at both.
 */
export function outline(text: string, exclude: readonly string[] = []): Section[] {
  const doc = parse(text)
  if (!doc || !isMap(doc.contents)) return []
  const pairs = (doc.contents.items as Pair[]).filter((pair) => !exclude.includes(String(keyOf(pair))))
  const ordered = [...pairs.filter((pair) => isLeaf(pair.value)), ...pairs.filter((pair) => !isLeaf(pair.value))]
  return ordered.map((pair) => {
    const key = keyOf(pair)
    const nested = isMap(pair.value) ? (pair.value.items as Pair[]).filter((child) => !isLeaf(child.value)) : []
    return {
      key: String(key),
      path: pathString([key]),
      children:
        nested.length < 2
          ? []
          : nested.map((child) => ({
              key: String(keyOf(child)),
              path: pathString([key, keyOf(child)]),
              children: []
            }))
    }
  })
}

/** The 1-based line of each section's key, so the editor lands on `key:` rather than on its first child. */
export function keyLines(text: string, sections: readonly Section[]): Map<string, number> {
  const counter = new LineCounter()
  const lines = new Map<string, number>()
  let doc: Document.Parsed
  try {
    doc = parseDocument(text, { lineCounter: counter })
  } catch {
    return lines
  }
  const visit = (node: unknown, list: readonly Section[]) => {
    if (!isMap(node)) return
    for (const section of list) {
      const pair = (node.items as Pair[]).find((item) => String(keyOf(item)) === section.key)
      const start = (pair?.key as Node | undefined)?.range?.[0]
      if (start === undefined) continue
      lines.set(section.path, counter.linePos(start).line)
      visit(pair?.value, section.children)
    }
  }
  visit(doc.contents, sections)
  return lines
}

function clean(comment: string | null | undefined): string | undefined {
  const text = comment
    ?.split('\n')
    .map((line) => line.replace(/^\s*#?\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
  return text || undefined
}

/** The comment above the first key: the yaml library attaches a file's opening comment there. */
export function fileHeader(text: string): string | undefined {
  const doc = parse(text)
  if (!doc || !isMap(doc.contents)) return undefined
  const first = doc.contents.items[0] as Pair | undefined
  return clean((first?.key as Node | undefined)?.commentBefore)
}

/** Every comment along a path, from the top key down; the file's opening comment is left out. */
export function commentsAlong(text: string, path: Path): string[] {
  const doc = parse(text)
  const found: string[] = []
  let node = doc?.contents as Node | null | undefined
  for (const [depth, part] of path.entries()) {
    if (isMap(node)) {
      const pairs = node.items as Pair[]
      const index = pairs.findIndex((pair) => String(keyOf(pair)) === String(part))
      const pair = pairs[index]
      if (!pair) break
      const value = pair.value as Node | null
      const key = pair.key as Node
      const own = [value?.comment, value?.commentBefore, depth === 0 && index === 0 ? undefined : key.commentBefore]
      found.push(...own.map(clean).filter((comment): comment is string => Boolean(comment)))
      node = value
    } else if (isSeq(node) && typeof part === 'number') {
      const item = node.items[part] as Node | undefined
      found.push(
        ...[item?.comment, item?.commentBefore].map(clean).filter((comment): comment is string => Boolean(comment))
      )
      node = item
    } else break
  }
  return found
}

/** Whether `path` is `parent` or lies beneath it. */
export function covers(parent: string, path: string | null | undefined): boolean {
  if (!path) return false
  return path === parent || path.startsWith(`${parent}.`) || path.startsWith(`${parent}[`)
}

export function problemsUnder(problems: readonly Problem[], path: string): number {
  return problems.filter((problem) => covers(path, problem.path)).length
}
