import { useEffect, useMemo, useState } from 'react'
import { ApiError, type MemoryMode, type Preview, api } from '../../lib/api'
import { navigate, useLocation } from '../../lib/router'
import { readYaml } from '../../lib/yaml'
import { goToProblem, isDirty, useWorkspace } from '../../state/workspace'
import { Badge } from '../ui/Badge'
import { ActionChip } from '../ui/Button'
import { Field, Select } from '../ui/Field'
import { Skeleton, Tabs } from '../ui/Overlay'
import { DiffView } from './DiffView'

export type PanelTab = 'preview' | 'source' | 'diff'

const MEMORY: { value: MemoryMode; label: string; helper: string }[] = [
  { value: 'full', label: 'Full', helper: 'facts and recall' },
  { value: 'forget', label: 'Forget only', helper: 'forget tool only' },
  { value: 'none', label: 'None', helper: 'no memory, as /ask' }
]

interface Band {
  from: number
  to: number
  text: string
}

function bandFor(bands: Band[] | undefined, hour: number): string {
  const band = bands?.find(({ from, to }) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to))
  return band ? band.text.split(/\s+[—-]\s+/)[0] : ''
}

interface PreviewPanelProps {
  /** The file the Source and Diff tabs show; without one, only Preview is offered. */
  file?: string
  sourceLabel?: string
  /** The mood the preview starts on, e.g. the mood being edited. */
  initialMood?: string
}

/** The right column: the assembled prompt for a mood, hour and memory mode, the file's source, and its diff. */
export function PreviewPanel({ file, sourceLabel = 'YAML', initialMood = '' }: PreviewPanelProps) {
  const workspace = useWorkspace()
  const location = useLocation()
  const wanted = location.search.get('tab')
  const [tab, setTab] = useState<PanelTab>(wanted === 'diff' || wanted === 'source' ? wanted : 'preview')
  useEffect(() => {
    if (wanted === 'diff' || wanted === 'source' || wanted === 'preview') setTab(wanted)
  }, [wanted])

  const summary = workspace.validation?.ok ? workspace.validation.summary : null
  const character = readYaml(workspace.files[`${workspace.dir}/character.yml`]?.draft) as
    | { situation?: { timeOfDay?: Band[] } }
    | undefined
  const config = readYaml(workspace.config?.draft) as { llm?: { main?: string } } | undefined
  const [mood, setMood] = useState(initialMood)
  useEffect(() => {
    if (initialMood) setMood(initialMood)
  }, [initialMood])
  const [hour, setHour] = useState(() => new Date().getHours())
  const [memory, setMemory] = useState<MemoryMode>('full')
  const activeMood = summary?.moods.includes(mood) ? mood : (summary?.defaultMood ?? '')

  const changes = useMemo(
    () =>
      Object.entries(workspace.files)
        .filter(([, state]) => isDirty(state))
        .map(([path, state]) => ({ path, text: state.draft })),
    [workspace.files]
  )
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tab !== 'preview') return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params = { mood: activeMood || undefined, hour, memory }
        const result = changes.length > 0 ? await api.previewDrafts(changes, params) : await api.preview(params)
        if (cancelled) return
        setPreview(result)
        setError(null)
      } catch (failure) {
        if (!cancelled) setError(failure instanceof ApiError ? failure : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tab, changes, activeMood, hour, memory])

  const tabs: { value: PanelTab; label: string }[] = file
    ? [
        { value: 'preview', label: 'Preview' },
        { value: 'source', label: sourceLabel },
        { value: 'diff', label: 'Diff' }
      ]
    : [{ value: 'preview', label: 'Preview' }]
  const fileState = file ? (workspace.files[file] ?? (file === workspace.config?.path ? null : undefined)) : undefined
  const source = file === workspace.config?.path ? workspace.config?.draft : fileState?.draft
  const saved = file === workspace.config?.path ? workspace.config?.saved : fileState?.saved

  return (
    <aside aria-label="Preview" className="flex min-h-0 flex-col gap-4 border-line bg-glass-raised p-5 lg:border-l">
      <Tabs
        label="Preview panel"
        value={tab}
        options={tabs}
        onValue={(next) => {
          setTab(next)
          if (wanted)
            navigate(location.rest ? `/${location.route}/${location.rest}` : `/${location.route}`, { replace: true })
        }}
      />
      {tab === 'preview' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Mood" helper={activeMood === summary?.defaultMood ? 'default' : ' '}>
              {({ id }) => (
                <Select
                  id={id}
                  plain
                  value={activeMood}
                  onValue={setMood}
                  options={(summary?.moods ?? []).map((value) => ({ value, label: value }))}
                />
              )}
            </Field>
            <Field label="Hour" helper={bandFor(character?.situation?.timeOfDay, hour) || ' '}>
              {({ id }) => (
                <Select
                  id={id}
                  plain
                  value={String(hour)}
                  onValue={(value) => setHour(Number(value))}
                  options={Array.from({ length: 24 }, (_, value) => ({
                    value: String(value),
                    label: `${String(value).padStart(2, '0')}:00`
                  }))}
                />
              )}
            </Field>
            <Field label="Memory" helper={MEMORY.find((option) => option.value === memory)?.helper}>
              {({ id }) => (
                <Select
                  id={id}
                  plain
                  value={memory}
                  onValue={(value) => setMemory(value as MemoryMode)}
                  options={MEMORY.map(({ value, label }) => ({ value, label }))}
                />
              )}
            </Field>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface p-4"
            role="region"
            aria-label="Assembled prompt"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
            tabIndex={0}
            aria-live="polite"
            aria-busy={loading}
          >
            {error ? (
              <div className="flex flex-col items-start gap-2 text-small text-ink-2">
                <p className="font-medium text-danger">Nothing to preview: the pack does not load.</p>
                <p className="break-words">{error.problems[0]?.message}</p>
                <ActionChip label="Go to field" primary onClick={() => goToProblem(error.problems[0])} />
              </div>
            ) : loading && !preview ? (
              <Skeleton lines={12} />
            ) : (
              <pre
                className={`font-mono text-code-sm whitespace-pre-wrap text-ink-2 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}
              >
                {preview?.prompt}
              </pre>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex-1 font-mono text-code-sm whitespace-nowrap text-ink-3">
              {preview
                ? `${preview.tokens.toLocaleString()} tokens · ${preview.stableTokens.toLocaleString()} cached`
                : ' '}
            </span>
            {config?.llm?.main && (
              <span
                title={`main: ${config.llm.main}`}
                className="max-w-full min-w-0 [&>span]:max-w-full [&>span]:truncate"
              >
                <Badge tone="accent">main: {config.llm.main}</Badge>
              </span>
            )}
          </div>
        </>
      )}
      {tab === 'source' && file && (
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
          tabIndex={0}
          aria-label="File source"
          className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface p-4 font-mono text-code-sm whitespace-pre-wrap text-ink-2"
        >
          {source ?? ''}
        </pre>
      )}
      {tab === 'diff' && file && (
        <div
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
          tabIndex={0}
          role="region"
          aria-label="Unsaved changes"
          className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface p-2"
        >
          <DiffView path={file} before={saved ?? null} after={source ?? null} />
        </div>
      )}
    </aside>
  )
}
