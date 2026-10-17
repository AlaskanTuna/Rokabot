import { Plus, Trash2, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type Document, type Node, type Pair, type Scalar, isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Problem } from '../../lib/api'
import { type JsonSchema, blankFor, isRecordSchema, schemaAt } from '../../lib/schema'
import {
  type Path,
  type Primitive,
  addItem,
  blankLike,
  deleteNode,
  pathString,
  removeItem,
  setNode,
  setScalar
} from '../../lib/yamlEdit'
import { Button } from '../ui/Button'
import { Field, TextInput, Toggle, fieldClass } from '../ui/Field'

const WORDS: Record<string, string> = {
  ms: '(ms)',
  usd: '(USD)',
  rpm: 'RPM',
  rpd: 'RPD',
  tpm: 'TPM',
  url: 'URL',
  id: 'ID',
  ttl: 'TTL',
  api: 'API',
  llm: 'LLM',
  tz: 'TZ',
  openai: 'OpenAI',
  modelscope: 'ModelScope'
}

/** `hedgeAfterMs` → "Hedge after (ms)". */
export function humanize(key: string | number): string {
  if (typeof key === 'number') return `Item ${key + 1}`
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => WORDS[word.toLowerCase()] ?? word.toLowerCase())
  const text = words.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function cleanComment(comment: string | null | undefined): string | undefined {
  const text = comment
    ?.split('\n')
    .map((line) => line.replace(/^\s*#?\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
  return text || undefined
}

/** The key's own comment: inline first, then the lines above it (not the file header above the first key). */
function helpFor(pair: Pair, first = false): string | undefined {
  const key = pair.key as Node | null
  const value = pair.value as Node | null
  return (
    cleanComment(value?.comment) ??
    cleanComment(value?.commentBefore) ??
    (first ? undefined : cleanComment(key?.commentBefore))
  )
}

/** What a focus request lands on, in priority order: a group's Remove button comes before its fields in the DOM. */
export const FOCUS_ORDER = ['input, textarea', 'button[role="switch"], button[role="combobox"]', 'summary, button']

/** Problem paths name list items as `a[1]` or `a.1`; one spelling for both. */
const normalize = (path: string) => path.replace(/\[(\d+)\]/g, '.$1')

interface Context {
  text: string
  onChange: (text: string) => void
  problems: Map<string, string>
  hints: Record<string, string>
  readOnly?: boolean
  schema?: JsonSchema
  records: string[]
  level: 2 | 3 | 4
}

function problemFor(context: Context, path: Path): string | undefined {
  return context.problems.get(normalize(pathString(path)))
}

function withHint(context: Context, path: Path, help?: string): string | undefined {
  const hint = context.hints[pathString(path)]
  if (!hint) return help
  // A comment rarely ends in a full stop, so the hint would run on into it.
  return help ? `${help}${/[.!?]$/.test(help) ? '' : '.'} ${hint}` : hint
}

interface YamlFormProps {
  text: string
  onChange: (text: string) => void
  /** Renders only this subtree, e.g. `['memory']` in config.yml. */
  root?: Path
  /** Keys under `root` to leave out. */
  exclude?: string[]
  /** Keys under `root` to show, in this order; others follow unless `only` is set. */
  order?: string[]
  only?: boolean
  problems?: Problem[]
  focusPath?: string | null
  readOnly?: boolean
  /** Extra help appended to a field, keyed by its dotted path (e.g. an allowed range). */
  hints?: Record<string, string>
  /** The file's JSON Schema: decides which maps take new entries and the shape of a new item. */
  schema?: JsonSchema
  /** Dotted paths of maps whose keys are data, for files without a schema (config.yml). */
  records?: string[]
  /** The heading level of top-level cards, so a form nested under a page heading keeps the outline in order. */
  level?: 2 | 3 | 4
}

/**
 * A form generated from a YAML document itself: each key becomes a field, its comment becomes the help text, and every
 * edit rewrites only the characters it changes.
 */
export function YamlForm({
  text,
  onChange,
  root = [],
  exclude = [],
  order = [],
  only,
  problems = [],
  focusPath,
  readOnly,
  hints = {},
  schema,
  records = [],
  level = 2
}: YamlFormProps) {
  const doc = useMemo<Document.Parsed | null>(() => {
    try {
      const parsed = parseDocument(text)
      return parsed.errors.length > 0 ? null : parsed
    } catch {
      return null
    }
  }, [text])
  const problemMap = useMemo(
    () => new Map(problems.filter((p) => p.path).map((p) => [normalize(p.path as string), p.message])),
    [problems]
  )
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusPath || !container.current) return
    let target: HTMLElement | null = null
    let probe = focusPath
    while (probe && !target) {
      target = container.current.querySelector<HTMLElement>(`[data-path="${CSS.escape(probe)}"]`)
      const parent = probe.replace(/(\.[^.[\]]+|\[\d+\])$/, '')
      probe = parent === probe ? '' : parent
    }
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const found = target
    const control = FOCUS_ORDER.map((selector) => found.querySelector<HTMLElement>(selector)).find(Boolean)
    control?.focus({ preventScroll: true })
    target.dataset.flash = ''
    const timer = setTimeout(() => delete target?.dataset.flash, 1600)
    return () => clearTimeout(timer)
  }, [focusPath])

  if (!doc) {
    let line: number | null = null
    try {
      const failed = parseDocument(text)
      line = failed.errors[0]?.linePos?.[0]?.line ?? null
    } catch {}
    return (
      <p role="alert" className="rounded-lg border border-danger px-4 py-3 text-small text-danger">
        The YAML has a syntax error{line ? ` near line ${line}` : ''}, so the form cannot show it. Fix it in the source
        view.
      </p>
    )
  }

  const node = (root.length ? doc.getIn(root, true) : doc.contents) as Node | null
  if (!isMap(node)) return <p className="text-small text-ink-3">Nothing to edit here.</p>
  const context: Context = { text, onChange, problems: problemMap, hints, readOnly, schema, records, level }
  const pairs = (node.items as Pair[]).filter((pair) => !exclude.includes(String((pair.key as Scalar)?.value)))
  const rank = (pair: Pair) => {
    const index = order.indexOf(String((pair.key as Scalar).value))
    return index === -1 ? order.length : index
  }
  const sorted = [...pairs]
    .filter((pair) => !only || order.includes(String((pair.key as Scalar).value)))
    .sort((a, b) => rank(a) - rank(b))

  return (
    <div
      ref={container}
      className="flex flex-col gap-4 [&_[data-flash]]:rounded-md [&_[data-flash]]:outline-2 [&_[data-flash]]:outline-offset-4 [&_[data-flash]]:outline-focus"
    >
      {root.length > 0 && isRecord(context, root, node) ? (
        <MapBody context={context} path={root} node={node} depth={-1} />
      ) : (
        <MapFields context={context} map={sorted} path={root} depth={0} />
      )}
    </div>
  )
}

function MapFields({ context, map, path, depth }: { context: Context; map: Pair[]; path: Path; depth: number }) {
  const first = depth === 0 && path.length === 0 ? map[0] : undefined
  const scalars = map.filter((pair) => isScalar(pair.value) || pair.value === null)
  const others = map.filter((pair) => !(isScalar(pair.value) || pair.value === null))
  return (
    <>
      {scalars.length > 0 && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          {scalars.map((pair) => {
            const key = (pair.key as Scalar).value as string | number
            return (
              <ScalarField
                key={String(key)}
                context={context}
                path={[...path, key]}
                node={pair.value as Scalar | null}
                label={humanize(String(key))}
                help={withHint(context, [...path, key], helpFor(pair, pair === first))}
              />
            )
          })}
        </div>
      )}
      {others.map((pair) => {
        const key = (pair.key as Scalar).value as string | number
        return (
          <Group
            key={String(key)}
            context={context}
            path={[...path, key]}
            node={pair.value as Node}
            title={humanize(String(key))}
            help={withHint(context, [...path, key], helpFor(pair, pair === first))}
            depth={depth}
          />
        )
      })}
    </>
  )
}

function Group({
  context,
  path,
  node,
  title,
  help,
  depth,
  onRemove,
  raw = false
}: {
  context: Context
  path: Path
  node: Node
  title: string
  help?: string
  depth: number
  onRemove?: () => void
  /** Record entries are named by data (a mood, a fingerprint), shown as written rather than humanized. */
  raw?: boolean
}) {
  const problem = problemFor(context, path)
  const heading = depth <= 0 ? 'text-section text-ink' : 'text-body font-medium text-ink'
  const Heading = (depth <= 0 ? `h${context.level}` : `h${Math.min(context.level + 1, 5)}`) as 'h2' | 'h3' | 'h4' | 'h5'
  return (
    <section
      data-path={pathString(path)}
      className={
        depth <= 0
          ? 'flex flex-col gap-3 rounded-lg border border-line bg-surface p-5'
          : 'flex flex-col gap-3 border-t border-line pt-3'
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Heading className={`${heading} break-words`}>
            {raw ? (
              <span className="font-mono">{title}</span>
            ) : (
              <>
                {title} <span className="font-mono text-code-sm font-normal text-ink-3">{String(path.at(-1))}</span>
              </>
            )}
          </Heading>
          {help && <p className="max-w-[72ch] text-small text-ink-3">{help}</p>}
          {problem && (
            <p role="alert" className="text-small text-danger">
              {problem}
            </p>
          )}
        </div>
        {onRemove && !context.readOnly && (
          <button
            type="button"
            aria-label={`Remove ${title}`}
            title={`Remove ${title}`}
            onClick={onRemove}
            className="rounded-sm p-1 text-ink-3 hover:bg-subtle hover:text-danger"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {isMap(node) && <MapBody context={context} path={path} node={node} depth={depth} />}
      {isSeq(node) && <SeqBody context={context} path={path} node={node} depth={depth} />}
    </section>
  )
}

/** A map whose values all share one shape (moods, faces, models) is a record: entries can be added and removed. */
/**
 * A map whose keys are data rather than settings, so entries can be added and removed: the schema decides when there
 * is one; otherwise an empty map, a listed path, or two or more same-shaped values.
 */
function isRecord(context: Context, path: Path, node: Node): boolean {
  if (!isMap(node)) return false
  const known = schemaAt(context.schema, path)
  if (known) return isRecordSchema(known)
  if (context.records.includes(pathString(path)) || node.items.length === 0) return true
  if (node.items.length < 2) return false
  const shapes = (node.items as Pair[]).map(({ value }) => {
    if (isSeq(value)) return 'seq'
    if (isMap(value))
      return `map:${(value.items as Pair[])
        .map((pair) => String((pair.key as Scalar).value))
        .sort()
        .join(',')}`
    return null
  })
  return shapes[0] !== null && shapes.every((shape) => shape === shapes[0])
}

function MapBody({ context, path, node, depth }: { context: Context; path: Path; node: Node; depth: number }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (!isMap(node)) return null
  const pairs = node.items as Pair[]
  if (!isRecord(context, path, node)) return <MapFields context={context} map={pairs} path={path} depth={depth + 1} />
  const keys = pairs.map((pair) => String((pair.key as Scalar).value))
  const nameError =
    name && !/^[A-Za-z0-9][\w-]*$/.test(name)
      ? 'Letters, digits, dashes and underscores.'
      : keys.includes(name)
        ? 'That name is taken.'
        : null
  const add = () => {
    if (!name || nameError) return
    const known = schemaAt(context.schema, [...path, name])
    const value = known ? blankFor(context.schema, known) : pairs[0] ? blankLike((pairs[0].value as Node).toJSON()) : ''
    context.onChange(setNode(context.text, [...path, name], value))
    setName('')
    setAdding(false)
  }
  return (
    <div className="flex flex-col gap-3">
      {pairs.map((pair) => {
        const key = (pair.key as Scalar).value as string | number
        if (isScalar(pair.value) || pair.value === null) {
          return (
            <div key={String(key)} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ScalarField
                  context={context}
                  path={[...path, key]}
                  node={pair.value as Scalar | null}
                  label={String(key)}
                  help={withHint(context, [...path, key], helpFor(pair))}
                />
              </div>
              {!context.readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${String(key)}`}
                  title={`Remove ${String(key)}`}
                  onClick={() => context.onChange(deleteNode(context.text, [...path, key]))}
                  className="mb-1 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-subtle hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </div>
          )
        }
        return (
          <Group
            key={String(key)}
            context={context}
            path={[...path, key]}
            node={pair.value as Node}
            title={String(key)}
            raw
            help={withHint(context, [...path, key], helpFor(pair))}
            depth={depth + 1}
            onRemove={() => context.onChange(deleteNode(context.text, [...path, key]))}
          />
        )
      })}
      {!context.readOnly &&
        (adding ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              add()
            }}
          >
            <Field label="New entry name" error={nameError} className="w-64">
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={name}
                  onValue={setName}
                  autoFocus
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={Plus}
              disabled={!name || Boolean(nameError)}
              className={nameError ? 'mb-6' : ''}
            >
              Add
            </Button>
            <Button onClick={() => setAdding(false)} className={nameError ? 'mb-6' : ''}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)} className="self-start">
            Add {humanize(String(path.at(-1))).toLowerCase()} entry
          </Button>
        ))}
    </div>
  )
}

function SeqBody({ context, path, node, depth }: { context: Context; path: Path; node: Node; depth: number }) {
  if (!isSeq(node)) return null
  const items = node.items as Node[]
  const allScalars = items.every((item) => isScalar(item))
  const values = node.toJSON() as unknown[]
  const sample = values.at(-1)
  const addLabel = `Add ${allScalars ? 'value' : 'item'}`
  return (
    <div className="flex flex-col gap-2">
      {allScalars ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a YAML list item is identified by its position
            <li key={index} data-path={pathString([...path, index])} className="flex flex-col gap-1">
              <div className="relative">
                <ScalarInput
                  context={context}
                  path={[...path, index]}
                  node={item as Scalar}
                  label={`${humanize(String(path.at(-1)))} ${index + 1}`}
                  invalid={Boolean(problemFor(context, [...path, index]))}
                  trailing={
                    !context.readOnly && (
                      <button
                        type="button"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => context.onChange(removeItem(context.text, path, index))}
                        className="absolute top-[17px] right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 hover:bg-subtle hover:text-danger"
                      >
                        <X aria-hidden className="size-3.5" />
                      </button>
                    )
                  }
                />
              </div>
              {problemFor(context, [...path, index]) && (
                <p role="alert" className="text-small text-danger">
                  {problemFor(context, [...path, index])}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        items.map((item, index) => (
          <Group
            // biome-ignore lint/suspicious/noArrayIndexKey: a YAML list item is identified by its position
            key={index}
            context={context}
            path={[...path, index]}
            node={item}
            title={`Item ${index + 1}`}
            depth={depth + 1}
            onRemove={() => context.onChange(removeItem(context.text, path, index))}
          />
        ))
      )}
      {!context.readOnly && (
        <Button
          variant="ghost"
          icon={Plus}
          className="self-start"
          onClick={() => {
            const known = schemaAt(context.schema, [...path, 0])
            const value = known ? blankFor(context.schema, known) : sample === undefined ? '' : blankLike(sample)
            context.onChange(addItem(context.text, path, value))
          }}
        >
          {addLabel}
        </Button>
      )}
    </div>
  )
}

function ScalarField({
  context,
  path,
  node,
  label,
  help
}: { context: Context; path: Path; node: Scalar | null; label: string; help?: string }) {
  const problem = problemFor(context, path)
  const value = node?.value ?? null
  if (typeof value === 'boolean') {
    return (
      <div data-path={pathString(path)} className="flex flex-col gap-1.5 self-end">
        <Toggle
          checked={value}
          disabled={context.readOnly}
          onValue={(next) => context.onChange(setScalar(context.text, path, next))}
          label={label}
        />
        {(problem || help) && (
          <p className={`text-small ${problem ? 'text-danger' : 'text-ink-3'}`}>{problem ?? help}</p>
        )}
      </div>
    )
  }
  return (
    <Field label={label} helper={help} error={problem} path={pathString(path)}>
      {({ id, describedBy, invalid }) => (
        <ScalarInput
          context={context}
          path={path}
          node={node}
          label={label}
          id={id}
          describedBy={describedBy}
          invalid={invalid}
        />
      )}
    </Field>
  )
}

function ScalarInput({
  context,
  path,
  node,
  label,
  id,
  describedBy,
  invalid,
  trailing
}: {
  context: Context
  path: Path
  node: Scalar | null
  label: string
  id?: string
  describedBy?: string
  invalid?: boolean
  trailing?: ReactNode
}) {
  const value = node?.value ?? null
  const numeric = typeof value === 'number'
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [typedError, setTypedError] = useState<string | null>(null)
  // Re-sync only when the document changed under the field, so "0." mid-typing is not snapped back to "0".
  useEffect(() => {
    setDraft((current) => {
      const same = numeric
        ? current.trim() !== '' && Number(current) === value
        : current === (value === null ? '' : String(value))
      return same ? current : value === null ? '' : String(value)
    })
  }, [value, numeric])
  const commit = (next: string) => {
    setDraft(next)
    let parsed: Primitive = next
    if (numeric) {
      const number = Number(next)
      if (next.trim() === '' || !Number.isFinite(number)) {
        setTypedError('Enter a number.')
        return
      }
      parsed = number
    } else if (value === null && next === '') parsed = null
    setTypedError(null)
    if (parsed !== value) context.onChange(setScalar(context.text, path, parsed))
  }
  const multiline = typeof value === 'string' && (value.includes('\n') || value.length > 90)
  const shared = {
    id,
    'aria-label': id ? undefined : label,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || Boolean(typedError) || undefined,
    readOnly: context.readOnly,
    spellCheck: false
  }
  return (
    <>
      {multiline ? (
        <textarea
          {...shared}
          value={draft}
          rows={2}
          onChange={(event) => commit(event.target.value)}
          // field-sizing grows the box with its text, so long lines are never hidden behind a fixed row count.
          className={`${fieldClass(Boolean(invalid || typedError))} h-auto max-h-80 min-h-[56px] resize-y py-1.5 leading-5 [field-sizing:content] ${trailing ? 'pr-9' : ''}`}
        />
      ) : (
        <input
          {...shared}
          type="text"
          inputMode={numeric ? 'decimal' : undefined}
          value={draft}
          placeholder={value === null ? 'empty' : undefined}
          onChange={(event) => commit(event.target.value)}
          className={`${fieldClass(Boolean(invalid || typedError))} ${trailing ? 'pr-9' : ''}`}
        />
      )}
      {trailing}
      {typedError && <p className="text-small text-danger">{typedError}</p>}
    </>
  )
}
