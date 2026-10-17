import { Lock } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef } from 'react'

/** Mirrors src/utils/tokens.ts so the editor's count matches the bot's. */
export function estimateTokens(value: string): number {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized === '' ? 0 : Math.ceil(normalized.length / 4)
}

export interface TextEditorHandle {
  /** Selects a 1-based line and scrolls it into view. */
  goToLine: (line: number) => void
  focus: () => void
}

interface TextEditorProps {
  path: string
  value: string
  onChange: (value: string) => void
  edited?: boolean
  locked?: boolean
  invalid?: boolean
  label: string
}

/** The pixel offset of a character, measured on a mirror so wrapped lines count at their real height. */
function offsetOf(element: HTMLTextAreaElement, index: number): number {
  const style = getComputedStyle(element)
  const mirror = document.createElement('div')
  for (const name of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'tabSize'] as const) {
    mirror.style[name] = style[name]
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    width: `${element.clientWidth}px`
  })
  mirror.textContent = element.value.slice(0, index)
  document.body.append(mirror)
  const height = mirror.scrollHeight
  mirror.remove()
  return height - Number.parseFloat(style.lineHeight || '20')
}

export const TextEditor = forwardRef<TextEditorHandle, TextEditorProps>(function TextEditor(
  { path, value, onChange, edited, locked, invalid, label },
  ref
) {
  const area = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => ({
    goToLine(line: number) {
      const element = area.current
      if (!element) return
      const lines = element.value.split('\n')
      const index = Math.min(Math.max(line, 1), lines.length) - 1
      const start = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0)
      element.focus()
      element.setSelectionRange(start, start + lines[index].length)
      element.scrollTop = Math.max(0, offsetOf(element, start) - element.clientHeight / 3)
    },
    focus() {
      area.current?.focus()
    }
  }))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 font-mono text-code-sm text-ink-2" title={path}>
          <span className="truncate">{path.slice(0, path.lastIndexOf('/') + 1)}</span>
          <span className="shrink-0 whitespace-nowrap">{path.slice(path.lastIndexOf('/') + 1)}</span>
        </span>
        {locked && (
          <span className="inline-flex items-center gap-1 text-small text-warning">
            <Lock aria-hidden className="size-3.5" />
            Locked by the harness
          </span>
        )}
        <span className="font-mono text-code-sm text-ink-3">
          {estimateTokens(value).toLocaleString()} tokens{edited ? ' · edited' : ''}
        </span>
      </div>
      <textarea
        ref={area}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        readOnly={locked}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-[320px] flex-1 resize-none rounded-lg border bg-surface p-4 font-mono text-code text-ink outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-focus focus-visible:shadow-[0_0_0_1px_var(--focus)] read-only:text-ink-2 ${
          invalid ? 'border-danger' : 'border-line'
        }`}
      />
    </div>
  )
})
