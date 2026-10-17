import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TextEditor, type TextEditorHandle } from '../../components/editor/TextEditor'
import { YamlForm } from '../../components/form/YamlForm'
import { Page } from '../../components/shell/Page'
import { Tabs } from '../../components/ui/Overlay'
import type { Problem } from '../../lib/api'
import { href, navigate, useLocation } from '../../lib/router'
import type { JsonSchema } from '../../lib/schema'
import { lineForPath } from '../../lib/yaml'
import { isDirty, schemaFor, setDraft, useWorkspace } from '../../state/workspace'
import { ProblemBanner } from './ProblemBanner'
import { SectionIndex } from './SectionIndex'
import { type Section, covers, fileHeader, keyLines, outline } from './outline'
import { caretLine, revealLine } from './textarea'

export type View = 'form' | 'yaml'

export interface FormArgs {
  text: string
  onChange: (text: string) => void
  problems: Problem[]
  focusPath: string | null
  schema?: JsonSchema
}

interface PackFileScreenProps {
  title: string
  /** The pack file this screen edits, e.g. `character.yml`. */
  file: string
  /** What the file is for, after the path in the header. */
  blurb: string
  exclude?: string[]
  /** A line above the form. */
  note?: ReactNode
  /** Controls beside the Form | YAML switch, shown in the form view. */
  toolbar?: ReactNode
  /** Extra classes on the form's wrapper, for tuning YamlForm's layout to this file. */
  formClassName?: string
  /** Replaces the default `YamlForm`, e.g. to filter it. */
  renderForm?: (args: FormArgs) => ReactNode
  /** Narrows the index to what the form shows. */
  filterSections?: (sections: Section[]) => Section[]
  indexEmpty?: ReactNode
  /** Called before a `?focus=` request is honoured, so a filter can let the field show. */
  onFocusRequest?: () => void
  /** The path of the last focused field in the form. */
  onFieldFocus?: (path: string) => void
  aside: (path: string) => ReactNode
}

// Sized by the main island, not the window, so a wide sidebar does not squeeze the editor column.
const LAYOUT =
  'grid h-full min-h-0 grid-cols-1 auto-rows-[minmax(70vh,auto)] overflow-auto @[640px]:auto-rows-[minmax(0,1fr)] @[640px]:grid-cols-[minmax(0,1fr)_320px] @[640px]:overflow-hidden @[980px]:grid-cols-[232px_minmax(0,1fr)_360px] @[1120px]:grid-cols-[272px_minmax(0,1fr)_420px]'
const HEADER_OFFSET = 12
const NONE: string[] = []

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function flatten(sections: Section[]): Section[] {
  return sections.flatMap((section) => [section, ...section.children])
}

/**
 * The shared layout of the pack-file screens (Figma Editor): a section index, a Form | YAML editor with the live
 * problem banner, and a right column.
 */
export function PackFileScreen({
  title,
  file,
  blurb,
  exclude = NONE,
  note,
  toolbar,
  formClassName = '',
  renderForm,
  filterSections,
  indexEmpty,
  onFocusRequest,
  onFieldFocus,
  aside
}: PackFileScreenProps) {
  const workspace = useWorkspace()
  const location = useLocation()
  const path = `${workspace.dir}/${file}`
  const state = workspace.files[path]
  const text = state?.draft ?? ''
  const [view, setView] = useState<View>('form')
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const editorBox = useRef<HTMLDivElement>(null)
  const editor = useRef<TextEditorHandle>(null)
  const spyLock = useRef(0)
  const syncAfterSwitch = useRef<string | null>(null)

  const packProblems = useMemo(
    () => (workspace.validation && !workspace.validation.ok ? workspace.validation.problems : []),
    [workspace.validation]
  )
  const problems = useMemo(() => packProblems.filter((problem) => problem.file === path), [packProblems, path])
  const all = useMemo(() => outline(text, exclude), [text, exclude])
  const sections = useMemo(
    () => (filterSections && view === 'form' ? filterSections(all) : all),
    [all, filterSections, view]
  )
  const flat = useMemo(() => flatten(sections), [sections])
  const about = useMemo(() => fileHeader(text), [text])
  const onChange = useCallback((next: string) => setDraft(path, next), [path])

  const textarea = () => editorBox.current?.querySelector('textarea') ?? null
  const find = useCallback(
    (target: string) => scroller.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(target)}"]`) ?? null,
    []
  )

  const scrollToSection = useCallback(
    (target: string, smooth: boolean) => {
      const box = scroller.current
      const element = find(target)
      if (!box || !element) return null
      spyLock.current = Date.now() + (smooth ? 900 : 100)
      const top = box.scrollTop + element.getBoundingClientRect().top - box.getBoundingClientRect().top - HEADER_OFFSET
      box.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
      return element
    },
    [find]
  )

  const spy = useCallback(() => {
    const box = scroller.current
    if (!box || Date.now() < spyLock.current) return
    const limit = box.getBoundingClientRect().top + HEADER_OFFSET + 32
    const present = flat.map((section) => ({ section, element: find(section.path) })).filter(({ element }) => element)
    if (present.length === 0) return
    let current = present[0].section.path
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
      current = present.at(-1)?.section.path ?? current
    } else {
      let best = Number.NEGATIVE_INFINITY
      for (const { section, element } of present) {
        const top = (element as HTMLElement).getBoundingClientRect().top
        if (top <= limit && top > best) {
          best = top
          current = section.path
        }
      }
    }
    setActive(current)
  }, [flat, find])

  useEffect(() => {
    if (view !== 'form') return
    const box = scroller.current
    if (!box) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(spy)
    }
    const onEnd = () => {
      spyLock.current = 0
      spy()
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    box.addEventListener('scrollend', onEnd)
    frame = requestAnimationFrame(spy)
    return () => {
      cancelAnimationFrame(frame)
      box.removeEventListener('scroll', onScroll)
      box.removeEventListener('scrollend', onEnd)
    }
  }, [view, spy])

  const lines = useMemo(() => {
    const found = keyLines(text, sections)
    return flat.map((section) => ({ path: section.path, line: found.get(section.path) ?? 0 }))
  }, [flat, sections, text])
  const spyCaret = () => {
    const area = textarea()
    if (!area) return
    const line = caretLine(area)
    const hit = lines.filter((entry) => entry.line > 0 && entry.line <= line).at(-1)
    setActive(hit?.path ?? lines[0]?.path ?? null)
  }

  const revealInEditor = (target: string, caret: boolean) => {
    const area = textarea()
    const line = lines.find((entry) => entry.path === target)?.line
    if (area && line) revealLine(area, line, caret)
  }

  const select = (target: string, keyboard: boolean) => {
    setActive(target)
    if (view === 'yaml') return revealInEditor(target, true)
    // A keyboard jump is instant, so focus can follow without cutting a smooth scroll short.
    const element = scrollToSection(target, !keyboard)
    if (!keyboard) return
    const control =
      element?.querySelector<HTMLElement>('input, textarea') ?? element?.querySelector<HTMLElement>('button')
    control?.focus({ preventScroll: true })
  }

  const switchView = (next: View) => {
    syncAfterSwitch.current = active
    setView(next)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a view switch should move the scroll position
  useEffect(() => {
    const target = syncAfterSwitch.current
    syncAfterSwitch.current = null
    if (!target) return
    if (view === 'form') scrollToSection(target, false)
    else revealInEditor(target, false)
  }, [view])

  const goToLine = (line: number) => {
    editor.current?.goToLine(line)
    const area = textarea()
    if (area) revealLine(area, line, false)
    spyCaret()
  }

  const focusParam = location.search.get('focus')
  const fileParam = location.search.get('file')
  // biome-ignore lint/correctness/useExhaustiveDependencies: a focus request is handled once, when it arrives
  useEffect(() => {
    if (!focusParam || fileParam !== path) return
    onFocusRequest?.()
    if (view === 'yaml') {
      const line = lineForPath(text, focusParam)
      if (line) requestAnimationFrame(() => goToLine(line))
    } else {
      spyLock.current = Date.now() + 900
      setFocusPath(focusParam)
      setActive(flat.filter((section) => covers(section.path, focusParam)).at(-1)?.path ?? null)
    }
    const tab = location.search.get('tab')
    navigate(`${href(location.route, location.rest)}${tab ? `?tab=${tab}` : ''}`, { replace: true })
  }, [focusParam, fileParam, path])

  useEffect(() => {
    if (!focusPath) return
    const timer = setTimeout(() => setFocusPath(null), 1800)
    return () => clearTimeout(timer)
  }, [focusPath])

  const args: FormArgs = { text, onChange, problems, focusPath, schema: schemaFor(path) }

  return (
    <Page
      title={title}
      subtitle={
        <>
          <span className="font-mono text-code-sm">{path}</span> · {blurb}
        </>
      }
    >
      <div className="@container h-full">
        <div className={LAYOUT}>
          <SectionIndex
            sections={sections}
            active={active}
            problems={problems}
            about={about}
            empty={indexEmpty}
            onSelect={select}
          />
          <section aria-label={`${file} editor`} className="flex min-h-0 min-w-0 flex-col">
            <div className="flex flex-col gap-3 px-6 pt-5 pb-3">
              <ProblemBanner problems={packProblems} path={path} text={text} mode={view} onGoToLine={goToLine} />
              <div className="flex flex-wrap items-center gap-3">
                <Tabs
                  label="Edit as"
                  value={view}
                  onValue={switchView}
                  options={[
                    { value: 'form', label: 'Form' },
                    { value: 'yaml', label: 'YAML' }
                  ]}
                />
                {view === 'form' && toolbar}
                {view === 'form' && (
                  <span className="ml-auto min-w-0 truncate font-mono text-code-sm text-ink-3">
                    {file}
                    {state && isDirty(state) ? ' · edited' : ''}
                  </span>
                )}
              </div>
              {view === 'form' && note}
            </div>
            {!state ? (
              <p role="alert" className="mx-6 rounded-lg border border-danger px-4 py-3 text-small text-danger">
                This pack has no {file}. Add it to {workspace.dir} and reload the studio.
              </p>
            ) : view === 'form' ? (
              <div
                ref={scroller}
                role="tabpanel"
                aria-label="Form"
                onFocus={(event) => {
                  const target = (event.target as HTMLElement).closest('[data-path]')?.getAttribute('data-path')
                  if (target) onFieldFocus?.(target)
                }}
                className={`min-h-0 flex-1 overflow-auto px-6 pt-1 pb-6 ${formClassName}`}
              >
                {renderForm ? (
                  renderForm(args)
                ) : (
                  <YamlForm
                    text={text}
                    onChange={onChange}
                    schema={args.schema}
                    exclude={exclude}
                    problems={problems}
                    focusPath={focusPath}
                  />
                )}
              </div>
            ) : (
              <div
                ref={editorBox}
                role="tabpanel"
                aria-label="YAML"
                onKeyUp={spyCaret}
                onMouseUp={spyCaret}
                className="flex min-h-0 flex-1 flex-col px-6 pb-5"
              >
                <TextEditor
                  ref={editor}
                  path={path}
                  value={text}
                  onChange={onChange}
                  edited={isDirty(state)}
                  locked={state.locked}
                  invalid={problems.length > 0}
                  label={`${file} source`}
                />
              </div>
            )}
          </section>
          {aside(path)}
        </div>
      </div>
    </Page>
  )
}
