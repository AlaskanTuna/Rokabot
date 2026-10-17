import { CircleCheck, CircleX } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Field, Select, TextInput, Toggle } from '../../components/ui/Field'
import { type ModelProfile, type ModelTest, type Secret, api } from '../../lib/api'
import { href, navigate } from '../../lib/router'
import { notifications } from '../../state/notifications'
import { setConfigDraft } from '../../state/workspace'
import type { ConfigData, ModelEntry } from './configShared'
import { putScalar, setFallback } from './textEdit'

export interface ModelEnv {
  secrets: Secret[] | null
  profiles: ModelProfile[] | null
  error: string | null
}

/** The .env keys and the built-in profiles, fetched once per visit so a key set on Secrets shows on return. */
export function useModelEnv(): ModelEnv {
  const [env, setEnv] = useState<ModelEnv>({ secrets: null, profiles: null, error: null })
  useEffect(() => {
    let live = true
    Promise.all([api.secrets(), api.modelProfiles()])
      .then(([secrets, profiles]) => live && setEnv({ secrets, profiles, error: null }))
      .catch((error: Error) => live && setEnv({ secrets: null, profiles: null, error: error.message }))
    return () => {
      live = false
    }
  }, [])
  return env
}

export type KeyState = 'set' | 'missing' | 'keyless' | 'unknown'

export interface KeyStatus {
  env: string | null
  state: KeyState
}

export function keyStatus(entry: ModelEntry | null | undefined, env: ModelEnv): KeyStatus {
  if (!entry?.provider) return { env: null, state: 'unknown' }
  const name =
    entry.provider === 'openai-compatible'
      ? (entry.apiKeyEnv ?? null)
      : (env.profiles?.find((profile) => profile.provider === entry.provider)?.envVar ?? undefined)
  if (name === null) return { env: null, state: 'keyless' }
  if (name === undefined || !env.secrets) return { env: name ?? null, state: 'unknown' }
  return { env: name, state: env.secrets.find((secret) => secret.key === name)?.set ? 'set' : 'missing' }
}

export function KeyBadge({ status }: { status: KeyStatus }) {
  if (status.state === 'keyless') return <Badge>keyless</Badge>
  if (!status.env || status.state === 'unknown') return null
  return (
    <Badge tone={status.state === 'set' ? 'success' : 'danger'}>
      <span className="font-mono">{status.env}</span> {status.state}
    </Badge>
  )
}

export function notifyMissingKey(model: string, env: string): void {
  notifications.notify({
    key: `missing-key-${env}`,
    tone: 'danger',
    title: `${env} is not set`,
    body: `${model} needs it to connect. Add it on Secrets, then test again.`,
    toast: true,
    actions: [
      {
        label: 'Open Secrets',
        primary: true,
        run: () => navigate(`${href('secrets')}?focus=${encodeURIComponent(env)}`)
      }
    ]
  })
}

export interface TestBody {
  provider: string
  model: string
  baseUrl?: string
  apiKeyEnv?: string
}

export function useConnectionTest() {
  const [state, setState] = useState<{ running: boolean; result: ModelTest | null }>({ running: false, result: null })
  const run = async (body: TestBody) => {
    setState({ running: true, result: null })
    try {
      setState({ running: false, result: await api.testModel(body) })
    } catch (error) {
      const message = (error as Error).message
      setState({ running: false, result: { ok: false, status: null, latencyMs: null, message, modelListed: null } })
    }
  }
  const clear = () => setState({ running: false, result: null })
  return { ...state, run, clear }
}

export function TestResult({ result }: { result: ModelTest | null }) {
  if (!result) return null
  return result.ok ? (
    <p role="status" className="flex items-start gap-1.5 text-small text-success">
      <CircleCheck aria-hidden className="mt-px size-4 shrink-0" />
      {result.message}
    </p>
  ) : (
    <p role="alert" className="flex items-start gap-1.5 text-small break-words text-danger">
      <CircleX aria-hidden className="mt-px size-4 shrink-0" />
      {result.message}
    </p>
  )
}

const card = 'flex flex-col gap-4 rounded-lg border border-line bg-surface p-5'

interface RoleCardProps {
  kind: 'main' | 'fallback'
  text: string
  data: ConfigData
  env: ModelEnv
  error?: string
}

export function RoleCard({ kind: role, text, data, env, error }: RoleCardProps) {
  const llm = data.llm ?? {}
  const models = llm.models ?? {}
  const isMain = role === 'main'
  const current = (isMain ? llm.main : llm.fallback) ?? ''
  const entry = current ? models[current] : undefined
  const options = Object.entries(models).map(([key, value]) => ({
    value: key,
    label: `${key} · ${value?.model ?? 'no model'}`,
    detail: `${value?.model ?? 'no model'} · ${value?.provider ?? 'no provider'}`
  }))
  if (!isMain) options.unshift({ value: '', label: 'None', detail: 'No fallback model' })
  const status = keyStatus(entry, env)
  const parts: ReactNode[] = []
  if (current && !entry) parts.push(<span className="text-danger">not in llm.models</span>)
  if (entry) {
    parts.push(entry.provider ?? 'no provider')
    if (entry.effort) parts.push(`effort ${entry.effort}`)
    if (status.state === 'keyless') parts.push('keyless')
    else if (status.env && status.state !== 'unknown') {
      parts.push(
        <span className={status.state === 'missing' ? 'text-danger' : undefined}>
          {status.env} {status.state}
        </span>
      )
    }
    if (entry.provider === 'modelscope') parts.push(`${llm.modelscopeDailyMagicubes ?? 250} Magicubes a day`)
  }
  const titleId = `role-${role}`
  return (
    <section aria-labelledby={titleId} className={card}>
      <div className="flex items-center gap-2">
        <h2 id={titleId} className="text-section text-ink">
          {isMain ? 'Main model' : 'Fallback model'}
        </h2>
        <Badge tone={isMain ? 'accent' : 'neutral'}>{role}</Badge>
      </div>
      <Field
        label="Model"
        path={`llm.${role}`}
        helper={isMain ? 'Writes every reply.' : 'Answers when the main model fails.'}
        error={error}
      >
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            describedBy={describedBy}
            invalid={invalid}
            value={current}
            options={options}
            plain
            onValue={(value) =>
              setConfigDraft(isMain ? putScalar(text, ['llm', 'main'], value) : setFallback(text, value || null))
            }
          />
        )}
      </Field>
      <p className="font-mono text-code-sm break-words text-ink-3">
        {parts.length > 0
          ? parts.map((part, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts are a fixed sequence rebuilt each render
              <span key={index}>
                {index > 0 && ' · '}
                {part}
              </span>
            ))
          : isMain
            ? 'Pick the model that writes replies.'
            : 'Off: when the main model fails, no other model answers.'}
      </p>
    </section>
  )
}

function duration(ms: number): string {
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  const seconds = Math.round(ms / 1000)
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

const DEFAULT_STICKY_MS = 300_000

interface RoutingCardProps {
  text: string
  data: ConfigData
  problemPath: string | null
  problemMessage: string
}

export function RoutingCard({ text, data, problemPath, problemMessage }: RoutingCardProps) {
  const llm = data.llm ?? {}
  const sticky = typeof llm.stickyMs === 'number' ? llm.stickyMs : DEFAULT_STICKY_MS
  const hedge = typeof llm.hedgeAfterMs === 'number' ? llm.hedgeAfterMs : 0
  const [draft, setDraft] = useState(String(hedge))
  const [typed, setTyped] = useState<string | null>(null)
  useEffect(() => {
    setDraft((current) => (current.trim() !== '' && Number(current) === hedge ? current : String(hedge)))
    setTyped(null)
  }, [hedge])
  const onHedge = (value: string) => {
    setDraft(value)
    if (!/^\d+$/.test(value.trim())) {
      setTyped('Enter a whole number of milliseconds, 0 or more.')
      return
    }
    setTyped(null)
    const next = Number(value.trim())
    if (next !== hedge) setConfigDraft(putScalar(text, ['llm', 'hedgeAfterMs'], next, ['stickyMs', 'fallback', 'main']))
  }
  const stickyError = problemPath === 'llm.stickyMs' ? problemMessage : null
  const noFallback = !llm.fallback
  return (
    <section aria-labelledby="routing-title" className={card}>
      <div className="flex flex-col gap-0.5">
        <h2 id="routing-title" className="text-section text-ink">
          Routing
        </h2>
        {noFallback && (
          <p className="text-small text-ink-3">No fallback model is set, so these settings change nothing.</p>
        )}
      </div>
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:gap-8">
        <div data-path="llm.stickyMs" className="flex flex-col gap-1.5 xl:pt-[29px]">
          <Toggle
            checked={sticky > 0}
            describedBy={stickyError ? 'sticky-error' : undefined}
            label={`Start replies on the fallback for ${duration(sticky > 0 ? sticky : DEFAULT_STICKY_MS)} after a failure`}
            onValue={(on) =>
              setConfigDraft(
                putScalar(text, ['llm', 'stickyMs'], on ? DEFAULT_STICKY_MS : 0, ['hedgeAfterMs', 'fallback', 'main'])
              )
            }
          />
          {stickyError && (
            <p id="sticky-error" role="alert" className="text-small text-danger">
              {stickyError}
            </p>
          )}
        </div>
        <Field
          label="Hedge after (ms)"
          helper="0 turns hedging off."
          error={typed ?? (problemPath === 'llm.hedgeAfterMs' ? problemMessage : null)}
          path="llm.hedgeAfterMs"
          className="w-full max-w-80"
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              inputMode="numeric"
              spellCheck={false}
              value={draft}
              onValue={onHedge}
            />
          )}
        </Field>
      </div>
    </section>
  )
}
