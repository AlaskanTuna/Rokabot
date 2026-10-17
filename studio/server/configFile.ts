import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isScalar, parseDocument, stringify } from 'yaml'
import { REPO_ROOT } from '../../src/character/paths.js'
import { apiPath, readText, writeAtomic } from './files.js'
import { type ErrorBody, StudioError } from './http.js'

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
        // src/config.ts awaits its logger to print some warnings, and the logger awaits config.ts: the bot hangs too.
        else if (/unsettled top-level await/.test(stderr))
          done(
            'The bot would hang at startup with these values: it deadlocks while logging a config warning. Undo the change.'
          )
        else done(stderr.trim() || error.message)
      }
    )
  }).finally(() => rmSync(scratch, { recursive: true, force: true }))
}

/** The loader names a bad key as "Config value llm.models.local.baseUrl must be ...", which the UI can jump to. */
function configProblem(file: string, message: string): ErrorBody {
  return { file, path: /^Config value (\S+?)[,.:;]?(?:\s|$)/.exec(message)?.[1] ?? null, message }
}

export function readConfig(paths: ConfigPaths) {
  return { path: apiPath(paths.root, paths.configPath), text: readText(paths.configPath) }
}

export async function validateConfig(paths: ConfigPaths, text: string) {
  const problem = await checkConfig(text, paths)
  if (problem === undefined) return { ok: true }
  return { ok: false, problem: configProblem(apiPath(paths.root, paths.configPath), problem) }
}

export async function writeConfig(paths: ConfigPaths, text: string) {
  const path = apiPath(paths.root, paths.configPath)
  const problem = await checkConfig(text, paths)
  if (problem !== undefined) throw new StudioError(422, configProblem(path, problem))
  writeAtomic(paths.configPath, text)
  return { path, ok: true }
}

/**
 * Sets a top-level key in YAML `text`. An existing value is replaced in place, so every other byte, comments and
 * formatting included, stays as it was; a missing key is added through the yaml Document API.
 */
export function setTopLevelValue(text: string, key: string, value: string, file: string): string {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) throw new StudioError(422, { file, path: null, message: doc.errors[0].message })
  const node = doc.get(key, true)
  if (isScalar(node) && node.range && node.range[1] > node.range[0]) {
    return text.slice(0, node.range[0]) + stringify(value, { lineWidth: 0 }).trimEnd() + text.slice(node.range[1])
  }
  doc.set(key, value)
  return doc.toString({ lineWidth: 0 })
}
