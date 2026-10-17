import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from '../../src/character/paths.js'
import { apiPath, readText, writeAtomic } from './files.js'
import { StudioError } from './http.js'

const CHECK_SCRIPT = join(import.meta.dirname, 'checkConfig.ts')
const CHECK_TIMEOUT_MS = 30_000

export interface ConfigPaths {
  root: string
  configPath: string
  envPath: string
  /** The environment the bot would start in, before .env is read: the check reads `envPath` itself. */
  env: NodeJS.ProcessEnv
}

/** Runs the bot's own config loader on `text` in a child process; resolves to its error message, if any. */
function checkConfig(text: string, paths: ConfigPaths): Promise<string | undefined> {
  const scratch = mkdtempSync(join(tmpdir(), 'persona-studio-config-'))
  const copy = join(scratch, 'config.yml')
  writeFileSync(copy, text)
  const env = {
    ...paths.env,
    ROKABOT_CONFIG_PATH: copy,
    DOTENV_CONFIG_PATH: paths.envPath,
    NODE_NO_WARNINGS: '1'
  }
  return new Promise<string | undefined>((done) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', CHECK_SCRIPT],
      { cwd: REPO_ROOT, env, timeout: CHECK_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if (!error) done(undefined)
        else if (error.killed) done(`the config check did not finish within ${CHECK_TIMEOUT_MS / 1000} s`)
        else done(stderr.trim() || error.message)
      }
    )
  }).finally(() => rmSync(scratch, { recursive: true, force: true }))
}

export function readConfig(paths: ConfigPaths) {
  return { path: apiPath(paths.root, paths.configPath), text: readText(paths.configPath) }
}

export async function writeConfig(paths: ConfigPaths, text: string) {
  const path = apiPath(paths.root, paths.configPath)
  const problem = await checkConfig(text, paths)
  if (problem !== undefined) throw new StudioError(422, { file: path, path: null, message: problem })
  writeAtomic(paths.configPath, text)
  return { path, ok: true }
}
