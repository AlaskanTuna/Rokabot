import { Eye, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextInput, Toggle } from '../../components/ui/Field'
import { notifications } from '../../state/notifications'
import { setConfigDraft } from '../../state/workspace'
import { CardHeading, type ConfigData } from './configShared'
import { type ModelEnv, TestResult, notifyMissingKey, useConnectionTest } from './parts'
import { type Flow, insertPair } from './textEdit'

interface Form {
  key: string
  model: string
  baseUrl: string
  apiKeyEnv: string
  tools: boolean
  vision: boolean
  jsonSchema: boolean
}

type FieldName = 'key' | 'model' | 'baseUrl'

const KEY_LIKE = /(?:KEY|TOKEN|SECRET)$/

const EMPTY: Form = { key: '', model: '', baseUrl: '', apiKeyEnv: '', tools: true, vision: false, jsonSchema: false }

function protocolOf(url: string): string | null {
  try {
    return new URL(url).protocol
  } catch {
    return null
  }
}

function errorsFor(form: Form, taken: string[]): Record<FieldName, string | null> {
  const key = form.key.trim()
  const protocol = protocolOf(form.baseUrl.trim())
  return {
    key: !key
      ? 'Enter a key, such as local.'
      : !/^[A-Za-z][\w-]*$/.test(key)
        ? 'Start with a letter, then use letters, digits, - or _.'
        : taken.includes(key)
          ? `llm.models already has ${key}. Pick another key.`
          : null,
    model: form.model.trim() ? null : 'Enter the model id the server expects.',
    baseUrl: !form.baseUrl.trim()
      ? 'Enter the server base URL, such as http://localhost:11434/v1.'
      : protocol === 'http:' || protocol === 'https:'
        ? null
        : 'Use an http:// or https:// URL.'
  }
}

export function AddModel({ text, data, env }: { text: string; data: ConfigData; env: ModelEnv }) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [shown, setShown] = useState<Set<FieldName>>(new Set())
  const [focusInvalid, setFocusInvalid] = useState(0)
  const root = useRef<HTMLFormElement>(null)
  const test = useConnectionTest()
  const models = data.llm?.models ?? {}
  const errors = errorsFor(form, Object.keys(models))
  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))

  useEffect(() => {
    if (focusInvalid) root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusInvalid])

  const used = Object.values(models).flatMap((entry) => (entry?.apiKeyEnv ? [entry.apiKeyEnv] : []))
  const secretKeys = (env.secrets ?? []).map((secret) => secret.key).filter((key) => KEY_LIKE.test(key))
  const keys = [...new Set([...secretKeys, ...used])]
  const options = [
    { value: '', label: 'None (keyless server)', detail: 'Sends no Authorization header' },
    ...keys.map((key) => {
      const secret = env.secrets?.find((entry) => entry.key === key)
      return { value: key, label: key, detail: secret?.set ? 'set in .env' : 'not set in .env' }
    })
  ]

  const check = (fields: FieldName[]) => {
    setShown(new Set([...shown, ...fields]))
    const bad = fields.some((field) => errors[field])
    if (bad) setFocusInvalid((count) => count + 1)
    return !bad
  }

  const onTest = () => {
    if (!check(['model', 'baseUrl'])) return
    const secret = form.apiKeyEnv ? env.secrets?.find((entry) => entry.key === form.apiKeyEnv) : undefined
    if (form.apiKeyEnv && secret && !secret.set) notifyMissingKey(form.key.trim() || 'This model', form.apiKeyEnv)
    void test.run({
      provider: 'openai-compatible',
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKeyEnv: form.apiKeyEnv || undefined
    })
  }

  const onAdd = () => {
    if (!check(['key', 'model', 'baseUrl'])) return
    const key = form.key.trim()
    const capabilities: { [name: string]: Flow } = {}
    if (!form.tools) capabilities.tools = false
    if (form.vision) capabilities.vision = true
    if (form.jsonSchema) capabilities.structuredOutput = 'json_schema'
    const entry: { [name: string]: Flow } = {
      provider: 'openai-compatible',
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim()
    }
    if (form.apiKeyEnv) entry.apiKeyEnv = form.apiKeyEnv
    if (Object.keys(capabilities).length > 0) entry.capabilities = capabilities
    setConfigDraft(insertPair(text, ['llm', 'models'], key, entry))
    notifications.toast({ tone: 'success', title: `Added ${key}`, body: 'Save to keep it.' })
    setForm(EMPTY)
    setShown(new Set())
    test.clear()
  }

  const error = (field: FieldName) => (shown.has(field) ? errors[field] : null)

  return (
    <form
      ref={root}
      noValidate
      aria-labelledby="add-model-title"
      onSubmit={(event) => {
        event.preventDefault()
        onAdd()
      }}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <CardHeading
        id="add-model-title"
        title="Add an OpenAI-compatible model"
        help="Ollama, OpenRouter, DeepSeek, vLLM, LM Studio: any /chat/completions server."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Key" helper="Name used by main and fallback." error={error('key')}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="local"
              autoComplete="off"
              spellCheck={false}
              value={form.key}
              onValue={(key) => update({ key })}
            />
          )}
        </Field>
        <Field label="Model" helper="Sent as the model id." error={error('model')}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="qwen3:32b"
              autoComplete="off"
              spellCheck={false}
              value={form.model}
              onValue={(model) => update({ model })}
            />
          )}
        </Field>
        <Field label="Base URL" helper="Required." error={error('baseUrl')}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="url"
              placeholder="http://localhost:11434/v1"
              autoComplete="off"
              spellCheck={false}
              value={form.baseUrl}
              onValue={(baseUrl) => update({ baseUrl })}
            />
          )}
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="API key variable" helper="Read from .env.">
          {({ id, describedBy }) => (
            <Select
              id={id}
              describedBy={describedBy}
              value={form.apiKeyEnv}
              options={options}
              plain={form.apiKeyEnv === ''}
              onValue={(apiKeyEnv) => update({ apiKeyEnv })}
            />
          )}
        </Field>
        <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3 self-start md:col-span-2 md:pt-[29px]">
          <legend className="sr-only">Capabilities</legend>
          <Toggle label="Tools" checked={form.tools} onValue={(tools) => update({ tools })} />
          <Toggle label="Vision" checked={form.vision} onValue={(vision) => update({ vision })} />
          <Toggle
            label="JSON schema output"
            checked={form.jsonSchema}
            onValue={(jsonSchema) => update({ jsonSchema })}
          />
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Eye} loading={test.running} loadingLabel="Testing…" onClick={onTest}>
          Test connection
        </Button>
        <Button type="submit" variant="primary" icon={Plus}>
          Add model
        </Button>
      </div>
      <TestResult result={test.result} />
    </form>
  )
}
