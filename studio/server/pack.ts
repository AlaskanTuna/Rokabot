import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
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

type Validation = { ok: true; summary: ReturnType<typeof summarize> } | { ok: false; problems: ErrorBody[] }

const PACK_YAML = ['character.yml', 'voice.yml', 'moods.yml', 'lines.yml'] as const
const MEMORY_MODES: readonly MemoryMode[] = ['full', 'forget', 'none']

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
  return problems
}

/**
 * Loads the whole pack from a scratch copy of the pack and the harness, with `change` applied there, so a failed
 * check never touches the real files. Scratch paths in the loader's message are mapped back to the API's paths.
 */
export function validatePack(paths: PackPaths, change?: { file: PackFile; text: string }): Validation {
  const scratch = mkdtempSync(join(tmpdir(), 'persona-studio-'))
  try {
    const pack = join(scratch, 'pack')
    const harness = join(scratch, 'harness')
    cpSync(paths.packDir, pack, { recursive: true })
    cpSync(paths.harnessDir, harness, { recursive: true })
    if (change) {
      const [from, to] = change.file.kind === 'pack' ? [paths.packDir, pack] : [paths.harnessDir, harness]
      writeFileSync(join(to, relative(from, change.file.absolute)), change.text)
    }
    try {
      return { ok: true, summary: summarize(loadCharacter(pack, harness)) }
    } catch (error) {
      const message = (error as Error).message
        .replaceAll(pack, apiPath(paths.root, paths.packDir))
        .replaceAll(harness, apiPath(paths.root, paths.harnessDir))
      return {
        ok: false,
        problems: parseProblems(
          message,
          packFiles(paths).map(({ path }) => path)
        )
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function invalid(problems: ErrorBody[]): StudioError {
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
  const validation = validatePack(paths, { file, text })
  if (!validation.ok) throw invalid(validation.problems)
  writeAtomic(file.absolute, text)
  return { path, validation }
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
