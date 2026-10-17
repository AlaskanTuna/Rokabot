import { GripVertical, Plus, X } from 'lucide-react'
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Field'
import { NAME, type PromptEntry, type Source, entryKey } from './model'
import { middleSplit } from './truncate'

const TONE: Record<Source, 'neutral' | 'warning' | 'danger'> = {
  pack: 'neutral',
  harness: 'neutral',
  locked: 'warning',
  missing: 'danger'
}

const SOURCE_HELP: Record<Source, string> = {
  pack: 'This pack’s own file',
  harness: 'Shared harness prompt',
  locked: 'Harness prompt that packs cannot change',
  missing: 'No file with this name yet'
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span title={SOURCE_HELP[source]} className="inline-flex">
      <Badge tone={TONE[source]}>{source}</Badge>
    </span>
  )
}

interface SectionListProps {
  order: PromptEntry[]
  others: PromptEntry[]
  /** null while character.yml does not parse. */
  readable: boolean
  selected: string | null
  tokens: number | null
  onSelect: (entry: PromptEntry) => void
  onOrder: (names: string[]) => void
  /** Adds a section; returns why it cannot, or null when it was added. */
  onAdd: (name: string) => string | null
}

/** Keys that stay stable while rows move, even when a name repeats. */
function rowKeys(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count === 0 ? name : `${name}#${count}`
  })
}

const rowClass = (selected: boolean) =>
  `flex h-[34px] items-center gap-2 rounded-md px-2 transition-colors duration-150 ${selected ? 'bg-selected' : 'hover:bg-subtle'}`

/** A section's name; a long one keeps its start and end when it cannot fit. */
function SectionName({ name, selected }: { name: string; selected: boolean }) {
  // A short tail: the order column is narrow, and the head should keep the start readable.
  const split = middleSplit(name, 10)
  return (
    <span
      title={name}
      className={`flex min-w-0 flex-1 font-mono text-code-sm ${selected ? 'text-ink' : 'text-ink-2 group-hover:text-ink'}`}
    >
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

export function SectionList({ order, others, readable, selected, tokens, onSelect, onOrder, onAdd }: SectionListProps) {
  const hintId = useId()
  const [announcement, setAnnouncement] = useState('')
  const [drag, setDrag] = useState<{ from: number; to: number | null } | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const focusAfter = useRef<string | null>(null)
  const names = order.map((entry) => entry.name)
  const keys = rowKeys(names)

  useEffect(() => {
    if (!focusAfter.current) return
    buttons.current.get(focusAfter.current)?.focus()
    focusAfter.current = null
  })

  const move = (from: number, insertAt: number, keyboard: boolean) => {
    const target = insertAt > from ? insertAt - 1 : insertAt
    if (target === from || target < 0 || target >= names.length) return
    const next = [...names]
    const [moved] = next.splice(from, 1)
    next.splice(target, 0, moved)
    if (keyboard) focusAfter.current = rowKeys(next)[target]
    onOrder(next)
    setAnnouncement(`${moved} moved to position ${target + 1} of ${next.length}.`)
  }

  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && index === 0) return setAnnouncement(`${names[index]} is already first.`)
    if (event.key === 'ArrowDown' && index === names.length - 1)
      return setAnnouncement(`${names[index]} is already last.`)
    move(index, event.key === 'ArrowUp' ? index - 1 : index + 2, true)
  }

  const onDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!drag) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const box = event.currentTarget.getBoundingClientRect()
    const to = event.clientY < box.top + box.height / 2 ? index : index + 1
    if (to !== drag.to) setDrag({ ...drag, to })
  }

  const remove = (index: number) => {
    const next = names.filter((_, position) => position !== index)
    const nextKeys = rowKeys(next)
    focusAfter.current = nextKeys[Math.min(index, nextKeys.length - 1)] ?? null
    onOrder(next)
    setAnnouncement(`${names[index]} removed from the order. Its file stays under Other prompts.`)
  }

  const nameError = !name
    ? null
    : !NAME.test(name)
      ? 'Use lowercase letters, digits and dashes, starting with a letter or digit.'
      : names.includes(name)
        ? 'That section is already in the order.'
        : null

  const submit = () => {
    if (!name || nameError) return
    const refused = onAdd(name)
    if (refused) return setAddError(refused)
    setAnnouncement(`${name} added at position ${names.length + 1}.`)
    setName('')
    setAddError(null)
    setAdding(false)
  }

  const showDrop = (index: number) => {
    if (!drag || drag.to === null || drag.to === drag.from || drag.to === drag.from + 1) return null
    if (drag.to === index) return 'top'
    if (index === names.length - 1 && drag.to === names.length) return 'bottom'
    return null
  }

  return (
    <>
      <h2 className="text-section text-ink">System prompt order</h2>
      <p className="text-small text-ink-3">
        Top to bottom.{' '}
        {tokens === null
          ? 'Cached as one prefix; the token count returns once the pack loads.'
          : `Cached as one prefix: ${tokens.toLocaleString()} tokens.`}
      </p>
      <p id={hintId} className="sr-only">
        Press Alt plus Up or Down arrow to move this section.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <span aria-hidden className="h-1.5" />
      {!readable && (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-small text-danger">
          character.yml has a YAML syntax error, so the order cannot be shown. Fix it on the Identity screen.
        </p>
      )}
      <ol
        aria-label="System prompt sections, top to bottom"
        className="flex flex-col gap-1"
        onDragOver={(event) => {
          if (drag) event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (drag && drag.to !== null) move(drag.from, drag.to, false)
          setDrag(null)
        }}
      >
        {order.map((entry, index) => {
          const key = keys[index]
          const isSelected = selected === entryKey(entry)
          const drop = showDrop(index)
          return (
            <li
              key={key}
              className={`group relative ${drag?.from === index ? 'opacity-50' : ''}`}
              onDragOver={(event) => onDragOver(event, index)}
            >
              {drop && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute right-2 left-2 h-0.5 rounded-full bg-focus ${drop === 'top' ? '-top-[3px]' : '-bottom-[3px]'}`}
                />
              )}
              <div className={rowClass(isSelected)}>
                <span
                  draggable
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    const row = event.currentTarget.closest('li')
                    if (row) event.dataTransfer.setDragImage(row, 16, 17)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', entry.name)
                    setDrag({ from: index, to: null })
                  }}
                  onDragEnd={() => setDrag(null)}
                  className="flex cursor-grab items-center text-ink-3 hover:text-ink-2 active:cursor-grabbing"
                >
                  <GripVertical aria-hidden className="size-3.5" />
                </span>
                <button
                  type="button"
                  ref={(element) => {
                    if (element) buttons.current.set(key, element)
                    else buttons.current.delete(key)
                  }}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-describedby={hintId}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  onClick={() => onSelect(entry)}
                  onKeyDown={(event) => onRowKey(event, index)}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-sm text-left"
                >
                  <SectionName name={entry.name} selected={isSelected} />
                  <SourceBadge source={entry.source} />
                </button>
                {entry.source !== 'locked' && (
                  <button
                    type="button"
                    aria-label={`Remove ${entry.name} from the order`}
                    title={
                      names.length === 1
                        ? 'The system prompt needs at least one section'
                        : `Remove ${entry.name} from the order`
                    }
                    disabled={names.length === 1}
                    onClick={() => remove(index)}
                    className="hidden size-[22px] shrink-0 items-center justify-center rounded-sm text-ink-3 group-focus-within:inline-flex group-hover:inline-flex hover:bg-subtle hover:text-danger disabled:opacity-45"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {adding ? (
        <form
          className="mt-1 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field
            label="Section name"
            helper="An existing harness prompt is reused; a new name creates prompts/<name>.md in this pack."
            error={nameError ?? addError}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={name}
                placeholder="e.g. backstory"
                autoFocus
                onValue={(value) => {
                  setName(value)
                  setAddError(null)
                }}
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
              title={!name ? 'Type a section name first' : (nameError ?? undefined)}
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
          title={readable ? undefined : 'Fix character.yml first'}
          onClick={() => setAdding(true)}
        >
          Add section
        </Button>
      )}
      {others.length > 0 && (
        <>
          <h3 className="mt-5 px-2 text-label text-ink-3">Other prompts</h3>
          <ul aria-label="Other prompts" className="flex flex-col gap-1">
            {others.map((entry) => {
              const isSelected = selected === entryKey(entry)
              return (
                <li key={entryKey(entry)} className="group">
                  <button
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelect(entry)}
                    className={`${rowClass(isSelected)} w-full text-left`}
                  >
                    <span aria-hidden className="w-3.5 shrink-0" />
                    <SectionName name={entry.name} selected={isSelected} />
                    <SourceBadge source={entry.source} />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
