import { FilePlus2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PreviewPanel } from '../components/editor/PreviewPanel'
import { TextEditor, type TextEditorHandle } from '../components/editor/TextEditor'
import { YamlForm } from '../components/form/YamlForm'
import { Page } from '../components/shell/Page'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Overlay'
import type { Problem } from '../lib/api'
import { href, navigate, useLocation } from '../lib/router'
import { readYaml } from '../lib/yaml'
import { notifications } from '../state/notifications'
import { currentProblems, fileName, isDirty, schemaFor, setDraft, useWorkspace } from '../state/workspace'
import { MoodList } from './moods/MoodList'
import {
  type View,
  addMoodText,
  dependents,
  moodKeys,
  moodPrompt,
  moodTemplate,
  moodsPath,
  readMoods,
  removeBlocker,
  removeMoodText,
  rolesOf,
  viewFrom
} from './moods/model'
import { Columns } from './prompts/Columns'
import { ProblemBanner } from './prompts/ProblemBanner'

const RULE_KEYS = ['default', 'safe', 'lateNight', 'detection']
const SHARED_KEYS = ['moodPairs', 'portraitUrls']

function viewHref(view: View): string {
  if (view.kind === 'mood') return href('moods', view.key)
  return view.kind === 'shared' ? '/moods?view=shared' : '/moods'
}

const inMood = (path: string | null, key: string) =>
  path === `moods.${key}` || Boolean(path?.startsWith(`moods.${key}.`))

export default function MoodsScreen() {
  const workspace = useWorkspace()
  const location = useLocation()
  const editor = useRef<TextEditorHandle>(null)
  const focusEditor = useRef(false)
  useEffect(() => {
    if (!focusEditor.current || !editor.current) return
    focusEditor.current = false
    editor.current.focus()
  })
  const [removing, setRemoving] = useState<string | null>(null)
  const path = moodsPath(workspace)
  const text = workspace.files[path]?.draft ?? ''
  const data = readMoods(workspace)
  const keys = moodKeys(data)
  const view = viewFrom(location, workspace, data)
  const problems = currentProblems(workspace)
  const moodsProblems = problems.filter((problem) => problem.file === path)
  const focus =
    location.search.get('file') === path || !location.search.get('file') ? location.search.get('focus') : null
  const prompt = view.kind === 'mood' ? moodPrompt(workspace, data, view.key) : null
  const promptFile = prompt?.exists ? workspace.files[prompt.path] : undefined
  const character = readYaml(workspace.files[`${workspace.dir}/character.yml`]?.draft) as { name?: string } | undefined
  const summary = workspace.validation?.ok ? workspace.validation.summary : null

  useEffect(() => {
    const want = view.kind === 'mood' ? view.key : ''
    if (location.rest === want) return
    const query = location.search.toString()
    navigate(`${href('moods', want || undefined)}${query ? `?${query}` : ''}`, { replace: true })
  })

  const ruleProblem = (problem: Problem) =>
    problem.file === path &&
    Boolean(problem.path) &&
    RULE_KEYS.some(
      (key) => problem.path === key || problem.path?.startsWith(`${key}.`) || problem.path?.startsWith(`${key}[`)
    )
  const sharedProblem = (problem: Problem) =>
    problem.file === path && SHARED_KEYS.some((key) => problem.path === key || problem.path?.startsWith(`${key}.`))
  const moodProblem = (key: string) => (problem: Problem) =>
    (problem.file === path && inMood(problem.path, key)) || problem.file === moodPrompt(workspace, data, key).path

  const here = (problem: Problem) => {
    if (view.kind === 'mood') return moodProblem(view.key)(problem)
    return view.kind === 'shared' ? sharedProblem(problem) : ruleProblem(problem)
  }

  const onGo = (problem: Problem): boolean => {
    if (prompt && problem.file === prompt.path) {
      editor.current?.focus()
      return true
    }
    if (problem.file !== path || !problem.path) {
      const key = keys.find((candidate) => moodPrompt(workspace, data, candidate).path === problem.file)
      if (!key) return false
      focusEditor.current = true
      navigate(href('moods', key))
      return true
    }
    const query = `?focus=${encodeURIComponent(problem.path)}&file=${encodeURIComponent(path)}`
    const key = /^moods\.([^.[\]]+)/.exec(problem.path)?.[1]
    navigate(key && keys.includes(key) ? href('moods', key) + query : `/moods${query}`)
    return true
  }

  const addMood = (name: string) => {
    const voice = readYaml(workspace.files[`${workspace.dir}/voice.yml`]?.draft) as
      | { faces?: Record<string, unknown> }
      | undefined
    setDraft(path, addMoodText(text, data, name, Object.keys(voice?.faces ?? {})))
    const target = moodPrompt(workspace, { ...data, moods: { ...data?.moods, [name]: {} } }, name)
    if (!target.exists) setDraft(target.path, moodTemplate(name, character?.name || summary?.name || 'the character'))
    navigate(href('moods', name))
  }

  const removeMood = (key: string) => {
    const target = moodPrompt(workspace, data, key)
    const shared = keys.some((other) => other !== key && moodPrompt(workspace, data, other).path === target.path)
    setDraft(path, removeMoodText(text, data, key))
    if (target.exists && target.path.startsWith(`${workspace.dir}/prompts/moods/`) && !shared)
      setDraft(target.path, null)
    setRemoving(null)
    navigate(data?.default && data.default !== key ? href('moods', data.default) : '/moods')
    notifications.toast({
      tone: 'success',
      title: `Removed the ${key} mood`,
      body: 'Save to apply it, or Discard to bring the mood back.'
    })
  }

  const rows = keys.map((key) => {
    const color = data?.moods?.[key]?.color
    return {
      key,
      color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
      roles: rolesOf(data, key),
      broken: problems.some(moodProblem(key))
    }
  })

  const removingDeps = removing ? dependents(data, removing) : null
  const removingPrompt = removing ? moodPrompt(workspace, data, removing) : null

  return (
    <Page title="Moods" subtitle={`${path} · ${keys.length} ${keys.length === 1 ? 'mood' : 'moods'}`}>
      <Columns
        listLabel="Moods"
        list={
          <MoodList
            rows={rows}
            rules={Array.isArray(data?.detection) ? data.detection.length : 0}
            view={view}
            readable={data !== null}
            rulesBroken={problems.some(ruleProblem)}
            sharedBroken={problems.some(sharedProblem)}
            onView={(next) => navigate(viewHref(next))}
            onAdd={addMood}
          />
        }
        editor={
          <>
            <ProblemBanner screen="moods" here={here} onGo={onGo} />
            {data === null ? (
              <TextEditor
                path={path}
                label="moods.yml"
                value={text}
                onChange={(next) => setDraft(path, next)}
                edited={isDirty(workspace.files[path])}
                invalid
              />
            ) : view.kind === 'mood' && prompt ? (
              <>
                <MoodHeader
                  name={view.key}
                  roles={rolesOf(data, view.key)}
                  blocker={removeBlocker(workspace, data, view.key)}
                  onRemove={() => setRemoving(view.key)}
                />
                {promptFile && promptFile.draft !== null ? (
                  <div className="flex h-[max(360px,44vh)] min-h-0 shrink-0 flex-col">
                    <TextEditor
                      ref={editor}
                      path={prompt.path}
                      label={`${view.key} mood prompt`}
                      value={promptFile.draft}
                      onChange={(next) => setDraft(prompt.path, next)}
                      edited={isDirty(promptFile)}
                      locked={promptFile.locked}
                      invalid={problems.some((problem) => problem.file === prompt.path)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-5">
                    <p className="text-body text-ink-2">
                      No prompt file for this mood. The bot looks for{' '}
                      <span className="font-mono text-code-sm">{fileName(prompt.path)}</span> under{' '}
                      <span className="font-mono text-code-sm">prompts/</span> in this pack, then in the harness.
                    </p>
                    <Button
                      icon={FilePlus2}
                      onClick={() =>
                        setDraft(
                          prompt.path,
                          moodTemplate(view.key, character?.name || summary?.name || 'the character')
                        )
                      }
                    >
                      Create {fileName(prompt.path)}
                    </Button>
                  </div>
                )}
                <h3 className="mt-3 text-section text-ink">
                  Settings{' '}
                  <span className="font-mono text-code-sm font-normal text-ink-3">moods.yml › moods.{view.key}</span>
                </h3>
                <YamlForm
                  text={text}
                  onChange={(next) => setDraft(path, next)}
                  root={['moods', view.key]}
                  schema={schemaFor(path)}
                  level={4}
                  problems={moodsProblems}
                  focusPath={focus}
                />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-section text-ink">
                    {view.kind === 'shared' ? 'Pairs and portraits' : 'Detection rules'}
                  </h2>
                  <p className="max-w-[72ch] text-small text-ink-3">
                    {view.kind === 'shared'
                      ? 'Season titles for a dominant:runner-up pair of moods in /stats, and the image for each portrait a mood names.'
                      : 'Which mood a reply uses. The first rule with enough pattern matches in the last three messages wins; the default mood applies when none does.'}
                  </p>
                </div>
                <YamlForm
                  text={text}
                  onChange={(next) => setDraft(path, next)}
                  order={view.kind === 'shared' ? SHARED_KEYS : RULE_KEYS}
                  only
                  schema={schemaFor(path)}
                  level={3}
                  problems={moodsProblems}
                  focusPath={focus}
                />
              </>
            )}
          </>
        }
        preview={
          <PreviewPanel
            file={prompt?.exists ? prompt.path : path}
            sourceLabel={prompt?.exists ? 'Markdown' : 'YAML'}
            initialMood={view.kind === 'mood' ? view.key : ''}
          />
        }
      />
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove the ${removing ?? ''} mood?`}
        actions={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button variant="danger" icon={Trash2} onClick={() => removing && removeMood(removing)}>
              Remove mood
            </Button>
          </>
        }
      >
        <p>
          This removes its moods.yml entry
          {removingDeps && removingDeps.rules.length > 0
            ? `, ${removingDeps.rules.length} detection ${removingDeps.rules.length === 1 ? 'rule' : 'rules'}`
            : ''}
          {removingDeps && removingDeps.pairs.length > 0
            ? `, ${removingDeps.pairs.length} season ${removingDeps.pairs.length === 1 ? 'title' : 'titles'}`
            : ''}
          {removingPrompt?.exists && removingPrompt.path.startsWith(`${workspace.dir}/prompts/moods/`)
            ? ` and ${fileName(removingPrompt.path)}`
            : ''}
          . Nothing changes on disk until you save.
        </p>
      </Dialog>
    </Page>
  )
}

function MoodHeader({
  name,
  roles,
  blocker,
  onRemove
}: {
  name: string
  roles: string[]
  blocker: string | null
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-section text-ink">{name}</h2>
        {roles.map((role) => (
          <Badge key={role}>{role}</Badge>
        ))}
        <span className="flex-1" />
        <Button
          variant="ghost"
          icon={Trash2}
          disabled={blocker !== null}
          title={blocker ?? `Remove the ${name} mood`}
          onClick={onRemove}
        >
          Remove mood
        </Button>
      </div>
      {blocker && <p className="text-small text-ink-3">{blocker}</p>}
    </div>
  )
}
