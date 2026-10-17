import { Eye, EyeOff, Plus, RotateCw, Trash2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Page } from '../components/shell/Page'
import { Badge } from '../components/ui/Badge'
import { Button, IconButton } from '../components/ui/Button'
import { Field, fieldClass } from '../components/ui/Field'
import { Dialog } from '../components/ui/Overlay'
import { type ModelProfile, type Secret, api } from '../lib/api'
import { useLocation } from '../lib/router'
import { readYaml } from '../lib/yaml'
import { copyText, notifications } from '../state/notifications'
import { useWorkspace } from '../state/workspace'
import { FLASH, scrollWithin } from './models/configShared'
import { middleEllipsis, middleSplit } from './prompts/truncate'

const RECREATE_COMMAND = 'docker compose up -d roka'
// What a new key should look like; a key already in .env may be anything dotenv reads, such as https_proxy.
const NEW_KEY = /^[A-Z][A-Z0-9_]*$/
// The most of a key a 440 px dialog title holds on one line before it cuts the middle out.
const TITLE_KEY_CHARS = 32

interface Row {
  secret: Secret
  required: boolean
  line: string
  /** The line in full, or the whole .env.example comment it summarises. */
  note: string
}

const ADD_ID = 'secret-add'
const actionId = (key: string) => `secret-action-${key}`
const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The env var each configured llm role reads its key from, mapped to notes such as "Used by main: haiku". Startup
 * stops when either role's key is missing, so a key listed here is required whatever .env.example says.
 */
function modelUses(config: unknown, profiles: ModelProfile[]): Map<string, string[]> {
  const uses = new Map<string, string[]>()
  const llm = isRecord(config) ? config.llm : undefined
  if (!isRecord(llm) || !isRecord(llm.models)) return uses
  for (const role of ['main', 'fallback'] as const) {
    const name = llm[role]
    const entry = typeof name === 'string' ? llm.models[name] : undefined
    if (!isRecord(entry)) continue
    const env =
      entry.provider === 'openai-compatible'
        ? entry.apiKeyEnv
        : profiles.find((profile) => profile.provider === entry.provider)?.envVar
    if (typeof env !== 'string' || !env) continue
    uses.set(env, [...(uses.get(env) ?? []), `Used by ${role}: ${name}`])
  }
  return uses
}

/** The first sentence of a key's .env.example comment, with a leading "Optional:" turned into "Optional ·". */
function summary(description: string | undefined): string {
  const first = (description ?? '')
    .split(/(?<=[.;])\s+|(?<=\))\s+(?=[A-Z])/)[0]
    .replace(/[.;]$/, '')
    .trim()
  if (/^Required secrets\b/.test(first)) return 'Required'
  return first.replace(/^(Optional|Required)((?: \([^)]*\))?):\s*/, '$1$2 · ')
}

/** `key: null` asks for the key name too (the "Add secret" flow). */
interface SecretTarget {
  key: string | null
}

interface SecretDialogProps {
  target: SecretTarget | null
  secrets: Secret[] | null
  onClose: () => void
  onSaved: (entry: Secret) => void
}

const inputProps = {
  autoComplete: 'off',
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true'
} as const

function Note({ children }: { children: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
      {children}
    </span>
  )
}

/** Writes one key to .env. The value lives only in this dialog's state and is dropped as soon as it closes. */
function SecretDialog({ target, secrets, onClose, onSaved }: SecretDialogProps) {
  const open = target !== null
  const fixed = target?.key ?? null
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)
  // Bumped on close, so a reply that lands after the dialog closed does not write into the next opening.
  const attempt = useRef(0)
  const formId = useId()

  useEffect(() => {
    if (open) (fixed ? valueRef : keyRef).current?.focus()
  }, [open, fixed])

  const close = () => {
    attempt.current++
    setName('')
    setValue('')
    setVisible(false)
    setAttempted(false)
    setBusy(false)
    setError(null)
    onClose()
  }

  const key = fixed ?? name.trim()
  const known = secrets?.find((secret) => secret.key === key)
  const keyError = fixed
    ? null
    : !key
      ? attempted
        ? 'Enter a key name.'
        : null
      : known || NEW_KEY.test(key)
        ? null
        : 'Use capital letters, digits and underscores, like MY_API_KEY.'
  const valueError = /[\r\n]/.test(value) ? 'Use a single line.' : attempted && !value.trim() ? 'Enter a value.' : null
  const keyNote =
    fixed || !key || keyError || !secrets
      ? null
      : known?.set
        ? `${key} is already set. Saving replaces it.`
        : !known?.inExample
          ? `${key} is not in .env.example. Check the spelling before you save.`
          : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    if (!fixed && (!key || keyError)) {
      keyRef.current?.focus()
      return
    }
    if (!value.trim() || /[\r\n]/.test(value)) {
      valueRef.current?.focus()
      return
    }
    const mine = ++attempt.current
    setBusy(true)
    setError(null)
    try {
      const entry = await api.setSecret(key, value)
      if (mine === attempt.current) close()
      onSaved(entry)
    } catch (failure) {
      if (mine !== attempt.current) return
      setError(failure instanceof Error ? failure.message : 'The key was not saved. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={fixed ? `Set ${middleEllipsis(fixed, TITLE_KEY_CHARS)}` : 'Add secret'}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} loadingLabel="Saving…">
            Save key
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {!fixed && (
          <Field
            label="Key"
            error={keyError}
            helper={keyNote ? <Note>{keyNote}</Note> : 'Capital letters, digits and underscores, like MY_API_KEY.'}
          >
            {({ id, describedBy, invalid }) => (
              <input
                ref={keyRef}
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                placeholder="MY_API_KEY"
                className={fieldClass(invalid)}
                {...inputProps}
              />
            )}
          </Field>
        )}
        <Field label="Value" error={valueError} helper="Written to .env on this machine. Shown masked afterwards.">
          {({ id, describedBy, invalid }) => (
            <div className="flex items-center gap-2">
              <input
                ref={valueRef}
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                className={fieldClass(invalid)}
                {...inputProps}
              />
              <IconButton
                icon={visible ? EyeOff : Eye}
                label={visible ? 'Hide value' : 'Show value'}
                aria-controls={id}
                onClick={() => setVisible((current) => !current)}
              />
            </div>
          )}
        </Field>
        {error && (
          <p role="alert" className="text-small break-words text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}

interface ClearDialogProps {
  target: { key: string; required: boolean } | null
  onClose: () => void
  onCleared: (entry: Secret) => void
}

function ClearDialog({ target, onClose, onCleared }: ClearDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef(0)
  const cancelId = useId()
  const open = target !== null

  useEffect(() => {
    if (open) document.getElementById(cancelId)?.focus()
  }, [open, cancelId])

  const close = () => {
    attempt.current++
    setBusy(false)
    setError(null)
    onClose()
  }

  const clear = async () => {
    if (!target || busy) return
    const mine = ++attempt.current
    setBusy(true)
    setError(null)
    try {
      const entry = await api.deleteSecret(target.key)
      if (mine === attempt.current) close()
      onCleared(entry)
    } catch (failure) {
      if (mine !== attempt.current) return
      setError(failure instanceof Error ? failure.message : 'The key was not cleared. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Clear ${middleEllipsis(target?.key ?? '', TITLE_KEY_CHARS)}?`}
      actions={
        <>
          <Button id={cancelId} onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} loadingLabel="Clearing…" onClick={() => void clear()}>
            Clear key
          </Button>
        </>
      }
    >
      <p>
        The key is removed from .env on this machine.{' '}
        {target?.required
          ? 'The bot needs it to start, so add it again before you recreate the bot.'
          : 'Models that use it stop working until you add it again.'}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-small break-words text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}

/** Confirms the write and gives the next step right away, as a saved pack file's toast does. */
function announce(title: string, body: string): void {
  const copy = {
    label: 'Copy command',
    icon: 'copy' as const,
    run: () => void copyText(RECREATE_COMMAND, RECREATE_COMMAND)
  }
  notifications.toast({ tone: 'success', title, body: `${body} Recreate the bot to apply it.`, action: copy })
  notifications.notify({
    key: 'restart-env',
    tone: 'info',
    title: 'Recreate the bot to apply',
    body: '.env changes need the container recreated, not just restarted.',
    actions: [copy]
  })
}

function MaskedValue({ secret }: { secret: Secret }) {
  if (!secret.set) return <span className="min-w-24 flex-1 font-mono text-code-sm text-ink-3">Not set</span>
  const tail = (secret.masked ?? '').replace(/^•+/, '')
  return (
    <span className="min-w-24 flex-1 truncate font-mono text-code-sm text-ink-2">
      <span aria-hidden>{secret.masked}</span>
      <span className="sr-only">{tail ? `Value ending in ${tail}` : 'Value hidden'}</span>
    </span>
  )
}

/** The key in mono; a long one keeps its start and end when it cannot fit. */
function KeyName({ name }: { name: string }) {
  const split = middleSplit(name)
  return (
    <span className="flex min-w-0 font-mono text-code text-ink" title={name}>
      {split ? (
        <>
          <span aria-hidden className="truncate">
            {split[0]}
          </span>
          <span aria-hidden className="shrink-0">
            {split[1]}
          </span>
          <span className="sr-only">{name}</span>
        </>
      ) : (
        <span className="truncate">{name}</span>
      )}
    </span>
  )
}

function SecretRow({ row, onSet, onClear }: { row: Row; onSet: () => void; onClear: () => void }) {
  const { secret, required, line, note } = row
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-2 py-3">
      <div className="flex w-[300px] max-w-full min-w-0 shrink-0 flex-col gap-0.5">
        <KeyName name={secret.key} />
        {line && (
          <span className="truncate text-small text-ink-3" title={note}>
            {line}
          </span>
        )}
      </div>
      <MaskedValue secret={secret} />
      {secret.set ? (
        <Badge tone="success">Set</Badge>
      ) : required ? (
        <Badge tone="danger">Missing</Badge>
      ) : (
        <Badge>Optional</Badge>
      )}
      <Button
        id={actionId(secret.key)}
        variant={secret.set ? 'secondary' : required ? 'primary' : 'ghost'}
        aria-label={`${secret.set ? 'Replace' : 'Add'} ${secret.key}`}
        onClick={onSet}
      >
        {secret.set ? 'Replace' : required ? 'Add key' : 'Add'}
      </Button>
      {secret.set ? (
        <IconButton icon={Trash2} label={`Clear ${secret.key}`} onClick={onClear} />
      ) : (
        <span aria-hidden className="size-8 shrink-0" />
      )}
    </li>
  )
}

// The shared Skeleton paints bg-subtle, which matches bg-raised in dark mode, so the bars use the hairline color.
const Bar = ({ className }: { className: string }) => (
  <span className={`block shrink-0 animate-shimmer bg-line ${className}`} />
)

function LoadingRows() {
  return (
    <>
      {['first', 'second', 'third', 'fourth'].map((slot) => (
        <li key={slot} aria-hidden className="flex items-center gap-4 border-b border-line px-2 py-3">
          <span className="flex w-[300px] max-w-[40%] shrink-0 flex-col gap-2 py-1">
            <Bar className="h-3.5 w-40 max-w-full rounded-sm" />
            <Bar className="h-3 w-56 max-w-full rounded-sm" />
          </span>
          <Bar className="h-3 w-32 rounded-sm" />
          <span className="flex-1" />
          <Bar className="h-[22px] w-12 rounded-full" />
          <Bar className="h-[38px] w-20 rounded-md" />
          <span className="size-8 shrink-0" />
        </li>
      ))}
    </>
  )
}

export default function SecretsScreen() {
  const configDraft = useWorkspace().config?.draft
  const location = useLocation()
  const focusKey = location.route === 'secrets' ? location.search.get('focus') : null
  const [secrets, setSecrets] = useState<Secret[] | null>(null)
  // null until the profiles answer, since a built-in model's key name comes from them.
  const [profiles, setProfiles] = useState<ModelProfile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SecretTarget | null>(null)
  const [clearing, setClearing] = useState<{ key: string; required: boolean } | null>(null)
  const focusAfter = useRef<string | null>(null)

  const load = useCallback(async (initial: boolean) => {
    setLoading(true)
    try {
      setSecrets(await api.secrets())
      setLoadError(null)
    } catch (failure) {
      if (initial) setLoadError(messageOf(failure))
      else notifications.toast({ tone: 'warning', title: 'Could not refresh secrets', body: messageOf(failure) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
    api.modelProfiles().then(setProfiles, () => setProfiles([]))
  }, [load])

  useEffect(() => {
    if (!secrets || !focusAfter.current) return
    const next = document.getElementById(actionId(focusAfter.current)) ?? document.getElementById(ADD_ID)
    next?.focus()
    focusAfter.current = null
  }, [secrets])

  const uses = useMemo(() => modelUses(readYaml(configDraft), profiles ?? []), [configDraft, profiles])
  const rows = useMemo(() => {
    if (!secrets) return null
    const listed = new Set(secrets.map((secret) => secret.key))
    // A configured role's key stays listed, as Missing, even when neither .env nor .env.example names it.
    const unlisted = [...uses.keys()]
      .filter((key) => !listed.has(key))
      .map((key): Secret => ({ key, set: false, masked: null, inExample: false, description: '', required: true }))
    const ranked = [...secrets, ...unlisted].map((secret): Row => {
      const notes = uses.get(secret.key) ?? []
      const line = notes.length > 0 ? notes.join(' · ') : summary(secret.description)
      return {
        secret,
        required: secret.required === true || notes.length > 0,
        line,
        note: notes.length > 0 ? line : secret.description || line
      }
    })
    const rank = (row: Row) => (row.required ? 0 : row.secret.set ? 1 : 2)
    return ranked.sort((a, b) => rank(a) - rank(b))
  }, [secrets, uses])
  const missing = rows?.filter((row) => row.required && !row.secret.set).length ?? 0

  // ?focus=KEY, from the Models page's "Open Secrets": scroll to the row, flash it and focus its action, once per link
  // so a later reload of the list does not pull focus back.
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (!focusKey) {
      revealed.current = null
      return
    }
    if (!rows || revealed.current === focusKey) return
    const action = document.getElementById(actionId(focusKey))
    const row = action?.closest('li')
    // A configured model's key gets its row once the profiles answer.
    if (!row && profiles === null) return
    revealed.current = focusKey
    if (!action || !row) return
    scrollWithin(row, 'center')
    action.focus({ preventScroll: true })
    row.dataset.flash = ''
    setTimeout(() => delete row.dataset.flash, 1600)
  }, [focusKey, rows, profiles])

  const apply = (entry: Secret) => {
    setSecrets((current) => {
      if (!current) return current
      // A cleared key that nothing lists or requires leaves the list, as the next read would drop it too; a configured
      // model's key comes back as a Missing row.
      if (!entry.set && !entry.inExample && !entry.required) return current.filter((secret) => secret.key !== entry.key)
      return current.some((secret) => secret.key === entry.key)
        ? current.map((secret) => (secret.key === entry.key ? entry : secret))
        : [...current, entry]
    })
    void load(false)
  }

  return (
    <Page
      title="Secrets"
      subtitle=".env on this machine · never leaves localhost"
      badges={
        !rows ? (
          false
        ) : missing > 0 ? (
          <Badge tone="warning">{missing} missing</Badge>
        ) : (
          <Badge tone="success">All required keys set</Badge>
        )
      }
      actions={
        <Button id={ADD_ID} variant="primary" icon={Plus} onClick={() => setEditing({ key: null })}>
          Add secret
        </Button>
      }
    >
      <div className="flex max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-8">
        {loadError ? (
          <div className="flex flex-wrap items-start gap-3 rounded-lg border border-danger bg-raised p-4">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            <div role="alert" className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-body font-medium text-ink">Could not load secrets</p>
              <p className="text-small break-words text-ink-2">{loadError}</p>
            </div>
            <Button icon={RotateCw} loading={loading} loadingLabel="Retrying…" onClick={() => void load(true)}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {!rows && (
              <p role="status" className="sr-only">
                Loading secrets…
              </p>
            )}
            <ul
              aria-label="Keys in .env"
              aria-busy={!rows}
              className={`flex flex-col gap-1 rounded-lg border border-line bg-raised p-5 ${FLASH}`}
            >
              {rows ? (
                rows.map((row) => (
                  <SecretRow
                    key={row.secret.key}
                    row={row}
                    onSet={() => setEditing({ key: row.secret.key })}
                    onClear={() => setClearing({ key: row.secret.key, required: row.required })}
                  />
                ))
              ) : (
                <LoadingRows />
              )}
            </ul>
          </>
        )}
        <p className="text-small text-ink-3">
          Keys are written to .env on this machine and shown masked after you enter them.
        </p>
      </div>
      <SecretDialog
        target={editing}
        secrets={rows?.map((row) => row.secret) ?? null}
        onClose={() => setEditing(null)}
        onSaved={(entry) => {
          apply(entry)
          announce(`Saved ${entry.key}`, 'Written to .env.')
        }}
      />
      <ClearDialog
        target={clearing}
        onClose={() => setClearing(null)}
        onCleared={(entry) => {
          focusAfter.current = entry.key
          apply(entry)
          announce(`Cleared ${entry.key}`, 'Removed from .env.')
        }}
      />
    </Page>
  )
}
