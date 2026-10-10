/**
 * Holds a reply to at most three blocks for every model that can answer, since a prompt rule is a hope and
 * the fallback model follows it less closely than the primary. A paragraph, a list, a quote and a code block
 * each count as one block; a `---` divider line counts as none. Only neighbouring paragraphs are ever joined:
 * lists, quotes and code keep their exact text, so a reply that is over the cap for any other reason is
 * returned unchanged for the caller to report.
 */

export const MAX_REPLY_BLOCKS = 3

type BlockKind = 'prose' | 'list' | 'quote' | 'code'
type Piece = { kind: BlockKind; text: string } | { kind: 'divider' }

const FENCE = /^```/
const DIVIDER = /^-{3,}\s*$/
const LIST_ITEM = /^(?:[-*•]|\d+[.)])\s/
const QUOTE = /^>/

function parse(text: string): Piece[] {
  const pieces: Piece[] = []
  const lines = text.split('\n')
  let current = null as { kind: BlockKind; lines: string[] } | null
  const close = () => {
    if (current) pieces.push({ kind: current.kind, text: current.lines.join('\n') })
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) {
      close()
      const start = i
      do i++
      while (i < lines.length && !FENCE.test(lines[i]))
      pieces.push({ kind: 'code', text: lines.slice(start, i + 1).join('\n') })
      continue
    }
    if (!line.trim()) {
      close()
      continue
    }
    if (DIVIDER.test(line)) {
      close()
      pieces.push({ kind: 'divider' })
      continue
    }

    const kind: BlockKind = LIST_ITEM.test(line) ? 'list' : QUOTE.test(line) ? 'quote' : 'prose'
    if (current?.kind === kind) {
      current.lines.push(line)
      continue
    }
    close()
    const previous = pieces.at(-1)
    // Models often leave a blank line between list items or quoted lines; that is still one list or quote.
    if ((kind === 'list' || kind === 'quote') && previous?.kind === kind) {
      pieces.pop()
      current = { kind, lines: [previous.text, '', line] }
    } else {
      current = { kind, lines: [line] }
    }
  }
  close()
  return pieces
}

function blockCount(pieces: Piece[]): number {
  return pieces.filter((piece) => piece.kind !== 'divider').length
}

export function countReplyBlocks(text: string): number {
  return blockCount(parse(text))
}

export function capReplyBlocks(text: string, max = MAX_REPLY_BLOCKS): { text: string; blocks: number; merged: number } {
  const pieces = parse(text)
  let blocks = blockCount(pieces)
  let merged = 0

  while (blocks > max) {
    let at = -1
    for (let i = pieces.length - 1; i > 0; i--) {
      if (pieces[i].kind === 'prose' && pieces[i - 1].kind === 'prose') {
        at = i
        break
      }
    }
    if (at < 0) break
    const before = pieces[at - 1] as { text: string }
    const after = pieces[at] as { text: string }
    pieces.splice(at - 1, 2, { kind: 'prose', text: `${before.text} ${after.text}` })
    blocks--
    merged++
  }

  if (merged === 0) return { text, blocks, merged }
  const capped = pieces.map((piece) => (piece.kind === 'divider' ? '---' : piece.text)).join('\n\n')
  return { text: capped, blocks, merged }
}

export function splitAtDividers(text: string): string[] {
  const parts: string[] = []
  let current: string[] = []
  let inFence = false

  for (const line of text.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence
    if (!inFence && DIVIDER.test(line)) {
      parts.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  parts.push(current.join('\n'))
  return parts.map((part) => part.trim()).filter(Boolean)
}
