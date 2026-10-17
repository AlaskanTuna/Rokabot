import { TriangleAlert } from 'lucide-react'
import { ActionChip, Button } from '../../components/ui/Button'
import type { Problem } from '../../lib/api'
import { lineForPath } from '../../lib/yaml'
import { fileName, goToProblem, routeFor } from '../../state/workspace'
import { lineInMessage } from './textarea'

interface ProblemBannerProps {
  /** Every problem of the pack check, so a problem in another file still shows here. */
  problems: Problem[]
  path: string
  text: string
  mode: 'form' | 'yaml'
  onGoToLine: (line: number) => void
}

function where(problem: Problem): string {
  const parts = [problem.file && fileName(problem.file), ...(problem.path ? problem.path.split('.') : [])]
  return parts.filter(Boolean).join(' › ')
}

const firstLine = (message: string) => message.split('\n')[0]

function lineFor(problem: Problem, text: string): number | null {
  return problem.path ? lineForPath(text, problem.path) : lineInMessage(problem.message)
}

function screenName(file: string): string {
  const { route } = routeFor(file)
  return route.charAt(0).toUpperCase() + route.slice(1)
}

/** The live check's result at the top of the editor column while the pack does not load. */
export function ProblemBanner({ problems, path, text, mode, onGoToLine }: ProblemBannerProps) {
  if (problems.length === 0) return null
  const own = problems.filter((problem) => problem.file === path)
  const first = own[0] ?? problems[0]
  const elsewhere = first.file !== path
  const count = problems.length
  const title = count === 1 ? 'The pack would not load' : `The pack would not load: ${count} errors`
  const listed = mode === 'yaml' ? own.slice(0, 5) : []
  const more = count - Math.max(listed.length, 1)
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger bg-surface px-4 py-3">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-medium text-ink">{title}</p>
        {listed.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {listed.map((problem) => {
              const line = lineFor(problem, text)
              return (
                <li key={`${problem.path}:${problem.message}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 text-small break-words text-ink-2">
                    {where(problem)}: {firstLine(problem.message)}
                  </span>
                  {line && <ActionChip label={`Go to line ${line}`} onClick={() => onGoToLine(line)} />}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-small break-words text-ink-2">
            {where(first)}: {firstLine(first.message)}
            {elsewhere && first.file ? ` Fix it in ${screenName(first.file)}.` : ''}
          </p>
        )}
        {more > 0 && (
          <p className="text-small text-ink-3">
            {more} more {more === 1 ? 'error' : 'errors'}
            {mode === 'form' && own.length > 1 ? '; the ones in this file are marked on their fields' : ''}.
          </p>
        )}
      </div>
      {listed.length === 0 && (
        <Button className="shrink-0" onClick={() => goToProblem(first)}>
          Go to field
        </Button>
      )}
    </div>
  )
}
