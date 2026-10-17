import {
  Brain,
  ChevronDown,
  Command,
  Cpu,
  FileText,
  Gauge,
  KeyRound,
  type LucideIcon,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  SlidersHorizontal,
  Smile,
  UserRound
} from 'lucide-react'
import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { type Route, href, navigate, useLocation } from '../../lib/router'
import { readYaml } from '../../lib/yaml'
import { notifications } from '../../state/notifications'
import { currentProblems, dirtyPaths, problemLine, reloadAfterPackSwitch, useWorkspace } from '../../state/workspace'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { useDismiss } from '../ui/useDismiss'

export const NAV: { group: string; items: { route: Route; label: string; icon: LucideIcon }[] }[] = [
  {
    group: 'Character',
    items: [
      { route: 'identity', label: 'Identity', icon: UserRound },
      { route: 'prompts', label: 'Prompts', icon: FileText },
      { route: 'voice', label: 'Voice', icon: SlidersHorizontal },
      { route: 'moods', label: 'Moods', icon: Smile },
      { route: 'lines', label: 'Lines', icon: MessageSquareText }
    ]
  },
  {
    group: 'Bot',
    items: [
      { route: 'models', label: 'Models', icon: Cpu },
      { route: 'memory', label: 'Memory', icon: Brain },
      { route: 'limits', label: 'Limits', icon: Gauge },
      { route: 'discord', label: 'Discord', icon: Server }
    ]
  },
  { group: 'Access', items: [{ route: 'secrets', label: 'Secrets', icon: KeyRound }] }
]

const COLLAPSE_KEY = 'studio.sidebar'

function initialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSE_KEY)
    if (stored) return stored === 'collapsed'
  } catch {}
  return window.innerWidth < 1024
}

export function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  return [
    collapsed,
    (value: boolean) => {
      setCollapsed(value)
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? 'collapsed' : 'expanded')
      } catch {}
    }
  ]
}

function useCounts(): Partial<Record<Route, number>> {
  const workspace = useWorkspace()
  return useMemo(() => {
    const at = (name: string) => workspace.files[`${workspace.dir}/${name}`]?.draft
    const character = readYaml(at('character.yml')) as { prompt?: { system?: unknown[] } } | undefined
    const lines = readYaml(at('lines.yml')) as Record<string, unknown> | undefined
    const config = readYaml(workspace.config?.draft) as { llm?: { models?: Record<string, unknown> } } | undefined
    const summary = workspace.validation?.ok ? workspace.validation.summary : null
    return {
      prompts: character?.prompt?.system?.length,
      moods: summary?.moods.length,
      lines: lines ? Object.keys(lines).length : undefined,
      models: config?.llm?.models ? Object.keys(config.llm.models).length : undefined
    }
  }, [workspace.files, workspace.dir, workspace.config?.draft, workspace.validation])
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function checkedLabel(checkedAt: number | null, now: number): string {
  if (!checkedAt) return 'Not checked yet'
  const seconds = Math.max(0, Math.round((now - checkedAt) / 1000))
  if (seconds < 60) return `Checked ${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  return `Checked ${minutes} min ago`
}

function follow(event: MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  navigate(to)
}

function PackSwitcher() {
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useDismiss(root, open, () => setOpen(false))
  const summary = workspace.validation?.ok ? workspace.validation.summary : null
  const character = readYaml(workspace.files[`${workspace.dir}/character.yml`]?.saved) as
    | { id?: string; fullName?: string; name?: string }
    | undefined
  const id = summary?.id ?? character?.id ?? workspace.dir.split('/').at(-1)
  const name = character?.fullName ?? summary?.name ?? character?.name ?? ''

  const cancel = () => {
    setTarget(null)
    setError(null)
  }

  const confirm = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await api.selectPack(target)
      setTarget(null)
      await reloadAfterPackSwitch()
      notifications.notify({
        tone: 'success',
        title: 'Character pack switched',
        body: `config.yml now points at ${target}. Restart the bot to apply.`,
        toast: true
      })
    } catch (failure) {
      // Shown in the dialog: a toast would sit behind the modal, blurred and out of reach.
      setError(failure instanceof ApiError ? problemLine(failure.problem) : (failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={root} className="relative flex flex-col gap-1.5">
      <span className="text-label text-ink-3">Character pack</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-[34px] items-center gap-2 rounded-md border border-line-strong bg-surface pr-2 pl-3 text-left text-body text-ink hover:bg-subtle"
      >
        <span className="min-w-0 flex-1 truncate" title={name ? `${id} · ${name}` : id}>
          {id}
          {name && <span className="text-ink-2"> · {name}</span>}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-3" />
      </button>
      <span className="truncate font-mono text-code-sm text-ink-3" title={workspace.dir}>
        {workspace.dir}
      </span>
      {open && (
        <ul
          role="listbox"
          aria-label="Character packs"
          className="glass-overlay absolute top-[58px] right-0 left-0 z-30 animate-pop-in rounded-lg p-1"
        >
          {(workspace.candidates.length > 0 ? workspace.candidates : [workspace.dir]).map((dir) => {
            const current = dir === workspace.dir
            return (
              <li key={dir} role="option" aria-selected={current}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (current) return
                    if (dirtyPaths().length > 0) {
                      notifications.toast({
                        tone: 'warning',
                        title: 'Save or discard first',
                        body: 'Switching packs drops unsaved edits, so save or discard them before you switch.'
                      })
                      return
                    }
                    setTarget(dir)
                  }}
                  className={`flex w-full items-center rounded-md px-2 py-1.5 text-left font-mono text-code-sm ${
                    current ? 'bg-selected text-accent-ink' : 'text-ink hover:bg-subtle'
                  }`}
                >
                  {dir}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <Dialog
        open={target !== null}
        onClose={cancel}
        title={`Switch to ${target ?? ''}?`}
        actions={
          <>
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="primary" loading={busy} loadingLabel="Switching…" onClick={() => void confirm()}>
              Switch pack
            </Button>
          </>
        }
      >
        <p>
          The studio checks the pack loads, then sets <code className="font-mono text-code-sm">character:</code> in
          config.yml. The bot uses it after a restart.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-small break-words text-danger">
            Could not switch: {error}
          </p>
        )}
      </Dialog>
    </div>
  )
}

export function Sidebar({
  collapsed,
  onCollapse,
  onSearch
}: {
  collapsed: boolean
  onCollapse: (value: boolean) => void
  onSearch: () => void
}) {
  const { route } = useLocation()
  const workspace = useWorkspace()
  const counts = useCounts()
  const now = useNow(5000)
  const problems = currentProblems(workspace)
  const valid = workspace.status === 'ready' && problems.length === 0
  const validity = workspace.checking ? (
    <Badge tone="neutral">Checking</Badge>
  ) : valid ? (
    <Badge tone="success">Valid</Badge>
  ) : (
    <Badge tone="danger">
      {problems.length} {problems.length === 1 ? 'error' : 'errors'}
    </Badge>
  )

  if (collapsed) {
    return (
      <nav
        aria-label="Studio"
        className="glass-panel flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto rounded-panel py-4"
      >
        <LogoToggle collapsed onToggle={() => onCollapse(false)} />
        {NAV.map(({ group, items }) => (
          <div key={group} className="flex flex-col items-center gap-1 border-t border-line pt-2">
            {items.map(({ route: target, label, icon: Icon }) => (
              <a
                key={target}
                href={href(target)}
                onClick={(event) => follow(event, href(target))}
                aria-label={label}
                title={label}
                aria-current={route === target ? 'page' : undefined}
                className={`inline-flex size-10 items-center justify-center rounded-md transition-colors duration-150 ${
                  route === target ? 'bg-selected text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                }`}
              >
                <Icon aria-hidden className="size-4" />
              </a>
            ))}
          </div>
        ))}
        <span className="flex-1" />
        <span
          role="img"
          aria-label={valid ? 'Pack valid' : `${problems.length} ${problems.length === 1 ? 'error' : 'errors'}`}
          title={valid ? 'Valid' : `${problems.length} ${problems.length === 1 ? 'error' : 'errors'}`}
          className={`size-2.5 rounded-full ${valid ? 'bg-success' : 'bg-danger'}`}
        />
        <IconButton icon={Command} label="Search settings (Ctrl K)" onClick={onSearch} />
      </nav>
    )
  }

  return (
    <nav
      aria-label="Studio"
      className="glass-panel flex w-[248px] shrink-0 flex-col gap-5 overflow-y-auto rounded-panel px-3 py-4"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5 px-1">
          <LogoToggle collapsed={false} onToggle={() => onCollapse(true)} />
          <span className="flex-1 text-section">
            Persona <span className="font-normal text-ink-2">Studio</span>
          </span>
        </div>
        {workspace.status === 'ready' && <PackSwitcher />}
      </div>
      {NAV.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-label text-ink-3">{group}</span>
          {items.map(({ route: target, label, icon: Icon }) => {
            const selected = route === target
            const count = counts[target]
            return (
              <a
                key={target}
                href={href(target)}
                onClick={(event) => follow(event, href(target))}
                aria-current={selected ? 'page' : undefined}
                className={`flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-150 ${
                  selected ? 'bg-selected font-medium text-accent-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink'
                }`}
              >
                <Icon aria-hidden className="size-4" />
                <span className="flex-1">{label}</span>
                {count !== undefined && (
                  <span className={`font-mono text-code-sm ${selected ? 'text-accent-ink' : 'text-ink-3'}`}>
                    {count}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      ))}
      <span className="flex-1" />
      <div className="flex flex-col gap-2">
        {workspace.status === 'ready' && (
          <div className="flex items-center gap-2 px-1">
            {validity}
            <span className="text-small text-ink-3">{checkedLabel(workspace.checkedAt, now)}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="glass-cta flex h-8 items-center gap-2 rounded-md px-2.5 text-small text-ink-2 hover:!bg-subtle hover:text-ink"
        >
          <Command aria-hidden className="size-3.5" />
          <span className="flex-1 text-left">Search settings</span>
          <kbd className="font-mono text-code-sm text-ink-3">
            {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>
    </nav>
  )
}

/** The logo is the sidebar toggle: on hover or keyboard focus it turns into the panel icon it stands for. */
function LogoToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="group relative inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-ink text-canvas transition-[background-color,color] duration-150 ease-out hover:bg-subtle hover:text-ink focus-visible:bg-subtle focus-visible:text-ink"
    >
      <span className="inline-flex transition-[opacity,transform] duration-150 ease-out group-hover:scale-75 group-hover:opacity-0 group-focus-visible:scale-75 group-focus-visible:opacity-0">
        <MarkGlyph />
      </span>
      <Icon
        aria-hidden
        className="absolute size-4 scale-75 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
      />
    </button>
  )
}

function MarkGlyph() {
  return (
    <>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" className="size-4">
        <path d="M3 6h9M3 10h12M3 14h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="absolute top-1 right-1 size-2 rounded-full bg-focus" />
    </>
  )
}

export function BrandMark() {
  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-ink text-canvas">
      <MarkGlyph />
    </span>
  )
}
