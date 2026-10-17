import { RotateCcw, Save } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { currentProblems, dirtyPaths, discard, save, useWorkspace } from '../../state/workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { NotificationCenter, ThemeSwitch } from './HeaderUtilities'

interface PageProps {
  title: string
  subtitle?: ReactNode
  /** Badges after the title; the validity and unsaved badges are added unless `badges` replaces them. */
  badges?: ReactNode
  /** Page actions; defaults to Discard + Save changes for the shared draft. */
  actions?: ReactNode
  children: ReactNode
}

export function SaveActions() {
  const workspace = useWorkspace()
  const dirty = dirtyPaths(workspace)
  const problems = currentProblems(workspace)
  const [confirming, setConfirming] = useState(false)
  const blocked = problems.length > 0
  return (
    <>
      <Button icon={RotateCcw} disabled={dirty.length === 0 || workspace.saving} onClick={() => setConfirming(true)}>
        Discard
      </Button>
      <Button
        variant="primary"
        icon={Save}
        disabled={dirty.length === 0 || blocked}
        loading={workspace.saving}
        loadingLabel="Saving…"
        title={
          blocked ? `Fix ${problems.length} ${problems.length === 1 ? 'error' : 'errors'} before saving` : undefined
        }
        onClick={() => void save()}
      >
        Save changes
      </Button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Discard ${dirty.length} unsaved ${dirty.length === 1 ? 'change' : 'changes'}?`}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                discard()
                setConfirming(false)
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        Every file goes back to what is on disk: {dirty.map((path) => path.split('/').at(-1)).join(', ')}.
      </Dialog>
    </>
  )
}

export function StatusBadges() {
  const workspace = useWorkspace()
  const problems = currentProblems(workspace)
  const dirty = dirtyPaths(workspace).length
  if (workspace.status !== 'ready') return null
  return (
    <>
      {problems.length === 0 ? (
        <Badge tone="success">Valid</Badge>
      ) : (
        <Badge tone="danger">
          {problems.length} {problems.length === 1 ? 'error' : 'errors'}
        </Badge>
      )}
      {dirty > 0 && (
        <Badge tone="warning">
          {dirty} unsaved {dirty === 1 ? 'file' : 'files'}
        </Badge>
      )}
    </>
  )
}

export function Page({ title, subtitle, badges, actions, children }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Persona Studio`
  }, [title])
  return (
    <main id="main" className="glass-panel relative z-10 flex min-w-0 flex-1 flex-col overflow-clip rounded-xl">
      <header className="flex min-h-[79px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-headline text-ink">{title}</h1>
          {subtitle && <p className="truncate text-small text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{badges ?? <StatusBadges />}</div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <ThemeSwitch />
          <NotificationCenter />
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          {actions ?? <SaveActions />}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </main>
  )
}
