import { readYaml } from '../../lib/yaml'
import { type WorkspaceState, fileName } from '../../state/workspace'

export type Source = 'pack' | 'harness' | 'locked' | 'missing'

export interface PromptEntry {
  name: string
  /** The file the bot reads for this name; null when neither the pack nor the harness has one. */
  path: string | null
  source: Source
  /** The harness file a pack file of the same name takes the place of. */
  overrides: string | null
  inOrder: boolean
}

export const NAME = /^[a-z0-9][a-z0-9-]{0,47}$/

export function exists(workspace: WorkspaceState, path: string): boolean {
  const file = workspace.files[path]
  return file !== undefined && file.draft !== null
}

export const characterPath = (workspace: WorkspaceState) => `${workspace.dir}/character.yml`
export const ownPrompt = (workspace: WorkspaceState, name: string) => `${workspace.dir}/prompts/${name}.md`
export const harnessPrompt = (workspace: WorkspaceState, name: string) => `${workspace.harnessDir}/${name}.md`

/** `prompt.system` from the character.yml draft, or null while that draft does not parse. */
export function systemOrder(workspace: WorkspaceState): string[] | null {
  const character = readYaml(workspace.files[characterPath(workspace)]?.draft) as
    | { prompt?: { system?: unknown } }
    | undefined
  const system = character?.prompt?.system
  if (character === undefined) return null
  return Array.isArray(system) ? system.filter((name): name is string => typeof name === 'string') : []
}

/** The file the loader reads for a prompt name: the pack's own, unless the harness locks that name. */
export function resolvePrompt(workspace: WorkspaceState, name: string, inOrder: boolean): PromptEntry {
  const own = ownPrompt(workspace, name)
  const shared = harnessPrompt(workspace, name)
  const sharedFile = exists(workspace, shared) ? workspace.files[shared] : undefined
  if (sharedFile?.locked) return { name, path: shared, source: 'locked', overrides: null, inOrder }
  if (exists(workspace, own)) return { name, path: own, source: 'pack', overrides: sharedFile ? shared : null, inOrder }
  if (sharedFile) return { name, path: shared, source: 'harness', overrides: null, inOrder }
  return { name, path: null, source: 'missing', overrides: null, inOrder }
}

/** Every Markdown prompt outside the order: pack prompts (not mood prompts) and harness prompts the pack does not replace. */
export function otherPrompts(workspace: WorkspaceState, order: PromptEntry[]): PromptEntry[] {
  const used = new Set(order.map((entry) => entry.path))
  const packPrefix = `${workspace.dir}/prompts/`
  const harnessPrefix = `${workspace.harnessDir}/`
  const others: PromptEntry[] = []
  for (const [path, file] of Object.entries(workspace.files)) {
    if (file.draft === null || !path.endsWith('.md') || used.has(path)) continue
    if (path.startsWith(packPrefix) && !path.startsWith(`${packPrefix}moods/`)) {
      const name = path.slice(packPrefix.length, -3)
      const shared = harnessPrompt(workspace, name)
      others.push({ name, path, source: 'pack', overrides: exists(workspace, shared) ? shared : null, inOrder: false })
    } else if (path.startsWith(harnessPrefix) && file.kind === 'harness') {
      const name = path.slice(harnessPrefix.length, -3)
      if (!file.locked && exists(workspace, ownPrompt(workspace, name))) continue
      others.push({ name, path, source: file.locked ? 'locked' : 'harness', overrides: null, inOrder: false })
    }
  }
  return others.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source))
}

/** The part of the URL after /prompts/ for an entry: its file name. */
export function entryRest(entry: PromptEntry): string {
  return entry.path ? fileName(entry.path) : `${entry.name.split('/').at(-1)}.md`
}

export function entryKey(entry: PromptEntry): string {
  return entry.path ?? `missing:${entry.name}`
}

export function titleFor(name: string): string {
  return name
    .split(/[-/]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
