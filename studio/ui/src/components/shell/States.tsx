import { FileText, FolderOpen, KeyRound, Plus, RotateCw, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { notifications } from '../../state/notifications'
import { load, problemLine, reloadAfterPackSwitch, useWorkspace } from '../../state/workspace'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { Skeleton } from '../ui/Overlay'
import { BrandMark } from './Sidebar'

function Card({
  icon,
  title,
  children,
  actions
}: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="relative z-10 flex flex-1 items-center justify-center p-4">
      <section className="glass-overlay flex w-[420px] max-w-full animate-pop-in flex-col items-center gap-4 rounded-xl px-8 py-8 text-center">
        <span className="flex items-center gap-2.5 text-section">
          <BrandMark />
          <span>
            Persona <span className="font-normal text-ink-2">Studio</span>
          </span>
        </span>
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-subtle text-ink-2">{icon}</span>
        <h1 className="text-section text-ink">{title}</h1>
        <div className="flex flex-col gap-3 text-body text-ink-2">{children}</div>
        {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
      </section>
    </main>
  )
}

export function NoTokenState() {
  return (
    <Card icon={<KeyRound aria-hidden className="size-5" />} title="Open the studio from its link">
      <p>
        This page needs the session token from the terminal. Open the link that{' '}
        <code className="font-mono">npm run studio</code> printed, the one ending in{' '}
        <code className="font-mono">#token=…</code>.
      </p>
    </Card>
  )
}

export function ErrorState() {
  const { loadError } = useWorkspace()
  return (
    <Card
      icon={<TriangleAlert aria-hidden className="size-5 text-danger" />}
      title="The studio could not load"
      actions={
        <Button variant="primary" icon={RotateCw} onClick={() => void load()}>
          Try again
        </Button>
      }
    >
      <p className="break-words">{loadError}</p>
    </Card>
  )
}

export function NoPackState() {
  const { noPack } = useWorkspace()
  const [mode, setMode] = useState<'start' | 'create' | 'choose'>('start')
  const [id, setId] = useState('')
  const [dir, setDir] = useState(noPack?.candidates[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idError = id && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) ? 'Use lowercase letters, digits and dashes.' : null

  const back = () => {
    setMode('start')
    setError(null)
  }

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await reloadAfterPackSwitch()
      notifications.notify({ tone: 'success', title: done, body: 'Restart the bot to apply.', toast: true })
    } catch (failure) {
      // A pack that does not load names the file and field, not just the loader's message.
      setError(failure instanceof ApiError ? problemLine(failure.problem) : (failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card icon={<FileText aria-hidden className="size-5" />} title="No character pack found">
      <p>
        Persona Studio looked for <code className="font-mono">{noPack?.configured || 'the configured pack'}</code> and
        found no folder with a character.yml. Start from a template, or point config.yml at an existing pack.
      </p>
      {mode === 'start' && (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button variant="primary" icon={Plus} onClick={() => setMode('create')}>
            Create from template
          </Button>
          <Button
            icon={FolderOpen}
            disabled={!noPack?.candidates.length}
            title={noPack?.candidates.length ? undefined : 'No folder under characters/ has a character.yml yet'}
            onClick={() => setMode('choose')}
          >
            Choose a folder
          </Button>
        </div>
      )}
      {mode === 'create' && (
        <form
          className="flex flex-col gap-3 text-left"
          onSubmit={(event) => {
            event.preventDefault()
            if (!id || idError) return
            void run(() => api.createPack(id), `Created characters/${id}`)
          }}
        >
          <Field
            label="Pack id"
            helper={`Creates characters/${id || '<id>'} from the template.`}
            error={idError ?? error}
          >
            {({ id: fieldId, describedBy, invalid }) => (
              <TextInput
                id={fieldId}
                aria-describedby={describedBy}
                invalid={invalid}
                value={id}
                onValue={(value) => {
                  setId(value)
                  setError(null)
                }}
                placeholder="my-character"
                autoFocus
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={back}>Back</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!id || Boolean(idError)}
              loading={busy}
              loadingLabel="Creating…"
            >
              Create pack
            </Button>
          </div>
        </form>
      )}
      {mode === 'choose' && noPack && (
        <div className="flex flex-col gap-3 text-left">
          <Field label="Pack folder" error={error}>
            {({ id: fieldId, describedBy, invalid }) => (
              <Select
                id={fieldId}
                describedBy={describedBy}
                invalid={invalid}
                value={dir}
                onValue={(value) => {
                  setDir(value)
                  setError(null)
                }}
                options={noPack.candidates.map((candidate) => ({ value: candidate, label: candidate }))}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={back}>Back</Button>
            <Button
              variant="primary"
              disabled={!dir}
              loading={busy}
              loadingLabel="Switching…"
              onClick={() => void run(() => api.selectPack(dir), `Using ${dir}`)}
            >
              Use this pack
            </Button>
          </div>
        </div>
      )}
      <p className="font-mono text-code-sm text-ink-3">config.yml → character: characters/&lt;id&gt;</p>
    </Card>
  )
}

export function LoadingBody() {
  return (
    <div className="grid h-full grid-cols-1 gap-0 md:grid-cols-[272px_1fr_420px]" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3 border-r border-line p-4">
        <Skeleton lines={8} />
      </div>
      <div className="flex flex-col gap-6 p-6">
        <Skeleton lines={3} />
        <Skeleton lines={3} />
        <Skeleton lines={4} />
      </div>
      <div className="flex flex-col gap-6 border-l border-line bg-glass-raised p-5">
        <Skeleton lines={3} />
        <Skeleton lines={3} />
      </div>
    </div>
  )
}
