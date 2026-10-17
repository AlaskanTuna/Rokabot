import { useSyncExternalStore } from 'react'
import { ApiError, type Pack, type Problem, type Validation, api } from '../lib/api'
import { type Route, href, navigate } from '../lib/router'
import type { JsonSchema } from '../lib/schema'
import { copyText, notifications } from './notifications'

export interface FileState {
  kind: 'pack' | 'harness'
  locked: boolean
  /** null: a file this session created that is not on disk yet. */
  saved: string | null
  /** null: marked for deletion. */
  draft: string | null
}

export type Status = 'loading' | 'ready' | 'no-pack' | 'no-token' | 'error'

export interface WorkspaceState {
  status: Status
  loadError: string | null
  noPack: { configured: string; candidates: string[] } | null
  dir: string
  harnessDir: string
  candidates: string[]
  files: Record<string, FileState>
  config: { path: string; saved: string; draft: string } | null
  /** The last check of the saved pack, or of the drafts while there are unsaved edits. */
  validation: Validation | null
  configProblem: Problem | null
  checking: boolean
  checkedAt: number | null
  saving: boolean
  /** JSON Schema per pack YAML file name, e.g. `voice.yml`. */
  schemas: Record<string, JsonSchema>
}

const initial: WorkspaceState = {
  status: 'loading',
  loadError: null,
  noPack: null,
  dir: '',
  harnessDir: '',
  candidates: [],
  files: {},
  config: null,
  validation: null,
  configProblem: null,
  checking: false,
  checkedAt: null,
  saving: false,
  schemas: {}
}

let state = initial
const listeners = new Set<() => void>()

function set(patch: Partial<WorkspaceState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
}

export function getWorkspace(): WorkspaceState {
  return state
}

export const RESTART_COMMAND = 'docker compose restart roka'

export function isDirty(file: FileState): boolean {
  return file.draft !== file.saved
}

export function dirtyPaths(current: WorkspaceState = state): string[] {
  const paths = Object.entries(current.files)
    .filter(([, file]) => isDirty(file))
    .map(([path]) => path)
  if (current.config && current.config.draft !== current.config.saved) paths.push(current.config.path)
  return paths
}

/** The JSON Schema for a pack YAML file, so forms know which maps take entries and what a new item looks like. */
export function schemaFor(path: string, current: WorkspaceState = state): JsonSchema | undefined {
  return path.startsWith(`${current.dir}/`) ? current.schemas[fileName(path)] : undefined
}

export function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

/** The screen that edits a file, and the part of the URL after it. */
export function routeFor(path: string, problemPath?: string | null): { route: Route; rest?: string } {
  if (state.config && path === state.config.path) return { route: configRoute(problemPath ?? '') }
  const name = fileName(path)
  if (path.startsWith(`${state.dir}/`)) {
    if (name === 'character.yml') return { route: 'identity' }
    if (name === 'voice.yml') return { route: 'voice' }
    if (name === 'lines.yml') return { route: 'lines' }
    if (name === 'moods.yml') return { route: 'moods' }
    if (path.startsWith(`${state.dir}/prompts/moods/`)) return { route: 'moods', rest: name }
  }
  return { route: 'prompts', rest: name }
}

const CONFIG_ROUTES: [RegExp, Route][] = [
  [/^(llm|gemini|fallback|jev)(\.|$)/, 'models'],
  [/^(memory|embeddings|session)(\.|$)/, 'memory'],
  [/^(rateLimit)(\.|$)/, 'limits']
]

export function configRoute(key: string): Route {
  if (/^llm\.(monthlyBudgetUsd|modelscopeDailyMagicubes)/.test(key)) return 'limits'
  return CONFIG_ROUTES.find(([pattern]) => pattern.test(key))?.[1] ?? 'discord'
}

/** A config key named in a message such as "… (llm.main uses …)", for errors that carry no path. */
function keyInMessage(message: string): string | null {
  return (
    /\b((?:llm|gemini|fallback|jev|memory|embeddings|session|rateLimit|discord|media)(?:\.[\w-]+)+)/.exec(
      message
    )?.[1] ?? null
  )
}

export function goToProblem(problem: Problem): void {
  const file = problem.file ?? state.config?.path ?? ''
  if (!problem.path && /environment variable/i.test(problem.message) && !keyInMessage(problem.message)) {
    navigate(href('secrets'))
    return
  }
  const target = routeFor(file, problem.path ?? keyInMessage(problem.message))
  const focus = problem.path ? `?focus=${encodeURIComponent(problem.path)}&file=${encodeURIComponent(file)}` : ''
  navigate(href(target.route, target.rest) + focus)
}

/** A problem as one line: `file › path: message`. */
export function problemLine(problem: Problem): string {
  const where = [problem.file && fileName(problem.file), problem.path].filter(Boolean).join(' › ')
  return where ? `${where}: ${problem.message}` : problem.message
}

export function setNoToken(): void {
  set({ status: 'no-token' })
}

export async function load(): Promise<void> {
  set({ status: 'loading', loadError: null })
  try {
    const [pack, config, schemas] = await Promise.all([
      api.pack(),
      api.config(),
      api.schema().catch(() => ({}) as Record<string, unknown>)
    ])
    applyPack(pack)
    set({
      status: 'ready',
      config: { path: config.path, saved: config.text, draft: config.text },
      schemas: schemas as Record<string, JsonSchema>,
      configProblem: null,
      checkedAt: Date.now()
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return set({ status: 'no-token' })
    if (error instanceof ApiError && error.code === 'no_pack') {
      const body = error.body as { configured?: string; candidates?: string[] }
      return set({
        status: 'no-pack',
        noPack: { configured: body.configured ?? '', candidates: body.candidates ?? [] }
      })
    }
    set({ status: 'error', loadError: (error as Error).message })
  }
}

function applyPack(pack: Pack): void {
  const files: Record<string, FileState> = {}
  for (const file of pack.files) {
    files[file.path] = { kind: file.kind, locked: file.locked, saved: file.text, draft: file.text }
  }
  set({
    dir: pack.dir,
    harnessDir: pack.harnessDir,
    candidates: pack.candidates ?? [],
    files,
    validation: pack.validation
  })
}

let validateTimer: ReturnType<typeof setTimeout> | undefined
let validateRun = 0
let lastDirtyKey = ''

function afterEdit(): void {
  const dirty = dirtyPaths()
  const key = dirty.join('\n')
  if (key !== lastDirtyKey) {
    lastDirtyKey = key
    if (dirty.length === 0) notifications.removeKey('unsaved')
    else {
      const names = dirty.map(fileName)
      notifications.notify({
        key: 'unsaved',
        tone: 'warning',
        title: 'Unsaved changes',
        body:
          names.length === 1
            ? `${names[0]} has edits since your last save.`
            : `${names.length} files have edits since your last save: ${names.join(', ')}.`,
        actions: [
          { label: 'Save now', primary: true, run: () => void save() },
          {
            label: 'Review diff',
            run: () => {
              const target = routeFor(dirty[0])
              navigate(`${href(target.route, target.rest)}?tab=diff&file=${encodeURIComponent(dirty[0])}`)
            }
          }
        ]
      })
    }
  }
  clearTimeout(validateTimer)
  validateTimer = setTimeout(() => void validateDrafts(), 450)
}

async function validateDrafts(): Promise<void> {
  const run = ++validateRun
  const packChanges = Object.entries(state.files)
    .filter(([, file]) => isDirty(file))
    .map(([path, file]) => ({ path, text: file.draft }))
  const config = state.config && state.config.draft !== state.config.saved ? state.config.draft : null
  set({ checking: true })
  try {
    const [pack, configResult] = await Promise.all([
      api.validatePack(packChanges),
      config === null ? Promise.resolve({ ok: true as const }) : api.validateConfig(config)
    ])
    if (run !== validateRun) return
    set({
      validation: pack.validation,
      configProblem: configResult.ok ? null : configResult.problem,
      checking: false,
      checkedAt: Date.now()
    })
  } catch {
    if (run === validateRun) set({ checking: false })
  }
}

export function setDraft(path: string, text: string | null): void {
  const file = state.files[path]
  if (file) {
    if (file.draft === text) return
    set({ files: { ...state.files, [path]: { ...file, draft: text } } })
  } else if (text !== null) {
    set({ files: { ...state.files, [path]: { kind: 'pack', locked: false, saved: null, draft: text } } })
  }
  afterEdit()
}

export function setConfigDraft(text: string): void {
  if (!state.config || state.config.draft === text) return
  set({ config: { ...state.config, draft: text } })
  afterEdit()
}

export function discard(paths: string[] = dirtyPaths()): void {
  const files = { ...state.files }
  for (const path of paths) {
    const file = files[path]
    if (!file) continue
    if (file.saved === null) delete files[path]
    else files[path] = { ...file, draft: file.saved }
  }
  const config =
    state.config && paths.includes(state.config.path) ? { ...state.config, draft: state.config.saved } : state.config
  set({ files, config, configProblem: null })
  notifications.removeKey('save-error')
  afterEdit()
}

export async function save(): Promise<boolean> {
  if (state.saving) return false
  const packChanges = Object.entries(state.files)
    .filter(([, file]) => isDirty(file))
    .map(([path, file]) => ({ path, text: file.draft }))
  const config = state.config && state.config.draft !== state.config.saved ? state.config : null
  if (packChanges.length === 0 && !config) return true
  set({ saving: true })
  const saved: string[] = []
  try {
    if (packChanges.length > 0) {
      const result = await api.savePackFiles(packChanges)
      const files = { ...state.files }
      for (const change of packChanges) {
        if (change.text === null) delete files[change.path]
        else files[change.path] = { ...files[change.path], saved: change.text, draft: change.text }
      }
      set({ files, validation: result.validation })
      saved.push(...packChanges.map((change) => change.path))
    }
    if (config) {
      await api.saveConfig(config.draft)
      set({ config: { ...config, saved: config.draft }, configProblem: null })
      saved.push(config.path)
    }
    set({ saving: false, checkedAt: Date.now() })
    notifications.removeKey('save-error')
    afterEdit()
    const names = saved.map(fileName)
    notifications.notify({
      key: 'restart',
      tone: 'info',
      title: 'Restart to apply',
      body: 'Saved changes reach Discord after the bot restarts.',
      actions: [{ label: 'Copy command', icon: 'copy', run: () => void copyText(RESTART_COMMAND, RESTART_COMMAND) }]
    })
    notifications.toast({
      tone: 'success',
      title: names.length === 1 ? `Saved ${names[0]}` : `Saved ${names.length} files`,
      body: 'Restart the bot to apply.',
      action: {
        label: 'Copy restart command',
        icon: 'copy',
        run: () => void copyText(RESTART_COMMAND, RESTART_COMMAND)
      }
    })
    return true
  } catch (error) {
    set({ saving: false })
    reportSaveError(error, saved.length > 0)
    return false
  }
}

function reportSaveError(error: unknown, partly: boolean): void {
  if (!(error instanceof ApiError) || error.status === 0) {
    notifications.notify({
      key: 'save-error',
      tone: 'danger',
      title: 'Not saved',
      body: (error as Error).message,
      toast: true,
      actions: [{ label: 'Retry', primary: true, run: () => void save() }]
    })
    return
  }
  const problems = error.problems
  if (problems[0]?.file && state.config && problems[0].file === state.config.path) {
    set({ configProblem: problems[0] })
  } else if (error.status === 422) {
    set({ validation: { ok: false, problems } })
  }
  const count = problems.length
  notifications.notify({
    key: 'save-error',
    tone: 'danger',
    title: `${partly ? 'Partly saved' : 'Not saved'}: ${count} ${count === 1 ? 'error' : 'errors'}`,
    body: problemLine(problems[0]),
    toast: true,
    actions: [{ label: 'Go to field', primary: true, run: () => goToProblem(problems[0]) }]
  })
}

/** Every current problem: the pack check plus the config check. */
export function currentProblems(current: WorkspaceState): Problem[] {
  const pack = current.validation && !current.validation.ok ? current.validation.problems : []
  return current.configProblem ? [...pack, current.configProblem] : pack
}

export async function reloadAfterPackSwitch(): Promise<void> {
  lastDirtyKey = ''
  notifications.removeKey('unsaved')
  await load()
}
