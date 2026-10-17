import type { Location } from '../../lib/router'
import { readYaml } from '../../lib/yaml'
import { type WorkspaceState, fileName } from '../../state/workspace'
import { exists } from '../prompts/model'
import { appendEntry, removeKey, removeListItem } from '../prompts/yamlText'

export interface MoodYaml {
  prompt?: string
  faces?: string[]
  color?: string
  [key: string]: unknown
}

export interface MoodsYaml {
  default?: string
  safe?: string
  lateNight?: { mood?: string; from?: number; to?: number }
  detection?: { mood?: string }[]
  moods?: Record<string, MoodYaml>
  moodPairs?: Record<string, string>
  portraitUrls?: Record<string, string>
}

export type View = { kind: 'rules' } | { kind: 'shared' } | { kind: 'mood'; key: string }

/** Mood names the loader and the prompt file both accept. */
export const MOOD_NAME = /^[a-z][a-z0-9-]{0,47}$/

export const moodsPath = (workspace: WorkspaceState) => `${workspace.dir}/moods.yml`

export function readMoods(workspace: WorkspaceState): MoodsYaml | null {
  const data = readYaml(workspace.files[moodsPath(workspace)]?.draft)
  return data && typeof data === 'object' ? (data as MoodsYaml) : null
}

export function moodKeys(data: MoodsYaml | null): string[] {
  return data?.moods && typeof data.moods === 'object' ? Object.keys(data.moods) : []
}

/** The prompt file a mood reads: its `prompt` name (default `moods/<mood>`) in the pack, else in the harness. */
export function moodPrompt(
  workspace: WorkspaceState,
  data: MoodsYaml | null,
  key: string
): { path: string; exists: boolean } {
  const prompt = data?.moods?.[key]?.prompt
  const name = typeof prompt === 'string' && prompt ? prompt : `moods/${key}`
  const own = `${workspace.dir}/prompts/${name}.md`
  const shared = `${workspace.harnessDir}/${name}.md`
  if (exists(workspace, own)) return { path: own, exists: true }
  if (exists(workspace, shared)) return { path: shared, exists: true }
  return { path: own, exists: false }
}

export function rolesOf(data: MoodsYaml | null, key: string): string[] {
  const roles: string[] = []
  if (data?.default === key) roles.push('default')
  if (data?.safe === key) roles.push('safe')
  if (data?.lateNight?.mood === key) roles.push('late night')
  return roles
}

/** Places outside moods.yml that name the mood: voice.yml opener skipMoods and moodWords. */
export function voiceUses(workspace: WorkspaceState, key: string): string[] {
  const voice = readYaml(workspace.files[`${workspace.dir}/voice.yml`]?.draft) as
    | { openers?: Record<string, { skipMoods?: unknown; moodWords?: unknown }> }
    | undefined
  const uses: string[] = []
  for (const [style, opener] of Object.entries(voice?.openers ?? {})) {
    if (Array.isArray(opener?.skipMoods) && opener.skipMoods.includes(key)) uses.push(`openers.${style}.skipMoods`)
    if (opener?.moodWords && typeof opener.moodWords === 'object' && key in opener.moodWords) {
      uses.push(`openers.${style}.moodWords`)
    }
  }
  return uses
}

/** Why a mood cannot be removed, or null when it can. */
export function removeBlocker(workspace: WorkspaceState, data: MoodsYaml | null, key: string): string | null {
  const roles = rolesOf(data, key)
  if (roles.length > 0) {
    return `${key} is the ${roles.join(' and ')} mood. Pick another one under Detection rules first.`
  }
  const uses = voiceUses(workspace, key)
  if (uses.length > 0) return `voice.yml names ${key} in ${uses.join(', ')}. Remove it on the Voice screen first.`
  return null
}

/** What else in moods.yml names the mood, removed with it. */
export function dependents(data: MoodsYaml | null, key: string): { rules: number[]; pairs: string[] } {
  const rules = (data?.detection ?? []).flatMap((rule, index) => (rule?.mood === key ? [index] : []))
  const pairs = Object.keys(data?.moodPairs ?? {}).filter((pair) => pair.split(':').includes(key))
  return { rules, pairs }
}

export function removeMoodText(text: string, data: MoodsYaml | null, key: string): string {
  const { rules, pairs } = dependents(data, key)
  let next = text
  for (const index of [...rules].reverse()) next = removeListItem(next, ['detection'], index)
  for (const pair of pairs) next = removeKey(next, ['moodPairs'], pair)
  return removeKey(next, ['moods'], key)
}

const title = (name: string) =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/** A new mood modelled on the default one, with every field the loader requires. */
export function addMoodText(text: string, data: MoodsYaml | null, name: string, faceGroups: string[]): string {
  const keys = moodKeys(data)
  const model = data?.moods?.[data.default ?? ''] ?? data?.moods?.[keys[0]] ?? {}
  const fill: Record<string, unknown> = {
    faces: Array.isArray(model.faces) && model.faces.length > 0 ? model.faces : faceGroups.slice(0, 1),
    beats: model.beats,
    judge: `Describe when the ${name} mood fits.`,
    color: model.color ?? '#b0b4bc',
    placeholder: model.placeholder ?? 'https://placehold.co/80x80',
    portraits: model.portraits,
    emoji: model.emoji ?? '✨',
    adjective: name,
    season: `A ${title(name)} Season`
  }
  const order = [...Object.keys(model).filter((field) => field in fill), ...Object.keys(fill)]
  const entry: Record<string, unknown> = {}
  for (const field of order) {
    const value = fill[field]
    if (value !== undefined && !(field in entry)) entry[field] = value
  }
  return appendEntry(text, ['moods'], name, entry)
}

export function moodTemplate(name: string, character: string): string {
  return `## Current Mood: ${title(name)}\n- Describe how ${character} sounds in this mood.\n`
}

/** The item a URL selects: a focused moods.yml path wins, then a prompt file, then the path after /moods/. */
export function viewFrom(location: Location, workspace: WorkspaceState, data: MoodsYaml | null): View {
  const keys = moodKeys(data)
  const focus = location.search.get('focus')
  const file = location.search.get('file')
  if (focus && (!file || file === moodsPath(workspace))) {
    const key = /^moods\.([^.[\]]+)/.exec(focus)?.[1]
    if (key && keys.includes(key)) return { kind: 'mood', key }
    return /^(moodPairs|portraitUrls)(\.|\[|$)/.test(focus) ? { kind: 'shared' } : { kind: 'rules' }
  }
  if (file) {
    const key = keys.find((candidate) => moodPrompt(workspace, data, candidate).path === file)
    if (key) return { kind: 'mood', key }
  }
  if (location.search.get('view') === 'shared') return { kind: 'shared' }
  if (location.rest) {
    const key =
      keys.find((candidate) => candidate === location.rest) ??
      keys.find((candidate) => fileName(moodPrompt(workspace, data, candidate).path) === location.rest)
    if (key) return { kind: 'mood', key }
  }
  return { kind: 'rules' }
}
