import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

export const REPO = resolve(import.meta.dirname, '..', '..', '..')
// One sandbox per port, so two Playwright runs on different ports never reset each other's files.
export const SANDBOX = join(REPO, 'node_modules', '.cache', `persona-studio-e2e-${process.env.E2E_PORT || 5199}`)

/** The sandbox the e2e server edits: copies of the pack, the harness prompts, config.yml and .env. */
export function sandboxPaths(root: string) {
  return {
    root,
    packDir: join(root, 'characters', 'roka'),
    harnessDir: join(root, 'prompts'),
    configPath: join(root, 'config.yml'),
    envPath: join(root, '.env'),
    envExamplePath: join(root, '.env.example')
  }
}

const ENV_TEXT = [
  'DISCORD_TOKEN=e2e-discord-token-value-0000',
  'DISCORD_CLIENT_ID=123456789012345678',
  'ANTHROPIC_API_KEY=sk-ant-e2e-0000000000000000000Qx2A',
  'MODELSCOPE_API_KEY=ms-e2e-000000000000008c1e',
  'GEMINI_API_KEY=',
  ''
].join('\n')

/** Rebuilds the sandbox from the repo, so every test starts from the same files. */
export function resetSandbox(root: string): void {
  // rmSync below is recursive: refuse anything but the dedicated sandbox folder.
  if (!isAbsolute(root) || !/^persona-studio-e2e-\d+$/.test(basename(root)))
    throw new Error(`refusing to reset ${root || '(empty path)'}`)
  const paths = sandboxPaths(root)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'characters'), { recursive: true })
  cpSync(join(REPO, 'characters', 'roka'), paths.packDir, { recursive: true })
  cpSync(join(REPO, 'prompts'), paths.harnessDir, { recursive: true })
  // The bot resolves character: against the repo root, so the sandbox config points at the sandbox pack.
  const config = readFileSync(join(REPO, 'config.yml'), 'utf8')
  writeFileSync(paths.configPath, config.replace(/^character: \S+/m, `character: ${relative(REPO, paths.packDir)}`))
  cpSync(join(REPO, '.env.example'), paths.envExamplePath)
  writeFileSync(paths.envPath, ENV_TEXT, { mode: 0o600 })
}

export function readSandbox(root: string, path: string): string {
  const file = join(root, path)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}
