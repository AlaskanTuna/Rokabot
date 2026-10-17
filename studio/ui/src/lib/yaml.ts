import { type Document, LineCounter, type Node, isMap, isScalar, isSeq, parseDocument } from 'yaml'

/** Parses YAML for reading; returns undefined instead of throwing on a half-typed draft. */
export function readYaml(text: string | null | undefined): unknown {
  if (!text) return undefined
  try {
    const doc = parseDocument(text)
    return doc.errors.length > 0 ? undefined : doc.toJS()
  } catch {
    return undefined
  }
}

export function parseDoc(text: string): Document.Parsed {
  return parseDocument(text, { keepSourceTokens: true })
}

/** Serializes without folding long lines, so an untouched value keeps its original layout. */
export function stringifyDoc(doc: Document): string {
  return doc.toString({ lineWidth: 0, minContentWidth: 0, flowCollectionPadding: true })
}

/** Splits a problem path such as `playful.faces[1]` or `llm.models.local.baseUrl` into keys and indexes. */
export function splitPath(path: string): (string | number)[] {
  return path
    .split(/\.|\[(\d+)\]/)
    .filter((part) => part !== undefined && part !== '')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

/** The 1-based line a path starts on in a YAML text, for jumping the editor to an error. */
export function lineForPath(text: string, path: string): number | null {
  const counter = new LineCounter()
  let doc: Document.Parsed
  try {
    doc = parseDocument(text, { lineCounter: counter })
  } catch {
    return null
  }
  const keys = splitPath(path)
  while (keys.length > 0) {
    const node = doc.getIn(keys, true) as Node | undefined
    if (node && (isScalar(node) || isMap(node) || isSeq(node)) && node.range) {
      return counter.linePos(node.range[0]).line
    }
    keys.pop()
  }
  return null
}
