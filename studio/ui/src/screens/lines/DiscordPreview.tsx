import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import type { Problem } from '../../lib/api'
import { readYaml, splitPath } from '../../lib/yaml'
import { type Path, pathString } from '../../lib/yamlEdit'
import { commentsAlong } from '../identity/outline'
import { type Slot, slotsFor, slotsIn } from './slots'

export interface Persona {
  name: string
  fullName: string
  world: string
}

interface DiscordPreviewProps {
  /** The lines.yml draft. */
  text: string
  /** The YAML path of the last focused field. */
  focused: string | null
  problems: Problem[]
  persona: Persona
}

function valueAt(data: unknown, path: Path): unknown {
  let node = data
  for (const part of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string | number, unknown>)[part]
  }
  return node
}

function firstLine(data: unknown, path: Path = []): Path | null {
  if (typeof data === 'string') return path
  if (Array.isArray(data)) {
    for (const [index, item] of data.entries()) {
      const found = firstLine(item, [...path, index])
      if (found) return found
    }
  } else if (data && typeof data === 'object') {
    for (const [key, item] of Object.entries(data)) {
      const found = firstLine(item, [...path, key])
      if (found) return found
    }
  }
  return null
}

function Chip({ name, tone = 'accent' }: { name: string; tone?: 'accent' | 'danger' }) {
  return (
    <span
      className={`mx-px inline-flex items-center rounded-sm px-1 font-mono text-code-sm ${
        tone === 'danger' ? 'border border-danger text-danger' : 'bg-selected text-accent-ink'
      }`}
    >
      <span className="sr-only">slot </span>
      {name}
    </span>
  )
}

/** Splits text and keys each piece by where it starts, so pieces keep stable keys while the text is edited. */
function pieces(text: string, pattern: RegExp): { key: number; part: string }[] {
  let offset = 0
  return text
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => {
      const piece = { key: offset, part }
      offset += part.length
      return piece
    })
}

function withChips(text: string): ReactNode[] {
  return pieces(text, /(\{\{[^{}]*\}\})/g).map(({ key, part }) =>
    /^\{\{[^{}]*\}\}$/.test(part) ? <Chip key={key} name={part.slice(2, -2)} /> : part
  )
}

/** Discord's own markdown, as far as these lines use it: **bold**, `-#` subtext and line breaks. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {pieces(text, /(?<=\n)/).map(({ key, part }) => {
        const line = part.replace(/\n$/, '')
        const subtext = line.startsWith('-# ')
        return (
          <p key={key} className={subtext ? 'text-small text-ink-3' : 'min-h-5'}>
            {pieces(subtext ? line.slice(3) : line, /(\*\*[^*]+\*\*)/g).map(({ key: at, part: run }) =>
              /^\*\*[^*]+\*\*$/.test(run) ? (
                <strong key={at} className="font-semibold">
                  {withChips(run.slice(2, -2))}
                </strong>
              ) : (
                <span key={at}>{withChips(run)}</span>
              )
            )}
          </p>
        )
      })}
    </>
  )
}

function Avatar({ name, size = 'size-10' }: { name: string; size?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-subtle text-body font-medium text-ink-2 ${size}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

function Message({ persona, children }: { persona: Persona; children: ReactNode }) {
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="flex gap-3">
      <Avatar name={persona.name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-body font-medium text-ink">{persona.name}</span>
          <span className="rounded-sm bg-subtle px-1 text-label text-ink-2">Bot</span>
          <span className="text-label text-ink-3">Today at {time}</span>
        </p>
        <div className="mt-1 rounded-lg rounded-tl-sm bg-subtle px-3 py-2 text-body break-words text-ink">
          {children}
        </div>
      </div>
    </div>
  )
}

function filled(text: string, persona: Persona): string {
  const fills: Record<string, string> = { char: persona.name, char_full: persona.fullName, world: persona.world }
  return text.replace(/\{\{([^{}]*)\}\}/g, (whole, name: string) => fills[name] ?? whole)
}

function Rendered({ path, value, persona }: { path: Path; value: string; persona: Persona }) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return (
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-10 rounded-md border border-line-strong" style={{ backgroundColor: value }} />
        <span className="font-mono text-code text-ink">{value}</span>
      </div>
    )
  }
  if (path[0] === 'commands') {
    const length = filled(value, persona).length
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3 rounded-md bg-subtle px-3 py-2">
          <Avatar name={persona.name} size="size-6 text-label" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-code text-ink">/{String(path[1])}</p>
            <div className="text-small break-words text-ink-2">
              <Rich text={value} />
            </div>
          </div>
          <span className="text-label text-ink-3">{persona.name}</span>
        </div>
        <p className={`text-small ${length > 100 ? 'text-danger' : 'text-ink-3'}`}>
          {length} of 100 characters once filled{length > 100 ? '; Discord refuses a longer description.' : '.'}
        </p>
      </div>
    )
  }
  if (path[0] === 'status') {
    return (
      <div className="flex items-center gap-3">
        <span className="relative">
          <Avatar name={persona.name} />
          <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface bg-success" />
        </span>
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">
            {persona.name} <span className="sr-only">is online. Status:</span>
          </p>
          <div className="text-small break-words text-ink-2">
            <Rich text={value} />
          </div>
        </div>
      </div>
    )
  }
  if (path[0] === 'footers') {
    return (
      <Message persona={persona}>
        <p className="text-ink-3 italic">The reply goes here.</p>
        <div className="text-small text-ink-3">
          <Rich text={value} />
        </div>
      </Message>
    )
  }
  return (
    <Message persona={persona}>
      <Rich text={value} />
    </Message>
  )
}

function describe(slot: Slot, persona: Persona): string {
  if (slot.source === 'static') {
    const fill = { char: persona.name, char_full: persona.fullName, world: persona.world }[slot.name]
    return `Filled from character.yml: ${fill}`
  }
  if (slot.source === 'rejected') return 'Not accepted in this line; the bot will not load it'
  return 'Filled by the bot when it posts the line'
}

const CAPTIONS: Record<string, string> = {
  commands: 'Slash command description, as the command picker shows it.',
  status: 'Discord status under the bot’s name.',
  footers: 'Footer line under a reply.'
}

/** The right column's preview of one line, with its slots as chips. */
export function DiscordPreview({ text, focused, problems, persona }: DiscordPreviewProps) {
  const data = readYaml(text)
  const wanted = focused ? splitPath(focused) : null
  const path = wanted && typeof valueAt(data, wanted) === 'string' ? wanted : firstLine(data)
  const value = path ? (valueAt(data, path) as string) : null

  if (!path || value === null) {
    return <p className="text-small text-ink-3">Focus a line in the form to preview it here.</p>
  }
  const key = pathString(path)
  const comments = commentsAlong(text, path)
  const help = comments.at(-1)
  const parent = valueAt(data, path.slice(0, -1))
  const index = path.at(-1)
  const slots =
    slotsIn(value).length > 0
      ? slotsFor(
          value,
          comments,
          problems.filter((problem) => problem.path === key)
        )
      : []
  const color = /^#[0-9a-f]{6}$/i.test(value)

  return (
    <section aria-label="Discord preview" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-section text-ink">{color ? 'Colour preview' : 'Discord preview'}</h2>
        <p className="font-mono text-code-sm break-all text-ink-3">{key}</p>
        {help && <p className="text-small text-ink-2">{help}</p>}
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <Rendered path={path} value={value} persona={persona} />
      </div>
      {CAPTIONS[String(path[0])] && <p className="text-small text-ink-3">{CAPTIONS[String(path[0])]}</p>}
      {Array.isArray(parent) && typeof index === 'number' && (
        <p className="text-small text-ink-3">
          Line {index + 1} of {parent.length} in this pool; each post draws one at random.
        </p>
      )}
      {slots.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-label text-ink-2">Slots this line accepts</h3>
          <ul className="flex flex-col gap-2">
            {slots.map((slot) => (
              <li key={slot.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
                <Chip name={slot.name} tone={slot.source === 'rejected' ? 'danger' : 'accent'} />
                <span className={`min-w-0 flex-1 ${slot.source === 'rejected' ? 'text-danger' : 'text-ink-3'}`}>
                  {describe(slot, persona)}
                </span>
                {slot.used && (
                  <Badge tone="neutral" dot={false}>
                    used
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!focused && <p className="text-small text-ink-3">Click a line in the form to preview it.</p>}
    </section>
  )
}
