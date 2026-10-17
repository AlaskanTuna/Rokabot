import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diffLines } from 'diff'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import { addItem, deleteNode, removeItem, setNode, setScalar, spellFlow } from '../yamlEdit'

const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
const voice = readFileSync(join(repo, 'characters/roka/voice.yml'), 'utf8')
const config = readFileSync(join(repo, 'config.yml'), 'utf8')
const character = readFileSync(join(repo, 'characters/roka/character.yml'), 'utf8')

const js = (text: string) => parseDocument(text).toJS()
const changed = (before: string, after: string) =>
  diffLines(before, after)
    .filter((part) => part.added || part.removed)
    .map((part) => `${part.added ? '+' : '-'}${part.value}`)

describe('yamlEdit keeps every byte it does not change', () => {
  it('setScalar rewrites one value and keeps its inline comment', () => {
    const next = setScalar(config, ['llm', 'main'], 'flash')
    expect(js(next).llm.main).toBe('flash')
    expect(changed(config, next)).toEqual([
      '-  main: haiku # Required; a key under llm.models (LLM_MAIN overrides)\n',
      '+  main: flash # Required; a key under llm.models (LLM_MAIN overrides)\n'
    ])
  })

  it('setScalar quotes a value that would not read back as itself', () => {
    const next = setScalar(character, ['name'], 'Ro: ka # not a comment')
    expect(js(next).name).toBe('Ro: ka # not a comment')
    expect(changed(character, next)).toHaveLength(2)
  })

  it('addItem and removeItem edit a flow list in place', () => {
    const added = addItem(voice, ['openers', 'particle', 'words'], 'Ehe~')
    expect(js(added).openers.particle.words.at(-1)).toBe('Ehe~')
    expect(changed(voice, added)).toHaveLength(2)
    const removed = removeItem(added, ['openers', 'particle', 'words'], 4)
    expect(removed).toBe(voice)
    expect(removeItem(voice, ['openers', 'soft', 'words'], 0)).not.toContain("['Oh,',")
  })

  it('addItem and removeItem edit a block list in place', () => {
    const path = ['openers', 'comedy', 'bits']
    const added = addItem(voice, path, 'a dramatic sigh')
    expect(js(added).openers.comedy.bits.at(-1)).toBe('a dramatic sigh')
    expect(changed(voice, added)).toEqual(['+      - a dramatic sigh\n'])
    expect(removeItem(added, path, 3)).toBe(voice)
  })

  it('addItem and removeItem edit a list of flow maps in place', () => {
    const path = ['situation', 'timeOfDay']
    const band = { from: 0, to: 0, text: '' }
    const added = addItem(character, path, band)
    expect(js(added).situation.timeOfDay.at(-1)).toEqual(band)
    expect(changed(character, added)).toEqual(["+    - { from: 0, to: 0, text: '' }\n"])
    expect(removeItem(added, path, 7)).toBe(character)
    expect(changed(character, removeItem(character, path, 0))).toHaveLength(1)
  })

  it('removeItem leaves an empty flow list when a block list loses its last item', () => {
    const path = ['openers', 'comedy', 'bits']
    let next = voice
    for (const _ of js(voice).openers.comedy.bits) next = removeItem(next, path, 0)
    expect(js(next).openers.comedy.bits).toEqual([])
    expect(changed(voice, next)).toEqual([
      '-    bits:\n      - mock innocence, all wide eyes, as if you had no idea what they meant\n      - a loud comeback at what they just said\n      - a burst of melodramatic self-pity\n',
      '+    bits: []\n'
    ])
  })

  it('setScalar writes a value typed into an empty string plain', () => {
    const added = addItem(character, ['triggers', 'names'], '')
    expect(setScalar(added, ['triggers', 'names', 1], 'rokachan')).toBe(
      character.replace('names: [roka]', 'names: [roka, rokachan]')
    )
  })

  it('setNode appends a new map entry after its siblings in flow style', () => {
    const entry = { provider: 'openai-compatible', model: 'qwen3:32b', baseUrl: 'http://localhost:11434/v1' }
    const next = setNode(config, ['llm', 'models', 'local2'], entry)
    expect(js(next).llm.models.local2).toEqual(entry)
    const diff = changed(config, next)
    expect(diff.every((line) => line.startsWith('+') || line.startsWith('-'))).toBe(true)
    expect(next.split('\n').length).toBe(config.split('\n').length + 1)
    expect(next).toContain(
      '    local2: { provider: openai-compatible, model: qwen3:32b, baseUrl: http://localhost:11434/v1 }\n'
    )
  })

  it('setNode respells a flow list in place', () => {
    const next = setNode(character, ['prompt', 'system'], ['intro', 'speech'])
    expect(js(next).prompt.system).toEqual(['intro', 'speech'])
    expect(changed(character, next)).toHaveLength(2)
  })

  it('deleteNode cuts a key with the comment lines above it', () => {
    const next = deleteNode(voice, ['openers', 'gasp'])
    expect(js(next).openers.gasp).toBeUndefined()
    expect(js(next).openers.comedy).toEqual(js(voice).openers.comedy)
    expect(changed(voice, next)).toHaveLength(1)
    const back = setNode(next, ['llm'], null)
    expect(js(back).llm).toBeNull()
  })

  it('spellFlow quotes only what needs it', () => {
    expect(spellFlow(['Oh,', 'Ara~', 'true', 3])).toBe("['Oh,', Ara~, 'true', 3]")
    expect(spellFlow({ a: '', b: [] })).toBe("{ a: '', b: [] }")
  })
})
