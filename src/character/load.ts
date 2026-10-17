import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import yaml from 'js-yaml'
import type { z } from 'zod'
import {
  LINE_SLOTS,
  type LinesFile,
  type VoiceFile,
  characterFileSchema,
  linesFileSchema,
  moodsFileSchema,
  voiceFileSchema
} from './schema.js'

export type MemoryMode = 'full' | 'forget' | 'none'

/** Harness prompts a pack cannot override, so every character keeps the same hard limits and safety redirect. */
export const LOCKED_PROMPTS: readonly string[] = ['boundaries', 'safety-steer']

export interface PromptSection {
  name: string
  text: string
}

export interface Mood {
  prompt: string
  faces: readonly string[]
  beats: Readonly<Record<string, number>>
  judge: string
  color: number
  placeholder: string
  portraits: readonly string[]
  emoji: string
  adjective: string
  season: string
}

export type Voice = Omit<VoiceFile, 'threats'> & { threats: ReadonlyArray<{ text: string; seen: RegExp }> }

export interface Character {
  id: string
  name: string
  fullName: string
  world: string
  dir: string
  triggers: { names: readonly string[] }
  /** Matches any trigger name as a whole word, case-insensitively. */
  nameTrigger: RegExp
  /** A leading "[Name]:" tag the model sometimes writes before its reply. */
  nameTag: RegExp
  model: { temperature: number; topP: number }
  prompts: {
    /** Each `prompt.system` section in order, with `{{memory_tools}}` filled for that memory mode. */
    system: Readonly<Record<MemoryMode, readonly PromptSection[]>>
    /** The sections joined: the part of every system prompt that never changes between turns. */
    stable: Readonly<Record<MemoryMode, string>>
    memoryTools: string
    /** Still holds `{{user}}` and `{{time_of_day}}`, filled each turn. */
    situation: string
    safetySteer: string
  }
  timeOfDay: ReadonlyArray<{ from: number; to: number; text: string }>
  judge: { lookupQuestion: string; moodQuestion: string }
  /** Mood names in the order moods.yml lists them. */
  moodKeys: readonly string[]
  moods: Readonly<Record<string, Mood>>
  defaultMood: string
  safeMood: string
  lateNight?: { mood: string; from: number; to: number }
  detection: ReadonlyArray<{ mood: string; minMatches: number; patterns: readonly RegExp[] }>
  moodPairs: Readonly<Record<string, string>>
  portraitUrls: Readonly<Record<string, string>>
  voice: Voice
  /** What the bot posts in the character's voice outside the model's replies; slots in `LINE_SLOTS` stay unfilled. */
  lines: LinesFile
}

const MACRO = /\{\{([^{}]*)\}\}/g
const MEMORY_LINE = '{{memory_tools}}'
const SLOT_HOMES: Record<string, string> = {
  user: 'situation.md',
  time_of_day: 'situation.md',
  memory_tools: 'tools.md, on a line of its own'
}

/** Whether `hour` falls in [from, to); a range whose `to` is not after `from` wraps past midnight. */
export function inHours(hour: number, from: number, to: number): boolean {
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

function uncoveredHours(bands: ReadonlyArray<{ from: number; to: number }>): number[] {
  return Array.from({ length: 24 }, (_, hour) => hour).filter(
    (hour) => !bands.some(({ from, to }) => inHours(hour, from, to))
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shown(path: string): string {
  const fromCwd = relative(process.cwd(), path)
  return fromCwd === '' || fromCwd.startsWith('..') || isAbsolute(fromCwd) ? path : fromCwd
}

function yamlPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) => {
    if (typeof key === 'number') return `${text}[${key}]`
    return text ? `${text}.${String(key)}` : String(key)
  }, '')
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !(value instanceof RegExp) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/**
 * Reads a character pack (`character.yml`, `voice.yml`, `moods.yml`, `lines.yml` and `prompts/`) plus the shared
 * harness prompts, validates every value and cross-reference, and returns it frozen with its prompt text ready to
 * send. Every problem found is reported at once, each naming its file and YAML path.
 */
export function loadCharacter(dir: string, harnessDir: string): Character {
  const root = resolve(dir)
  const harness = resolve(harnessDir)
  const problems: string[] = []
  const report = (file: string, path: string, message: string) =>
    problems.push(`${shown(file)}: ${path ? `${path}: ` : ''}${message}`)

  function readYaml<T extends z.ZodType>(file: string, schema: T): z.output<T> | undefined {
    if (!existsSync(file)) {
      report(file, '', 'file is missing')
      return undefined
    }
    let raw: unknown
    try {
      raw = yaml.load(readFileSync(file, 'utf8'))
    } catch (error) {
      report(file, '', (error as Error).message)
      return undefined
    }
    const result = schema.safeParse(raw ?? {})
    if (result.success) return result.data
    for (const issue of result.error.issues) report(file, yamlPath(issue.path), issue.message)
    return undefined
  }

  const characterPath = join(root, 'character.yml')
  const voicePath = join(root, 'voice.yml')
  const moodsPath = join(root, 'moods.yml')
  const linesPath = join(root, 'lines.yml')
  const file = readYaml(characterPath, characterFileSchema)
  const voiceFile = readYaml(voicePath, voiceFileSchema)
  const moodsFile = readYaml(moodsPath, moodsFileSchema)
  const linesFile = readYaml(linesPath, linesFileSchema)
  if (!file || !voiceFile || !moodsFile || !linesFile) throw new Error(problems.join('\n'))

  const statics: Record<string, string> = { char: file.name, char_full: file.fullName, world: file.world }
  function expand(text: string, file: string, path: string, slots: readonly string[] = []): string {
    return text.replace(MACRO, (whole, name: string) => {
      if (Object.hasOwn(statics, name)) return statics[name]
      if (!slots.includes(name)) {
        const home = SLOT_HOMES[name]
        report(file, path, `unknown macro ${whole}${home ? `; it works only in ${home}` : ''}`)
      }
      return whole
    })
  }

  const ownPrompts = join(root, 'prompts')
  for (const name of LOCKED_PROMPTS) {
    const override = join(ownPrompts, `${name}.md`)
    if (existsSync(override)) {
      report(override, '', `${name}.md is a locked harness prompt; edit ${shown(join(harness, `${name}.md`))} instead`)
    }
  }
  const prompts = new Map<string, string>()
  function prompt(name: string, file: string, path: string): string {
    const cached = prompts.get(name)
    if (cached !== undefined) return cached
    const own = join(ownPrompts, `${name}.md`)
    const shared = join(harness, `${name}.md`)
    const source = !LOCKED_PROMPTS.includes(name) && existsSync(own) ? own : existsSync(shared) ? shared : undefined
    if (!source) {
      report(file, path, `no prompt file "${name}.md" in ${shown(ownPrompts)} or ${shown(harness)}`)
      return ''
    }
    const raw = readFileSync(source, 'utf8')
    const slots = name === 'situation' ? ['user', 'time_of_day'] : name === 'tools' ? ['memory_tools'] : []
    const text = expand(raw.endsWith('\n') ? raw.slice(0, -1) : raw, source, '', slots)
    if (text.split('\n').some((line) => line !== MEMORY_LINE && line.includes(MEMORY_LINE))) {
      report(source, '', `${MEMORY_LINE} must be on a line of its own`)
    }
    prompts.set(name, text)
    return text
  }

  const sections = file.prompt.system.map((name, index) => ({
    name,
    text: prompt(name, characterPath, `prompt.system[${index}]`)
  }))
  const usesMemoryTools = sections.some(({ text }) => text.split('\n').includes(MEMORY_LINE))
  const forgetTool = usesMemoryTools ? prompt('forget-tool', characterPath, 'prompt.system') : ''
  const memoryTools = usesMemoryTools
    ? [prompt('memory-tools', characterPath, 'prompt.system'), forgetTool].filter(Boolean).join('\n')
    : ''
  const fills: Record<MemoryMode, string> = { full: memoryTools, forget: forgetTool, none: '' }
  const system = {} as Record<MemoryMode, PromptSection[]>
  const stable = {} as Record<MemoryMode, string>
  for (const mode of ['full', 'forget', 'none'] as const) {
    system[mode] = sections.map(({ name, text }) => ({
      name,
      text: text
        .split('\n')
        .flatMap((line) => (line !== MEMORY_LINE ? [line] : fills[mode] ? [fills[mode]] : []))
        .join('\n')
    }))
    stable[mode] = system[mode].map(({ text }) => text).join('\n\n')
  }

  const uncovered = uncoveredHours(file.situation.timeOfDay)
  if (uncovered.length > 0) report(characterPath, 'situation.timeOfDay', `no band covers hour ${uncovered.join(', ')}`)
  const timeOfDay = file.situation.timeOfDay.map((band, index) => ({
    ...band,
    text: expand(band.text, characterPath, `situation.timeOfDay[${index}].text`)
  }))
  const judge = {
    lookupQuestion: expand(file.judge.lookupQuestion, characterPath, 'judge.lookupQuestion'),
    moodQuestion: expand(file.judge.moodQuestion, characterPath, 'judge.moodQuestion')
  }

  const isMood = (key: string) => Object.hasOwn(moodsFile.moods, key)
  const isFaceGroup = (group: string) => Object.hasOwn(voiceFile.faces, group)
  const needMood = (key: string, file: string, path: string) => {
    if (!isMood(key)) report(file, path, `unknown mood "${key}"`)
  }
  const beatNames = new Set<string>()
  for (const [index, beat] of voiceFile.beats.entries()) {
    if (beatNames.has(beat.name)) report(voicePath, `beats[${index}].name`, `duplicate beat "${beat.name}"`)
    beatNames.add(beat.name)
  }

  needMood(moodsFile.default, moodsPath, 'default')
  needMood(moodsFile.safe, moodsPath, 'safe')
  if (moodsFile.lateNight) {
    needMood(moodsFile.lateNight.mood, moodsPath, 'lateNight.mood')
    if (
      isMood(moodsFile.lateNight.mood) &&
      !moodsFile.detection.some(({ mood }) => mood === moodsFile.lateNight?.mood)
    ) {
      report(moodsPath, 'lateNight.mood', `"${moodsFile.lateNight.mood}" has no detection rule to relax`)
    }
  }
  for (const [index, rule] of moodsFile.detection.entries()) needMood(rule.mood, moodsPath, `detection[${index}].mood`)
  for (const pair of Object.keys(moodsFile.moodPairs)) {
    const parts = pair.split(':')
    if (parts.length !== 2) report(moodsPath, `moodPairs.${pair}`, 'expected "dominant:runnerUp"')
    else for (const key of parts) needMood(key, moodsPath, `moodPairs.${pair}`)
  }

  const moods: Record<string, Mood> = {}
  for (const [key, mood] of Object.entries(moodsFile.moods)) {
    const at = `moods.${key}`
    for (const [index, group] of mood.faces.entries()) {
      if (!isFaceGroup(group)) report(moodsPath, `${at}.faces[${index}]`, `unknown face group "${group}"`)
    }
    for (const beat of Object.keys(mood.beats)) {
      if (!beatNames.has(beat)) report(moodsPath, `${at}.beats.${beat}`, `unknown beat "${beat}"`)
    }
    for (const [index, portrait] of mood.portraits.entries()) {
      if (!Object.hasOwn(moodsFile.portraitUrls, portrait)) {
        report(moodsPath, `${at}.portraits[${index}]`, `no URL for portrait "${portrait}" in portraitUrls`)
      }
    }
    moods[key] = {
      ...mood,
      prompt: prompt(mood.prompt ?? `moods/${key}`, moodsPath, `${at}.prompt`),
      judge: expand(mood.judge, moodsPath, `${at}.judge`),
      color: Number.parseInt(mood.color.slice(1), 16)
    }
  }

  for (const [style, opener] of Object.entries(voiceFile.openers)) {
    for (const [index, key] of opener.skipMoods.entries())
      needMood(key, voicePath, `openers.${style}.skipMoods[${index}]`)
    if ('moodWords' in opener) {
      for (const key of Object.keys(opener.moodWords)) needMood(key, voicePath, `openers.${style}.moodWords.${key}`)
    }
  }
  for (const [index, group] of voiceFile.hardLineFaces.entries()) {
    if (!isFaceGroup(group)) report(voicePath, `hardLineFaces[${index}]`, `unknown face group "${group}"`)
  }

  const voiceText = (text: string, path: string, slots: readonly string[] = []) => expand(text, voicePath, path, slots)
  const each = <T extends Record<string, string>>(texts: T, path: string, slots: Record<string, string[]> = {}) =>
    Object.fromEntries(
      Object.entries(texts).map(([key, text]) => [key, voiceText(text, `${path}.${key}`, slots[key])])
    ) as T
  const instruction = <T extends { instruction: string }>(opener: T, style: string, slots: string[] = []) => ({
    ...opener,
    instruction: voiceText(opener.instruction, `openers.${style}.instruction`, slots)
  })
  const line = <T extends { line: string }>(item: T, path: string) => ({ ...item, line: voiceText(item.line, path) })
  const { openers, endings } = voiceFile
  const voice: Voice = {
    ...voiceFile,
    lengths: each(voiceFile.lengths, 'lengths'),
    openers: {
      content: instruction(openers.content, 'content'),
      soft: instruction(openers.soft, 'soft', ['word']),
      particle: instruction(openers.particle, 'particle', ['word']),
      gasp: instruction(openers.gasp, 'gasp', ['word']),
      comedy: {
        ...instruction(openers.comedy, 'comedy', ['bit']),
        bits: openers.comedy.bits.map((bit, index) => voiceText(bit, `openers.comedy.bits[${index}]`))
      },
      name: instruction(openers.name, 'name', ['user'])
    },
    endings: {
      statement: line(endings.statement, 'endings.statement.line'),
      question: line(endings.question, 'endings.question.line'),
      aside: line(endings.aside, 'endings.aside.line')
    },
    beats: voiceFile.beats.map((beat, index) => line(beat, `beats[${index}].line`)),
    threats: voiceFile.threats.map(({ text, seen }) => ({ text, seen: new RegExp(seen, 'i') })),
    note: each(voiceFile.note, 'note', {
      length: ['length'],
      open: ['opener'],
      end: ['ending'],
      faces: ['faces'],
      lewd: ['threat'],
      hard: ['threat']
    })
  }

  const slotsAt = (path: string): readonly string[] => {
    const key = path.replace(/\[\d+\]/g, '')
    const covering = Object.keys(LINE_SLOTS).find((slotPath) => key === slotPath || key.startsWith(`${slotPath}.`))
    return covering ? LINE_SLOTS[covering] : []
  }
  const expandLines = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') return expand(value, linesPath, path, slotsAt(path))
    if (Array.isArray(value)) return value.map((item, index) => expandLines(item, `${path}[${index}]`))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, expandLines(item, path ? `${path}.${key}` : key)])
      )
    }
    return value
  }
  const lines = expandLines(linesFile, '') as LinesFile
  const silent = uncoveredHours(lines.status)
  if (silent.length > 0) report(linesPath, 'status', `no band covers hour ${silent.join(', ')}`)

  const situation = prompt('situation', characterPath, 'situation')
  const safetySteer = prompt('safety-steer', characterPath, 'safety-steer')
  if (problems.length > 0) throw new Error(problems.join('\n'))

  return deepFreeze({
    id: file.id,
    name: file.name,
    fullName: file.fullName,
    world: file.world,
    dir: root,
    triggers: file.triggers,
    nameTrigger: new RegExp(`\\b(?:${file.triggers.names.map(escapeRegExp).join('|')})\\b`, 'i'),
    nameTag: new RegExp(`^\\[?${escapeRegExp(file.name)}\\]?:\\s*`, 'i'),
    model: file.model,
    prompts: { system, stable, memoryTools, situation, safetySteer },
    timeOfDay,
    judge,
    moodKeys: Object.keys(moods),
    moods,
    defaultMood: moodsFile.default,
    safeMood: moodsFile.safe,
    lateNight: moodsFile.lateNight,
    detection: moodsFile.detection.map(({ mood, minMatches, patterns }) => ({
      mood,
      minMatches,
      patterns: patterns.map((pattern) => new RegExp(pattern, 'i'))
    })),
    moodPairs: moodsFile.moodPairs,
    portraitUrls: moodsFile.portraitUrls,
    voice,
    lines
  })
}
