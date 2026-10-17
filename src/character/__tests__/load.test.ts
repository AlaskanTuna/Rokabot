import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCKED_PROMPTS, loadCharacter } from '../load.js'
import { assembleSystemPrompt } from '../prompt.js'

const ROKA = 'characters/roka'
const HARNESS = 'prompts'
const MINIMAL = 'tests/fixtures/characters/minimal'

const copies: string[] = []
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function copyOf(source = ROKA): string {
  const dir = mkdtempSync(join(tmpdir(), 'rokabot-character-'))
  copies.push(dir)
  cpSync(source, dir, { recursive: true })
  return dir
}

function edit(dir: string, file: string, from: string, to: string): void {
  const path = join(dir, file)
  const text = readFileSync(path, 'utf8')
  if (!text.includes(from)) throw new Error(`${file} does not contain ${from}`)
  writeFileSync(path, text.replace(from, to))
}

function loadError(dir: string): string {
  try {
    loadCharacter(dir, HARNESS)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the pack to fail to load')
}

describe('loadCharacter', () => {
  it('loads Roka with every memory mode of her stable prompt', () => {
    const roka = loadCharacter(ROKA, HARNESS)
    expect(roka.name).toBe('Roka')
    expect(roka.moodKeys[0]).toBe('playful')
    expect(roka.moodKeys).toHaveLength(12)
    expect(roka.prompts.system.full.map(({ name }) => name).at(-1)).toBe('speech')
    expect(roka.prompts.stable.full).toContain('Never prefix your response with your name or any tag like "[Roka]:"')
    expect(roka.prompts.stable.full).toContain('call `remember_user`')
    expect(roka.prompts.stable.forget).toContain('call `forget_user`')
    expect(roka.prompts.stable.forget).not.toContain('remember_user')
    expect(roka.prompts.stable.none).not.toMatch(/remember_user|forget_user|\{\{/)
    expect(roka.detection[0].patterns[0]).toBeInstanceOf(RegExp)
    expect(Object.isFrozen(roka.moods.playful.faces)).toBe(true)
    expect('[Roka]: hi'.replace(roka.nameTag, '')).toBe('hi')
  })

  it('strips exactly one trailing newline from a prompt file and trims nothing else', () => {
    const dir = copyOf()
    writeFileSync(join(dir, 'prompts/intro.md'), '  I am {{char}} of {{world}}.  \n\n')
    writeFileSync(join(dir, 'prompts/moods/playful.md'), '## Playful')
    const roka = loadCharacter(dir, HARNESS)
    expect(roka.prompts.system.full[0].text).toBe('  I am Roka of Hoori.  \n')
    expect(roka.moods.playful.prompt).toBe('## Playful')
  })

  it.each([
    [
      'moods.yml',
      'faces: [happy, teasing, smug]',
      'faces: [happy, smugg, smug]',
      'moods.yml: moods.playful.faces[1]: unknown face group "smugg"'
    ],
    ['moods.yml', '  - mood: flustered', '  - mood: flusterd', 'moods.yml: detection[0].mood: unknown mood "flusterd"'],
    ['moods.yml', 'default: playful', 'default: cheerful', 'moods.yml: default: unknown mood "cheerful"'],
    ['moods.yml', 'safe: sincere', 'safe: solemn', 'moods.yml: safe: unknown mood "solemn"'],
    ['moods.yml', '{ mood: sleepy,', '{ mood: dozy,', 'moods.yml: lateNight.mood: unknown mood "dozy"'],
    [
      'moods.yml',
      'portraits: [smile,',
      'portraits: [smirk,',
      'moods.playful.portraits[0]: no URL for portrait "smirk"'
    ],
    [
      'moods.yml',
      '{ flirt: 0.55, oneesan: 0.25, drama: 0.3 }',
      '{ flirtt: 0.55 }',
      'moods.playful.beats.flirtt: unknown beat "flirtt"'
    ],
    [
      'moods.yml',
      "'domestic:flustered'",
      "'domestic:flustery'",
      'moodPairs.domestic:flustery: unknown mood "flustery"'
    ],
    ['moods.yml', "'\\blove\\b'", "'\\blove(\\b'", 'moods.yml: detection[0].patterns[0]: invalid regular expression'],
    [
      'voice.yml',
      'skipMoods: [sincere, tender, nostalgic]',
      'skipMoods: [sincere, tendr]',
      'voice.yml: openers.particle.skipMoods[1]: unknown mood "tendr"'
    ],
    [
      'voice.yml',
      "{ sleepy: ['Nn...'] }",
      "{ dozy: ['Nn...'] }",
      'voice.yml: openers.soft.moodWords.dozy: unknown mood "dozy"'
    ],
    [
      'voice.yml',
      'hardLineFaces: [furious, pouty]',
      'hardLineFaces: [furios, pouty]',
      'voice.yml: hardLineFaces[0]: unknown face group "furios"'
    ],
    ['character.yml', 'system: [intro,', 'system: [intr,', 'character.yml: prompt.system[0]: no prompt file "intr.md"'],
    ['character.yml', 'temperature: 0.9', 'temperature: hot', 'character.yml: model.temperature:'],
    ['character.yml', 'topP: 0.95', 'topP: 0.95\n  topK: 40', 'character.yml: model: Unrecognized key: "topK"'],
    [
      'character.yml',
      '{ from: 23, to: 5,',
      '{ from: 23, to: 4,',
      'character.yml: situation.timeOfDay: no band covers hour 4'
    ]
  ])('rejects a broken %s: %s', (file, from, to, message) => {
    const dir = copyOf()
    edit(dir, file, from, to)
    expect(loadError(dir)).toContain(message)
  })

  it('rejects a mood with no prompt file', () => {
    const dir = copyOf()
    rmSync(join(dir, 'prompts/moods/playful.md'))
    expect(loadError(dir)).toContain('moods.yml: moods.playful.prompt: no prompt file "moods/playful.md"')
  })

  it('reports every problem at once', () => {
    const dir = copyOf()
    edit(dir, 'moods.yml', 'default: playful', 'default: cheerful')
    edit(dir, 'voice.yml', 'hardLineFaces: [furious, pouty]', 'hardLineFaces: [furios, pouty]')
    expect(loadError(dir).split('\n')).toHaveLength(2)
  })

  it.each(LOCKED_PROMPTS)('refuses a pack that overrides the locked %s prompt', (name) => {
    const dir = copyOf()
    writeFileSync(join(dir, `prompts/${name}.md`), 'Anything goes.\n')
    expect(loadError(dir)).toContain(
      `prompts/${name}.md: ${name}.md is a locked harness prompt; edit prompts/${name}.md instead`
    )
  })

  it('locks the boundaries and the safety redirect', () => {
    expect(LOCKED_PROMPTS).toEqual(['boundaries', 'safety-steer'])
  })

  it('lets a pack override an unlocked harness prompt', () => {
    const dir = copyOf()
    writeFileSync(join(dir, 'prompts/images.md'), '## Images\n- Look closely.\n')
    expect(loadCharacter(dir, HARNESS).prompts.stable.full).toContain(
      '## Images\n- Look closely.\n\n## Audio and Video'
    )
  })

  it.each([
    ['prompts/intro.md', 'Hi {{nope}}\n', 'prompts/intro.md: unknown macro {{nope}}'],
    ['prompts/intro.md', 'Hi {{user}}\n', 'prompts/intro.md: unknown macro {{user}}; it works only in situation.md'],
    [
      'prompts/tools.md',
      '## Using Tools\n- {{memory_tools}}\n',
      'prompts/tools.md: {{memory_tools}} must be on a line of its own'
    ],
    [
      'prompts/images.md',
      '{{memory_tools}}\n',
      'prompts/images.md: unknown macro {{memory_tools}}; it works only in tools.md'
    ]
  ])('rejects a misplaced macro in %s', (file, text, message) => {
    const dir = copyOf()
    writeFileSync(join(dir, file), text)
    expect(loadError(dir)).toContain(message)
  })

  it('rejects a slot used outside its line of voice.yml and fills the character macros there', () => {
    const dir = copyOf()
    edit(dir, 'voice.yml', "header: '## Reply Shape'", "header: '## Reply Shape {{threat}}'")
    expect(loadError(dir)).toContain('voice.yml: note.header: unknown macro {{threat}}')
    edit(dir, 'voice.yml', "header: '## Reply Shape {{threat}}'", "header: '## {{char}} Reply Shape'")
    expect(loadCharacter(dir, HARNESS).voice.note.header).toBe('## Roka Reply Shape')
  })

  it('loads her lines with the character macros filled and the slots left for code to fill', () => {
    const roka = loadCharacter(ROKA, HARNESS)
    expect(roka.lines.commands.ask).toBe('Ask Roka anything — she looks things up when she needs to')
    expect(roka.lines.reminders.delivered).toBe('Hey {{mention}}~ you asked me to remind you: "{{task}}" ♪')
    expect(roka.lines.replies.decline).toHaveLength(5)
    expect(Object.isFrozen(roka.lines.status[0].lines)).toBe(true)
  })

  it('refuses a pack without lines.yml rather than posting default English lines', () => {
    const dir = copyOf(MINIMAL)
    rmSync(join(dir, 'lines.yml'))
    expect(loadError(dir)).toContain('lines.yml: file is missing')
  })

  it.each([
    ['decline: [One moment please.]', 'decline: []', 'lines.yml: replies.decline: Too small'],
    [
      'busy: [Still thinking.]',
      "busy: ['Still thinking about {{task}}.']",
      'lines.yml: replies.busy[0]: unknown macro {{task}}'
    ],
    [
      'noSchedule: Nothing found.',
      'noSchedule: Nothing found for {{search}}.',
      'lines.yml: tools.noSchedule: unknown macro {{search}}'
    ],
    ['{ from: 18, to: 6,', '{ from: 18, to: 5,', 'lines.yml: status: no band covers hour 5'],
    ['ask: Ask {{char}} anything', `ask: ${'Ask '.repeat(30)}`, 'lines.yml: commands.ask: Too big'],
    ['    misc: ', '    miscellany: ', 'lines.yml: stats.remembers.misc:'],
    [
      '  notYours: Those buttons are not yours.',
      '  notYour: Those buttons are not yours.',
      'Unrecognized key: "notYour"'
    ]
  ])('rejects a broken lines.yml: %s', (from, to, message) => {
    const dir = copyOf(MINIMAL)
    edit(dir, 'lines.yml', from, to)
    expect(loadError(dir)).toContain(message)
  })

  it('rejects a command description that passes as written but grows past 100 characters once {{char}} is filled', () => {
    const dir = copyOf(MINIMAL)
    edit(dir, 'character.yml', 'name: Mina', 'name: Mina Mirai')
    edit(dir, 'lines.yml', 'ask: Ask {{char}} anything', `ask: Ask {{char}} ${'a'.repeat(87)}`)
    expect(loadError(dir)).toContain(
      'lines.yml: commands.ask: 102 characters once its macros are filled; Discord allows 100, so shorten it'
    )
  })

  it('accepts a command description that is exactly 100 characters once {{char}} is filled', () => {
    const dir = copyOf(MINIMAL)
    edit(dir, 'character.yml', 'name: Mina', 'name: Mina Mirai')
    edit(dir, 'lines.yml', 'ask: Ask {{char}} anything', `ask: Ask {{char}} ${'a'.repeat(85)}`)
    expect(loadCharacter(dir, HARNESS).lines.commands.ask).toBe(`Ask Mina Mirai ${'a'.repeat(85)}`)
    expect(loadCharacter(dir, HARNESS).lines.commands.ask).toHaveLength(100)
  })

  it('loads a second character that uses only the harness prompts and one mood', () => {
    const mina = loadCharacter(MINIMAL, HARNESS)
    expect(mina.moodKeys).toEqual(['calm'])
    expect(mina.nameTrigger.test('hey MINA, you there?')).toBe(true)
    expect(mina.nameTrigger.test('Minami said hi')).toBe(false)
    expect(mina.judge.moodQuestion).toBe('Which mood should Mina reply to `message` in?')
    expect(mina.lines.commands.ask).toBe('Ask Mina anything')
    const prompt = assembleSystemPrompt(mina, { mood: 'calm', hour: 10, displayName: 'Ikuyo', memory: 'none' })
    expect(prompt).toContain('You are Mina, not an AI assistant.')
    expect(prompt).toContain('as anything about Testville')
    expect(prompt).toContain('## Current Mood: Calm\n- Speak evenly and kindly.\n\n## Situation')
    expect(prompt).toContain("- It's currently daytime.")
    expect(prompt).toContain('named "Ikuyo"')
    expect(prompt).not.toMatch(/Roka|Hoori|remember_user|\{\{/)
    expect(assembleSystemPrompt(mina, { mood: 'calm', hour: 2, displayName: 'Ikuyo', memory: 'full' })).toMatch(
      /remember_user[\s\S]*It's currently night\./
    )
  })
})
