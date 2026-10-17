import { diffLines } from 'diff'
import { useMemo } from 'react'

/** A unified line diff of the saved file against the draft. */
export function DiffView({ before, after, path }: { before: string | null; after: string | null; path: string }) {
  const parts = useMemo(() => diffLines(before ?? '', after ?? ''), [before, after])
  const changed = parts.some((part) => part.added || part.removed)
  if (!changed) {
    return (
      <p className="px-1 py-6 text-center text-small text-ink-3">No unsaved changes in {path.split('/').at(-1)}.</p>
    )
  }
  let oldLine = 1
  let newLine = 1
  const rows: { sign: string; text: string; old?: number; new?: number; tone: string }[] = []
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const text of lines) {
      if (part.added) rows.push({ sign: '+', text, new: newLine++, tone: 'bg-success/12 text-ink' })
      else if (part.removed) rows.push({ sign: '−', text, old: oldLine++, tone: 'bg-danger/12 text-ink' })
      else rows.push({ sign: ' ', text, old: oldLine++, new: newLine++, tone: 'text-ink-2' })
    }
  }
  return (
    <table className="w-full border-collapse font-mono text-code-sm" aria-label={`Changes in ${path}`}>
      <tbody>
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a diff row has no identity beyond its position
          <tr key={index} className={row.tone}>
            <td className="w-9 pr-2 text-right text-ink-3 select-none">{row.old ?? ''}</td>
            <td className="w-9 pr-2 text-right text-ink-3 select-none">{row.new ?? ''}</td>
            <td
              className={`w-4 select-none ${row.sign === '+' ? 'text-success' : row.sign === '−' ? 'text-danger' : ''}`}
              aria-label={row.sign === '+' ? 'added' : row.sign === '−' ? 'removed' : undefined}
            >
              {row.sign}
            </td>
            <td className="break-all whitespace-pre-wrap">{row.text || ' '}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
