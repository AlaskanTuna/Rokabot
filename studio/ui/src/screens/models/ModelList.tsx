import { ChevronRight, Eye, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Overlay'
import type { Problem } from '../../lib/api'
import { notifications } from '../../state/notifications'
import { setConfigDraft } from '../../state/workspace'
import { CardHeading, type ConfigData, ConfigForm, type ModelEntry } from './configShared'
import { KeyBadge, type ModelEnv, TestResult, keyStatus, notifyMissingKey, useConnectionTest } from './parts'
import { removePair } from './textEdit'

interface RowProps {
  name: string
  entry: ModelEntry | null
  role: 'main' | 'fallback' | null
  data: ConfigData
  env: ModelEnv
  problem: Problem | null
  expanded: boolean
  onExpand: () => void
  onRemove: () => void
}

function hasPath(entry: ModelEntry | null, path: string): boolean {
  let node: unknown = entry
  for (const key of path.split('.')) {
    if (!node || typeof node !== 'object' || !(key in node)) return false
    node = (node as Record<string, unknown>)[key]
  }
  return true
}

function ModelRow({ name, entry, role, data, env, problem, expanded, onExpand, onRemove }: RowProps) {
  const test = useConnectionTest()
  const status = keyStatus(entry, env)
  const provider = entry?.provider
  const model = entry?.model
  const panelId = `model-fields-${name}`
  const prefix = `llm.models.${name}`
  const field = problem?.path?.startsWith(`${prefix}.`) ? problem.path.slice(prefix.length + 1) : null
  const rowProblem =
    problem !== null && (problem.path === prefix || (field !== null && !(expanded && hasPath(entry, field))))
  const onTest = () => {
    if (!provider || !model) return
    if (status.state === 'missing' && status.env) notifyMissingKey(name, status.env)
    const compatible = provider === 'openai-compatible'
    void test.run({
      provider,
      model,
      baseUrl: entry?.baseUrl ?? (provider === 'modelscope' ? data.fallback?.baseUrl : undefined),
      apiKeyEnv: compatible ? entry?.apiKeyEnv : undefined
    })
  }
  const inUse = role ? `In use as the ${role} model. Pick another ${role} model first.` : undefined
  return (
    <li data-path={prefix} className="flex flex-col gap-2 border-t border-line px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_15rem] items-center gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? 'Hide' : 'Edit'} the fields of ${name}`}
            title={`${expanded ? 'Hide' : 'Edit'} the fields of ${name}`}
            onClick={onExpand}
            className="rounded-sm p-1 text-ink-3 transition-colors duration-150 hover:bg-subtle hover:text-ink"
          >
            <ChevronRight
              aria-hidden
              className={`size-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
          <span className="min-w-0 max-w-[45%] truncate font-mono text-code font-medium text-ink" title={name}>
            {name}
          </span>
          <Badge dot={false}>
            <span className="font-mono">{provider ?? 'no provider'}</span>
          </Badge>
          <span className="min-w-0 flex-1 truncate font-mono text-code-sm text-ink-2" title={model}>
            {model ?? 'no model'}
          </span>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {role && <Badge tone={role === 'main' ? 'accent' : 'neutral'}>{role}</Badge>}
          <KeyBadge status={status} />
          <Button
            icon={Eye}
            loading={test.running}
            loadingLabel="Testing…"
            disabled={!provider || !model}
            title={!provider || !model ? 'Set a provider and a model first.' : undefined}
            onClick={onTest}
          >
            Test connection
          </Button>
          <span title={inUse}>
            <IconButton
              icon={Trash2}
              label={`Remove ${name}`}
              title={inUse ?? `Remove ${name}`}
              disabled={Boolean(role)}
              onClick={onRemove}
              className="hover:!text-danger disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:!text-ink-2"
            />
          </span>
        </div>
      </div>
      {rowProblem && (
        <p role="alert" className="pl-9 text-small break-words text-danger">
          {problem?.message}
        </p>
      )}
      {test.result && (
        <div className="pl-9">
          <TestResult result={test.result} />
        </div>
      )}
      {expanded && (
        <div id={panelId} className="pt-1 pb-2 pl-9">
          <ConfigForm root={['llm', 'models', name]} />
        </div>
      )}
    </li>
  )
}

interface ModelListProps {
  text: string
  data: ConfigData
  env: ModelEnv
  problem: Problem | null
  expanded: Record<string, boolean>
  onExpand: (name: string, open: boolean) => void
}

export function ModelList({ text, data, env, problem, expanded, onExpand }: ModelListProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const llm = data.llm ?? {}
  const entries = Object.entries(llm.models ?? {})
  const roleOf = (name: string) => (llm.main === name ? 'main' : llm.fallback === name ? 'fallback' : null)
  const listProblem = problem?.path === 'llm.models' ? problem.message : null
  return (
    <section aria-labelledby="models-title" data-path="llm.models" className="rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
        <CardHeading
          id="models-title"
          title="Model entries"
          path="llm.models"
          help="Main and fallback pick from these. Test a connection before you switch."
        />
        {listProblem && (
          <p role="alert" className="text-small text-danger">
            {listProblem}
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-small text-ink-3">
          No models yet. Add an OpenAI-compatible model below.
        </p>
      ) : (
        <ul>
          {entries.map(([name, entry]) => (
            <ModelRow
              key={name}
              name={name}
              entry={entry}
              role={roleOf(name)}
              data={data}
              env={env}
              problem={
                problem?.path === `llm.models.${name}` || problem?.path?.startsWith(`llm.models.${name}.`)
                  ? problem
                  : null
              }
              expanded={Boolean(expanded[name])}
              onExpand={() => onExpand(name, !expanded[name])}
              onRemove={() => setRemoving(name)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing}?`}
        actions={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removing) {
                  setConfigDraft(removePair(text, ['llm', 'models'], removing))
                  notifications.toast({
                    tone: 'success',
                    title: `Removed ${removing}`,
                    body: 'Save to keep the change.'
                  })
                }
                setRemoving(null)
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        This deletes <span className="font-mono text-code-sm">llm.models.{removing}</span> from config.yml. Nothing
        changes on disk until you save.
      </Dialog>
    </section>
  )
}
