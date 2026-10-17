import { Images, ListFilter, type LucideIcon, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Field'
import type { View } from './model'
import { MOOD_NAME } from './model'

export interface MoodRow {
  key: string
  color: string | null
  roles: string[]
  broken: boolean
}

interface MoodListProps {
  rows: MoodRow[]
  rules: number
  view: View
  /** null while moods.yml does not parse. */
  readable: boolean
  rulesBroken: boolean
  sharedBroken: boolean
  onView: (view: View) => void
  onAdd: (name: string) => void
}

const rowClass = (selected: boolean) =>
  `group flex h-[34px] w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 ${
    selected ? 'bg-selected' : 'hover:bg-subtle'
  }`

// Role badges sit beside the name while they fit and wrap onto a line under it when they do not.
const moodRowClass = (selected: boolean) =>
  `group flex min-h-[34px] w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ${
    selected ? 'bg-selected' : 'hover:bg-subtle'
  }`

function ErrorMark() {
  return (
    <span title="Has errors" className="inline-flex shrink-0 text-danger">
      <TriangleAlert aria-hidden className="size-3.5" />
      <span className="sr-only">, has errors</span>
    </span>
  )
}

function ItemRow({
  icon: Icon,
  label,
  detail,
  selected,
  broken,
  onClick
}: {
  icon: LucideIcon
  label: string
  detail?: string
  selected: boolean
  broken: boolean
  onClick: () => void
}) {
  return (
    <button type="button" aria-current={selected ? 'true' : undefined} onClick={onClick} className={rowClass(selected)}>
      <Icon aria-hidden className={`size-4 shrink-0 ${selected ? 'text-accent-ink' : 'text-ink-3'}`} />
      <span
        className={`min-w-0 flex-1 truncate text-body ${selected ? 'font-medium text-ink' : 'text-ink-2 group-hover:text-ink'}`}
      >
        {label}
      </span>
      {broken && <ErrorMark />}
      {detail && <span className="font-mono text-code-sm text-ink-3">{detail}</span>}
    </button>
  )
}

export function MoodList({ rows, rules, view, readable, rulesBroken, sharedBroken, onView, onAdd }: MoodListProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const keys = rows.map((row) => row.key)
  const nameError = !name
    ? null
    : !MOOD_NAME.test(name)
      ? 'Start with a letter; use lowercase letters, digits and dashes.'
      : keys.includes(name)
        ? 'A mood with that name exists.'
        : null
  const submit = () => {
    if (!name || nameError) return
    onAdd(name)
    setName('')
    setAdding(false)
  }

  return (
    <>
      <h2 className="text-section text-ink">Moods</h2>
      <p className="text-small text-ink-3">Rules pick a mood each turn; its prompt follows the cached prefix.</p>
      <span aria-hidden className="h-1.5" />
      {!readable && (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-small text-danger">
          moods.yml has a YAML syntax error. Fix it in the editor.
        </p>
      )}
      <ItemRow
        icon={ListFilter}
        label="Detection rules"
        detail={String(rules)}
        selected={view.kind === 'rules'}
        broken={rulesBroken}
        onClick={() => onView({ kind: 'rules' })}
      />
      <ItemRow
        icon={Images}
        label="Pairs and portraits"
        selected={view.kind === 'shared'}
        broken={sharedBroken}
        onClick={() => onView({ kind: 'shared' })}
      />
      <h3 className="mt-4 flex items-center px-2 text-label text-ink-3">
        <span className="flex-1" title="In the order Jev and /stats list them">
          All moods
        </span>
        <span className="font-mono text-code-sm">{rows.length}</span>
      </h3>
      <ul aria-label="Moods" className="flex flex-col gap-1">
        {rows.map((row) => {
          const selected = view.kind === 'mood' && view.key === row.key
          return (
            <li key={row.key}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onView({ kind: 'mood', key: row.key })}
                className={moodRowClass(selected)}
              >
                <span className="flex min-w-0 grow items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full border border-line-strong"
                    style={row.color ? { backgroundColor: row.color } : undefined}
                  />
                  <span
                    title={row.key}
                    className={`min-w-0 truncate font-mono text-code-sm ${selected ? 'text-ink' : 'text-ink-2 group-hover:text-ink'}`}
                  >
                    {row.key}
                  </span>
                  {row.broken && <ErrorMark />}
                </span>
                {row.roles.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <Badge key={role}>{role}</Badge>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {adding ? (
        <form
          className="mt-1 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field
            label="Mood name"
            helper="Creates prompts/moods/<name>.md and a moods.yml entry modelled on the default mood."
            error={nameError}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                placeholder="e.g. wistful"
                autoFocus
                onValue={setName}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAdding(false)
                }}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              icon={Plus}
              disabled={!name || Boolean(nameError)}
              title={!name ? 'Type a mood name first' : (nameError ?? undefined)}
            >
              Add
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="ghost"
          icon={Plus}
          className="mt-1 self-start"
          disabled={!readable}
          title={readable ? undefined : 'Fix moods.yml first'}
          onClick={() => setAdding(true)}
        >
          Add mood
        </Button>
      )}
    </>
  )
}
