import { Search, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { YamlForm } from '../components/form/YamlForm'
import { fieldClass } from '../components/ui/Field'
import { readYaml } from '../lib/yaml'
import { useWorkspace } from '../state/workspace'
import { type FormArgs, PackFileScreen } from './identity/PackFileScreen'
import type { Section } from './identity/outline'
import { LinesAside } from './lines/LinesAside'
import { LinesResults } from './lines/LinesResults'
import { searchLines } from './lines/search'

// Lines are sentences, so each one gets the full width instead of YamlForm's two columns or grid of short values.
const FULL_WIDTH = '[&_.grid]:grid-cols-1 [&_[data-path^=status]>.grid]:grid-cols-2'

export default function LinesScreen() {
  const workspace = useWorkspace()
  const path = `${workspace.dir}/lines.yml`
  const text = workspace.files[path]?.draft ?? ''
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const searching = query.trim() !== ''
  const matches = useMemo(() => (searching ? searchLines(readYaml(text), query) : []), [text, query, searching])
  const problems = useMemo(
    () =>
      workspace.validation && !workspace.validation.ok
        ? workspace.validation.problems.filter((problem) => problem.file === path)
        : [],
    [workspace.validation, path]
  )

  const filterSections = useCallback(
    (sections: Section[]) =>
      searching
        ? matches.flatMap(({ group, keys }) => {
            const section = sections.find((entry) => entry.key === group)
            if (!section) return []
            return [
              {
                ...section,
                children: keys ? section.children.filter((child) => keys.includes(child.key)) : section.children
              }
            ]
          })
        : sections,
    [searching, matches]
  )

  const renderForm = useCallback(
    ({ text: draft, onChange, problems: own, focusPath, schema }: FormArgs) =>
      searching ? (
        <LinesResults text={draft} onChange={onChange} problems={own} query={query} matches={matches} schema={schema} />
      ) : (
        <YamlForm text={draft} onChange={onChange} problems={own} focusPath={focusPath} schema={schema} />
      ),
    [searching, query, matches]
  )

  const count = matches.length
  const search = (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3"
      />
      <input
        ref={input}
        type="search"
        aria-label="Search lines"
        placeholder="Search lines by key or text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault()
            setQuery('')
          }
        }}
        className={`${fieldClass(false)} !font-sans !text-body pl-8 ${query ? 'pr-9' : ''} [&::-webkit-search-cancel-button]:hidden`}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            setQuery('')
            // The button goes with the query, so focus would fall to the page.
            input.current?.focus()
          }}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-ink-3 hover:bg-subtle hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
      <span role="status" className="sr-only">
        {searching
          ? count === 0
            ? `No line matches ${query.trim()}`
            : `${count} ${count === 1 ? 'group matches' : 'groups match'}`
          : ''}
      </span>
    </div>
  )

  return (
    <PackFileScreen
      title="Lines"
      file="lines.yml"
      blurb="what the bot posts outside replies"
      note={search}
      formClassName={FULL_WIDTH}
      renderForm={renderForm}
      filterSections={filterSections}
      indexEmpty={<p className="text-small text-ink-3">No section matches.</p>}
      onFocusRequest={() => setQuery('')}
      onFieldFocus={setFocused}
      aside={(file) => <LinesAside file={file} focused={focused} problems={problems} />}
    />
  )
}
