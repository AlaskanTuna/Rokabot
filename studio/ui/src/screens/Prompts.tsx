import { CopyPlus, FilePlus2, Lock, Plus, Undo2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PreviewPanel } from '../components/editor/PreviewPanel'
import { TextEditor, type TextEditorHandle } from '../components/editor/TextEditor'
import { Page } from '../components/shell/Page'
import { Button } from '../components/ui/Button'
import type { Problem } from '../lib/api'
import { href, navigate, useLocation } from '../lib/router'
import { currentProblems, fileName, isDirty, setDraft, useWorkspace } from '../state/workspace'
import { Columns } from './prompts/Columns'
import { ProblemBanner } from './prompts/ProblemBanner'
import { SectionList } from './prompts/SectionList'
import {
  type PromptEntry,
  characterPath,
  entryKey,
  entryRest,
  exists,
  harnessPrompt,
  otherPrompts,
  ownPrompt,
  resolvePrompt,
  systemOrder,
  titleFor
} from './prompts/model'
import { setStringList } from './prompts/yamlText'

const SYSTEM: (string | number)[] = ['prompt', 'system']

export default function PromptsScreen() {
  const workspace = useWorkspace()
  const location = useLocation()
  const editor = useRef<TextEditorHandle>(null)
  const focusEditor = useRef(false)
  useEffect(() => {
    if (!focusEditor.current || !editor.current) return
    focusEditor.current = false
    editor.current.focus()
  })
  const character = characterPath(workspace)
  const names = systemOrder(workspace)
  const order = (names ?? []).map((name) => resolvePrompt(workspace, name, true))
  const others = otherPrompts(workspace, order)
  const entries = [...order, ...others]
  const ambiguous = (entry: PromptEntry) => entries.filter((other) => entryRest(other) === entryRest(entry)).length > 1

  const fileParam = location.search.get('file')
  const selected =
    entries.find((entry) => fileParam !== null && entry.path === fileParam) ??
    entries.find((entry) => entryRest(entry) === location.rest) ??
    entries[0] ??
    null

  const urlFor = (entry: PromptEntry) =>
    href('prompts', entryRest(entry)) +
    (ambiguous(entry) && entry.path ? `?file=${encodeURIComponent(entry.path)}` : '')

  useEffect(() => {
    // A bare /prompts shows the first file and keeps its address; only a stale or unknown file name is corrected.
    if (!selected || location.rest === entryRest(selected) || (!location.rest && fileParam === null)) return
    const search = new URLSearchParams(location.search)
    if (ambiguous(selected) && selected.path) search.set('file', selected.path)
    const query = search.toString()
    navigate(`${href('prompts', entryRest(selected))}${query ? `?${query}` : ''}`, { replace: true })
  })

  const setOrder = (next: string[]) => {
    const text = workspace.files[character]?.draft
    if (text) setDraft(character, setStringList(text, SYSTEM, next))
  }

  const addSection = (name: string): string | null => {
    if (!names) return 'Fix character.yml first.'
    const own = ownPrompt(workspace, name)
    if (!exists(workspace, own) && !exists(workspace, harnessPrompt(workspace, name))) {
      setDraft(own, `## ${titleFor(name)}\n\n`)
    }
    setOrder([...names, name])
    navigate(href('prompts', `${name}.md`))
    return null
  }

  const onGo = (problem: Problem): boolean => {
    if (selected?.path && problem.file === selected.path) {
      editor.current?.focus()
      return true
    }
    const index = problem.file === character ? /^prompt\.system\[(\d+)\]/.exec(problem.path ?? '')?.[1] : undefined
    const target = index !== undefined ? order[Number(index)] : entries.find((entry) => entry.path === problem.file)
    if (!target) return false
    focusEditor.current = target.path !== null && problem.file === target.path
    navigate(urlFor(target))
    return true
  }

  const summary = workspace.validation?.ok ? workspace.validation.summary : null
  const file = selected?.path ? workspace.files[selected.path] : undefined
  const fileProblems = currentProblems(workspace).filter((problem) => selected?.path && problem.file === selected.path)

  const override = (entry: PromptEntry) => {
    if (!entry.path) return
    setDraft(ownPrompt(workspace, entry.name), workspace.files[entry.path]?.draft ?? '')
    navigate(href('prompts', entryRest(entry)))
  }

  return (
    <Page
      title="Prompts"
      subtitle={`${workspace.dir}/prompts · ${order.length} ${order.length === 1 ? 'section' : 'sections'} in the cached prefix`}
    >
      <Columns
        listLabel="Prompt files"
        list={
          <SectionList
            order={order}
            others={others}
            readable={names !== null}
            selected={selected ? entryKey(selected) : null}
            tokens={summary?.stableTokens.full ?? null}
            onSelect={(entry) => navigate(urlFor(entry))}
            onOrder={setOrder}
            onAdd={addSection}
          />
        }
        editor={
          <>
            <ProblemBanner
              screen="prompts"
              here={(problem) =>
                (selected?.path != null && problem.file === selected.path) ||
                (problem.file === character && Boolean(problem.path?.startsWith('prompt.')))
              }
              onGo={onGo}
            />
            {selected && (
              <EntryNote
                entry={selected}
                canOrder={names !== null}
                blocked={Boolean(selected.overrides && workspace.files[selected.overrides]?.locked)}
                onOverride={() => override(selected)}
                onUseHarness={() => selected.path && setDraft(selected.path, null)}
                onAddToOrder={() => names && setOrder([...names, selected.name])}
              />
            )}
            {selected?.path && file && file.draft !== null ? (
              <TextEditor
                ref={editor}
                path={selected.path}
                label={`${selected.name} prompt`}
                value={file.draft}
                onChange={(text) => setDraft(selected.path as string, text)}
                edited={isDirty(file)}
                locked={file.locked}
                invalid={fileProblems.length > 0}
              />
            ) : selected ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-5">
                <p className="text-body text-ink-2">
                  No file for <span className="font-mono text-code">{selected.name}</span>. The bot looks for{' '}
                  <span className="font-mono text-code-sm">prompts/{selected.name}.md</span> in this pack, then in the
                  harness.
                </p>
                <Button
                  icon={FilePlus2}
                  onClick={() => setDraft(ownPrompt(workspace, selected.name), `## ${titleFor(selected.name)}\n\n`)}
                >
                  Create prompts/{selected.name}.md
                </Button>
              </div>
            ) : (
              <p className="text-body text-ink-3">This pack has no prompt sections yet. Add one on the left.</p>
            )}
          </>
        }
        preview={<PreviewPanel file={selected?.path ?? undefined} sourceLabel="Markdown" />}
      />
    </Page>
  )
}

interface EntryNoteProps {
  entry: PromptEntry
  canOrder: boolean
  /** The pack file has the name of a locked harness prompt, which stops the pack from loading. */
  blocked: boolean
  onOverride: () => void
  onUseHarness: () => void
  onAddToOrder: () => void
}

/** What kind of file the editor shows, and the action that changes where it comes from. */
function EntryNote({ entry, canOrder, blocked, onOverride, onUseHarness, onAddToOrder }: EntryNoteProps) {
  if (entry.source === 'locked') {
    return (
      <p className="flex items-center gap-2 text-small text-ink-3">
        <Lock aria-hidden className="size-3.5 shrink-0 text-warning" />
        Packs cannot change safety sections, so every pack uses this text as written.
      </p>
    )
  }
  if (entry.source === 'harness') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-3">
          Harness prompt: shared by every pack. Edits here change all of them.
        </p>
        <Button icon={CopyPlus} onClick={onOverride}>
          Override in this pack
        </Button>
      </div>
    )
  }
  if (entry.source === 'pack' && (entry.overrides || !entry.inOrder)) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink-3">
          {blocked
            ? `The harness locks ${fileName(entry.overrides ?? '')}, so this pack cannot have its own. Delete this file.`
            : entry.overrides
              ? `This pack's file replaces the harness ${fileName(entry.overrides)}.`
              : 'Not in the system prompt order, so it is not part of the cached prefix.'}
        </p>
        {entry.overrides ? (
          <Button
            variant="ghost"
            icon={Undo2}
            title={`Delete this pack's ${fileName(entry.path ?? '')} and use the harness file`}
            onClick={onUseHarness}
          >
            {blocked ? 'Delete file' : 'Use harness version'}
          </Button>
        ) : (
          <Button variant="ghost" icon={Plus} disabled={!canOrder} onClick={onAddToOrder}>
            Add to order
          </Button>
        )}
      </div>
    )
  }
  return null
}
