const COPIED = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'paddingTop',
  'paddingLeft',
  'paddingRight'
] as const

/**
 * The pixel offset of a 1-based line inside a wrapping textarea, measured with a hidden copy of its text, so long
 * YAML lines that wrap do not throw the scroll position off.
 */
function lineTop(area: HTMLTextAreaElement, line: number): number {
  const style = getComputedStyle(area)
  const mirror = document.createElement('div')
  for (const property of COPIED) mirror.style[property] = style[property]
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    boxSizing: 'border-box',
    width: `${area.clientWidth}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    paddingBottom: '0',
    border: '0'
  })
  mirror.textContent = area.value
    .split('\n')
    .slice(0, Math.max(0, line - 1))
    .join('\n')
  document.body.append(mirror)
  const top = line <= 1 ? 0 : mirror.offsetHeight - Number.parseFloat(style.paddingTop)
  mirror.remove()
  return top
}

/** Scrolls a line to a third of the way down, optionally placing the caret at its start. */
export function revealLine(area: HTMLTextAreaElement, line: number, caret: boolean): void {
  if (caret) {
    const start =
      area.value
        .split('\n')
        .slice(0, Math.max(0, line - 1))
        .join('\n').length + (line > 1 ? 1 : 0)
    area.focus({ preventScroll: true })
    area.setSelectionRange(start, start)
  }
  area.scrollTop = Math.max(0, lineTop(area, line) - area.clientHeight / 3)
}

export function caretLine(area: HTMLTextAreaElement): number {
  return area.value.slice(0, area.selectionStart).split('\n').length
}

/** The first line of a js-yaml style message such as `bad indentation (12:5)`. */
export function lineInMessage(message: string): number | null {
  const match = /\((\d+):\d+\)/.exec(message.split('\n')[0])
  return match ? Number(match[1]) : null
}
