import type { ReactNode } from 'react'
import type { Problem } from '../../lib/api'
import { type Section, covers, problemsUnder } from './outline'

interface SectionIndexProps {
  sections: Section[]
  active: string | null
  problems: Problem[]
  /** The file's opening comment, shown under the list. */
  about?: string
  empty?: ReactNode
  /** `keyboard` is true when the row was activated with a key, so focus can follow into the section. */
  onSelect: (path: string, keyboard: boolean) => void
}

function Row({
  section,
  current,
  within,
  problems,
  nested,
  onSelect
}: {
  section: Section
  current: boolean
  within: boolean
  problems: number
  nested?: boolean
  onSelect: SectionIndexProps['onSelect']
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'location' : undefined}
      onClick={(event) => onSelect(section.path, event.detail === 0)}
      className={`flex w-full items-center gap-2 rounded-md px-2 text-left font-mono text-code-sm transition-colors duration-150 ${
        nested ? 'h-[30px]' : 'h-[34px]'
      } ${
        current
          ? 'bg-selected font-medium text-accent-ink'
          : within
            ? 'text-ink hover:bg-subtle'
            : 'text-ink-2 hover:bg-subtle hover:text-ink'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{section.key}</span>
      {problems > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-danger px-1 font-sans text-label text-danger">
          {problems}
          <span className="sr-only"> {problems === 1 ? 'error' : 'errors'}</span>
        </span>
      )}
    </button>
  )
}

/** The left column: the file's top-level keys as anchors, with the current one highlighted as the editor scrolls. */
export function SectionIndex({ sections, active, problems, about, empty, onSelect }: SectionIndexProps) {
  return (
    <nav
      aria-label="On this page"
      className="hidden min-h-0 flex-col gap-3 overflow-auto border-r border-line p-4 @[980px]:flex"
    >
      <h2 className="text-section text-ink">On this page</h2>
      {sections.length === 0 ? (
        empty
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sections.map((section) => {
            const within = covers(section.path, active)
            return (
              <li key={section.path} className="flex flex-col gap-0.5">
                <Row
                  section={section}
                  current={active === section.path}
                  within={within}
                  problems={problemsUnder(problems, section.path)}
                  onSelect={onSelect}
                />
                {within && section.children.length > 0 && (
                  <ul className="ml-3 flex flex-col gap-0.5 border-l border-line pl-2">
                    {section.children.map((child) => (
                      <li key={child.path}>
                        <Row
                          section={child}
                          current={covers(child.path, active)}
                          within={false}
                          problems={problemsUnder(problems, child.path)}
                          nested
                          onSelect={onSelect}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {about && <p className="mt-2 border-t border-line pt-3 text-small text-ink-3">{about}</p>}
    </nav>
  )
}
