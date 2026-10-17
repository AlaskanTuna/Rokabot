import { TriangleAlert } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Problem } from '../../lib/api'
import type { Route } from '../../lib/router'
import { currentProblems, fileName, goToProblem, routeFor, useWorkspace } from '../../state/workspace'

interface ProblemBannerProps {
  /** The screen showing the banner: a problem another screen fixes says which one. */
  screen: Route
  /** Problems about what the editor shows are listed first, up to three. */
  here: (problem: Problem) => boolean
  /** Handles "Go to field" for a problem this screen can show itself; return false to use the default jump. */
  onGo?: (problem: Problem) => boolean
}

function where(problem: Problem): string {
  return [problem.file && fileName(problem.file), problem.path].filter(Boolean).join(' › ')
}

/** The bot's own problems with the live drafts, above an editor column. */
export function ProblemBanner({ screen, here: isHere, onGo }: ProblemBannerProps) {
  const workspace = useWorkspace()
  const problems = currentProblems(workspace)
  if (problems.length === 0) return null
  const here = problems.filter(isHere)
  const shown = here.length > 0 ? here.slice(0, 3) : problems.slice(0, 1)
  const rest = problems.length - shown.length
  const packFails = workspace.validation !== null && !workspace.validation.ok
  const title = packFails
    ? 'The pack would not load'
    : `${fileName(workspace.config?.path ?? 'config.yml')} would not load`
  const target = shown[0]
  const fixedIn = target.file ? routeFor(target.file, target.path).route : null
  const other = fixedIn && fixedIn !== screen ? `${fixedIn.charAt(0).toUpperCase()}${fixedIn.slice(1)}` : null
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-[10px] border border-danger bg-glass-raised px-4 py-3 backdrop-blur-md"
    >
      <TriangleAlert aria-hidden className="size-[18px] shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body font-medium text-ink">
          {title}
          {problems.length > 1 ? `: ${problems.length} errors` : ''}
        </p>
        {shown.map((problem, index) => (
          <p key={`${problem.file}:${problem.path}:${index}`} className="text-small break-words text-ink-2">
            {where(problem) ? `${where(problem)}: ` : ''}
            {problem.message}
            {index === 0 && other ? `. Fix it in ${other}.` : ''}
          </p>
        ))}
        {rest > 0 && (
          <p className="text-small text-ink-3">
            And {rest} more {rest === 1 ? 'problem' : 'problems'}.
          </p>
        )}
      </div>
      <Button
        onClick={() => {
          if (!onGo?.(target)) goToProblem(target)
        }}
      >
        Go to field
      </Button>
    </div>
  )
}
