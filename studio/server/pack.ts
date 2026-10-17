import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { type Character, LOCKED_PROMPTS, type MemoryMode, loadCharacter } from '../../src/character/load.js'
import { assembleSystemPrompt } from '../../src/character/prompt.js'
import { estimateTokens } from '../../src/utils/tokens.js'
import { apiPath, readText, writeAtomic } from './files.js'
import { type ErrorBody, StudioError, fail } from './http.js'

export interface PackPaths {
  root: string
  packDir: string
  harnessDir: string
}

interface PackFile {
  path: string
  kind: 'pack' | 'harness'
  locked: boolean
  absolute: string
}

/** A file's new text, or null to delete it. */
interface PackChange {
  file: PackFile
  text: string | null
}

export interface FileEdit {
  path: string
  text: string | null
}

export type Validation = { ok: true; summary: ReturnType<typeof summarize> } | { ok: false; problems: ErrorBody[] }

const PACK_YAML = ['character.yml', 'voice.yml', 'moods.yml', 'lines.yml'] as const
const MEMORY_MODES: readonly MemoryMode[] = ['full', 'forget', 'none']
const MAX_FILES = 50
// Only a pack prompt can be created or deleted: prompts/<name>.md or prompts/moods/<name>.md, named in this pattern.
const NEW_PROMPT = /^(moods\/)?[a-z0-9][a-z0-9-]{0,47}\.md$/

function markdownUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

/** The allow-list: the only files the API reads or writes. A symlinked prompt is not a file here, so none is listed. */
export function packFiles({ root, packDir, harnessDir }: PackPaths): PackFile[] {
  const pack = [...PACK_YAML.map((name) => join(packDir, name)), ...markdownUnder(join(packDir, 'prompts'))]
  const harness = readdirSync(harnessDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(harnessDir, entry.name))
    .sort()
  return [
    ...pack.map((absolute) => ({ path: apiPath(root, absolute), kind: 'pack' as const, locked: false, absolute })),
    ...harness.map((absolute) => ({
      path: apiPath(root, absolute),
      kind: 'harness' as const,
      locked: LOCKED_PROMPTS.includes(basename(absolute, '.md')),
      absolute
    }))
  ]
}

function summarize(character: Character) {
  return {
    id: character.id,
    name: character.name,
    moods: character.moodKeys,
    defaultMood: character.defaultMood,
    stableTokens: Object.fromEntries(
      MEMORY_MODES.map((mode) => [mode, estimateTokens(character.prompts.stable[mode])])
    ) as Record<MemoryMode, number>
  }
}

const PLAIN: [RegExp, (count: number) => string][] = [
  [
    /^Too small: expected array to have >=(\d+) items?$/,
    (n) => (n === 1 ? 'Add at least one item.' : `Add at least ${n} items.`)
  ],
  [
    /^Too small: expected string to have >=(\d+) characters?$/,
    (n) => (n === 1 ? 'Enter some text.' : `Enter at least ${n} characters.`)
  ],
  [/^Too big: expected string to have <=(\d+) characters?$/, (n) => `Shorten it to ${n} characters or fewer.`],
  [/^Too big: expected array to have <=(\d+) items?$/, (n) => `Keep it to ${n} items or fewer.`],
  [/^Too small: expected number to be >=(-?[\d.]+)$/, (n) => `Enter ${n} or more.`],
  [/^Too big: expected number to be <=(-?[\d.]+)$/, (n) => `Enter ${n} or less.`],
  [/^Invalid input: expected number, received \w+$/, () => 'Enter a number.']
]

/** The schema library's generic messages, said plainly as what to do; the loader's own messages pass through. */
function plain(message: string): string {
  for (const [pattern, say] of PLAIN) {
    const match = pattern.exec(message)
    if (match) return say(Number(match[1]))
  }
  return message
}

/** Splits the loader's message into one problem per reported line; continuation lines (a YAML snippet) stay with theirs. */
function parseProblems(message: string, files: readonly string[]): ErrorBody[] {
  const problems: ErrorBody[] = []
  for (const line of message.split('\n')) {
    const file = files.filter((path) => line.startsWith(`${path}: `)).sort((a, b) => b.length - a.length)[0]
    const last = problems.at(-1)
    if (file === undefined && last) {
      last.message += `\n${line}`
      continue
    }
    const rest = file === undefined ? line : line.slice(file.length + 2)
    const split = rest.indexOf(': ')
    const head = rest.slice(0, split)
    const hasPath = split > 0 && !/\s/.test(head)
    problems.push({
      file: file ?? null,
      path: hasPath ? head : null,
      message: hasPath ? rest.slice(split + 2) : rest
    })
  }
  return problems.map((problem) => ({ ...problem, message: plain(problem.message) }))
}

/**
 * Loads the whole pack from a scratch copy of the pack and the harness, with `changes` applied there, so a failed
 * check never touches the real files. Scratch paths in the loader's message are mapped back to the API's paths.
 */
function loadScratch(
  paths: PackPaths,
  changes: readonly PackChange[]
): { ok: true; character: Character } | { ok: false; problems: ErrorBody[] } {
  const scratch = mkdtempSync(join(tmpdir(), 'persona-studio-'))
  try {
    const pack = join(scratch, 'pack')
    const harness = join(scratch, 'harness')
    cpSync(paths.packDir, pack, { recursive: true })
    cpSync(paths.harnessDir, harness, { recursive: true })
    for (const { file, text } of changes) {
      const [from, to] = file.kind === 'pack' ? [paths.packDir, pack] : [paths.harnessDir, harness]
      const target = join(to, relative(from, file.absolute))
      if (text === null) {
        rmSync(target, { force: true })
      } else {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, text)
      }
    }
    try {
      return { ok: true, character: loadCharacter(pack, harness) }
    } catch (error) {
      const message = (error as Error).message
        .replaceAll(pack, apiPath(paths.root, paths.packDir))
        .replaceAll(harness, apiPath(paths.root, paths.harnessDir))
      return {
        ok: false,
        problems: parseProblems(message, [
          ...packFiles(paths).map(({ path }) => path),
          ...changes.map(({ file }) => file.path)
        ])
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export function validatePack(paths: PackPaths, changes: readonly PackChange[] = []): Validation {
  const loaded = loadScratch(paths, changes)
  return loaded.ok ? { ok: true, summary: summarize(loaded.character) } : loaded
}

export function invalid(problems: ErrorBody[]): StudioError {
  return new StudioError(422, problems[0], { problems })
}

export function readPack(paths: PackPaths) {
  return {
    dir: apiPath(paths.root, paths.packDir),
    harnessDir: apiPath(paths.root, paths.harnessDir),
    files: packFiles(paths).map(({ path, kind, locked, absolute }) => ({
      path,
      kind,
      locked,
      text: readText(absolute)
    })),
    validation: validatePack(paths)
  }
}

export function writePackFile(paths: PackPaths, path: string, text: string) {
  const file = packFiles(paths).find((candidate) => candidate.path === path)
  if (!file) throw new StudioError(404, { file: path, path: null, message: 'not an editable pack or harness file' })
  const validation = validatePack(paths, [{ file, text }])
  if (!validation.ok) throw invalid(validation.problems)
  writeAtomic(file.absolute, text)
  return { path, validation }
}

/** Reads `files` from a request body: up to `MAX_FILES` distinct `{ path, text }` entries, text null to delete. */
export function fileEdits(body: Record<string, unknown>, min: 0 | 1): FileEdit[] {
  const { files } = body
  if (!Array.isArray(files) || files.length < min || files.length > MAX_FILES) {
    throw fail(400, `files must be a list of ${min} to ${MAX_FILES} { path, text } entries`)
  }
  const edits = files.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw fail(400, 'each file must be { path, text }')
    const { path, text } = entry as Record<string, unknown>
    if (typeof path !== 'string') throw fail(400, 'path must be a string')
    if (typeof text !== 'string' && text !== null)
      throw fail(400, `text of ${path} must be a string, or null to delete it`)
    return { path, text }
  })
  const seen = new Set<string>()
  for (const { path } of edits) {
    if (seen.has(path)) throw fail(400, `${path} is listed twice`)
    seen.add(path)
  }
  return edits
}

/** The file a new or deleted prompt lands in, or undefined when `path` is not one a request may create or delete. */
function promptFile(paths: PackPaths, path: string): string | undefined {
  const prefix = `${apiPath(paths.root, paths.packDir)}/prompts/`
  const name = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  if (!NEW_PROMPT.test(name)) return undefined
  const prompts = join(paths.packDir, 'prompts')
  const folders = name.startsWith('moods/') ? [prompts, join(prompts, 'moods')] : [prompts]
  // A symlinked prompts folder would put a new file outside the pack.
  if (folders.some((dir) => lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() === false)) return undefined
  return join(prompts, ...name.split('/'))
}

/** Matches each edit to the allow-list: any listed file may be edited, and only a pack prompt created or deleted. */
function packChanges(paths: PackPaths, edits: readonly FileEdit[]): PackChange[] {
  const listed = new Map(packFiles(paths).map((file) => [file.path, file]))
  return edits.map(({ path, text }) => {
    const file = listed.get(path)
    const prompt = promptFile(paths, path)
    if (file && (text !== null || prompt)) return { file, text }
    if (!file && prompt && text !== null && !lstatSync(prompt, { throwIfNoEntry: false })) {
      return { file: { path, kind: 'pack', locked: false, absolute: prompt }, text }
    }
    const message = file
      ? 'only a pack prompt in prompts/ or prompts/moods/ can be deleted'
      : text === null
        ? 'not an editable pack or harness file'
        : 'not an editable pack or harness file; a new one must be a pack prompt, prompts/<name>.md or prompts/moods/<name>.md, its name in lowercase letters, digits and dashes'
    throw new StudioError(404, { file: path, path: null, message })
  })
}

/** Validates the pack with every edit applied on a scratch copy; nothing is written. */
export function validatePackFiles(paths: PackPaths, edits: readonly FileEdit[]) {
  return { validation: validatePack(paths, packChanges(paths, edits)) }
}

/** Validates every edit together, then writes or deletes each file, or writes nothing when the pack would not load. */
export function writePackFiles(paths: PackPaths, edits: readonly FileEdit[]) {
  const changes = packChanges(paths, edits)
  const validation = validatePack(paths, changes)
  if (!validation.ok) throw invalid(validation.problems)
  for (const { file, text } of changes) {
    if (text === null) {
      rmSync(file.absolute, { force: true })
    } else {
      mkdirSync(dirname(file.absolute), { recursive: true })
      writeAtomic(file.absolute, text)
    }
  }
  return { files: changes.map(({ file }) => file.path), validation }
}

export function preview(paths: PackPaths, query: URLSearchParams) {
  let character: Character
  try {
    character = loadCharacter(paths.packDir, paths.harnessDir)
  } catch (error) {
    const validation = validatePack(paths)
    if (validation.ok) throw error
    throw invalid(validation.problems)
  }
  return assemble(character, query)
}

/** The preview for a draft: the pack loaded from a scratch copy with `edits` applied, under the same allow-list. */
export function previewDraft(paths: PackPaths, edits: readonly FileEdit[], query: URLSearchParams) {
  const loaded = loadScratch(paths, packChanges(paths, edits))
  if (!loaded.ok) throw invalid(loaded.problems)
  return assemble(loaded.character, query)
}

function assemble(character: Character, query: URLSearchParams) {
  const mood = query.get('mood') || character.defaultMood
  if (!character.moodKeys.includes(mood)) {
    throw fail(400, `mood must be one of ${character.moodKeys.join(', ')}`, { moods: character.moodKeys })
  }
  const hourText = query.get('hour')
  const hour = hourText ? Number(hourText) : new Date().getHours()
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw fail(400, 'hour must be a whole hour from 0 to 23')
  const memory = (query.get('memory') || 'full') as MemoryMode
  if (!MEMORY_MODES.includes(memory)) throw fail(400, `memory must be one of ${MEMORY_MODES.join(', ')}`)
  const prompt = assembleSystemPrompt(character, { mood, hour, displayName: query.get('user') || 'User', memory })
  return { prompt, tokens: estimateTokens(prompt), stableTokens: estimateTokens(character.prompts.stable[memory]) }
}
