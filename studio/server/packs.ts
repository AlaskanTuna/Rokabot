import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from '../../src/character/paths.js'
import { type ConfigPaths, setTopLevelValue, writeConfig } from './configFile.js'
import { apiPath, readText } from './files.js'
import { type StudioError, fail } from './http.js'
import { type PackPaths, invalid, validatePack } from './pack.js'
import { envValue } from './secrets.js'

export interface SwitchPaths extends PackPaths, ConfigPaths {
  /** A clean pack that `createPack` copies. */
  templateDir: string
}

const PACK_ID = /^[a-z0-9][a-z0-9-]{0,31}$/

export function hasPack(packDir: string): boolean {
  return statSync(join(packDir, 'character.yml'), { throwIfNoEntry: false })?.isFile() === true
}

/** The packs a deployer can switch to: each folder under `<root>/characters/` that holds a character.yml. */
export function packCandidates(root: string): string[] {
  const dir = join(root, 'characters')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && hasPack(join(dir, entry.name)))
    .map((entry) => apiPath(root, join(dir, entry.name)))
    .sort()
}

export function noPack(paths: PackPaths): StudioError {
  const configured = apiPath(paths.root, paths.packDir)
  return fail(409, `there is no character pack at ${configured}; pick one or create one`, {
    code: 'no_pack',
    configured,
    candidates: packCandidates(paths.root)
  })
}

/**
 * Points config.yml's `character:` at `packDir`, after the bot's config check passes. The bot resolves a relative
 * path against its repo root, so the value is written relative to that.
 */
async function pointConfigAt(paths: SwitchPaths, packDir: string): Promise<void> {
  const file = apiPath(paths.root, paths.configPath)
  const text = setTopLevelValue(readText(paths.configPath), 'character', apiPath(REPO_ROOT, packDir), file)
  await writeConfig(paths, text)
}

function refuseOverride(paths: SwitchPaths): void {
  if (envValue(paths, 'CHARACTER_DIR')) {
    throw fail(409, 'CHARACTER_DIR is set, and it outranks character: in config.yml; remove it from .env and the shell')
  }
}

/** Loads the pack at `dir` (an entry of `packCandidates`), then points config.yml at it; returns its folder. */
export async function selectPack(paths: SwitchPaths, dir: string): Promise<string> {
  const candidates = packCandidates(paths.root)
  if (!candidates.includes(dir)) throw fail(404, `${dir} is not a pack under characters/`, { candidates })
  refuseOverride(paths)
  const packDir = resolve(paths.root, dir)
  const validation = validatePack({ ...paths, packDir })
  if (!validation.ok) throw invalid(validation.problems)
  await pointConfigAt(paths, packDir)
  return packDir
}

/** Copies the template to characters/<id>, sets its id, then selects it; on any problem the new folder is removed. */
export async function createPack(paths: SwitchPaths, id: string): Promise<string> {
  if (!PACK_ID.test(id)) throw fail(400, `id must match ${PACK_ID.source}`)
  const packDir = join(paths.root, 'characters', id)
  if (lstatSync(packDir, { throwIfNoEntry: false })) {
    throw fail(409, `${apiPath(paths.root, packDir)} already exists; pick another id`)
  }
  refuseOverride(paths)
  mkdirSync(join(paths.root, 'characters'), { recursive: true })
  cpSync(paths.templateDir, packDir, { recursive: true })
  try {
    const characterPath = join(packDir, 'character.yml')
    const file = apiPath(paths.root, characterPath)
    writeFileSync(characterPath, setTopLevelValue(readText(characterPath), 'id', id, file))
    const validation = validatePack({ ...paths, packDir })
    if (!validation.ok) throw invalid(validation.problems)
    await pointConfigAt(paths, packDir)
  } catch (error) {
    rmSync(packDir, { recursive: true, force: true })
    throw error
  }
  return packDir
}
