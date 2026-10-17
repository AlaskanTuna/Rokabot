import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
export const HARNESS_DIR = resolve(REPO_ROOT, 'prompts')
const DEFAULT_CHARACTER = 'characters/roka'

/**
 * The pack to run: `CHARACTER_DIR`, else config.yml's top-level `character:`, else Roka. Relative paths resolve
 * against the repo root. config.yml is read here rather than through src/config.ts, which many tests mock.
 */
export function resolveCharacterDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHARACTER_DIR) return resolve(REPO_ROOT, env.CHARACTER_DIR)
  const configPath = env.ROKABOT_CONFIG_PATH || resolve(REPO_ROOT, 'config.yml')
  const configured = existsSync(configPath)
    ? (load(readFileSync(configPath, 'utf8')) as { character?: unknown } | null)?.character
    : undefined
  if (configured === undefined || configured === null) return resolve(REPO_ROOT, DEFAULT_CHARACTER)
  if (typeof configured !== 'string' || configured.trim() === '') {
    throw new Error(`${configPath}: character must be the path of a character pack folder`)
  }
  return resolve(REPO_ROOT, configured)
}
