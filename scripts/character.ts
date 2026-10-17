/** Validate a character pack, or print the system prompt it assembles for one turn. */
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { type Character, type MemoryMode, loadCharacter } from '../src/character/load.js'
import { HARNESS_DIR, resolveCharacterDir } from '../src/character/paths.js'
import { assembleSystemPrompt } from '../src/character/prompt.js'
import { estimateTokens } from '../src/utils/tokens.js'

const USAGE = `Usage:
  npm run character -- check [dir]
  npm run character -- preview [dir] [--mood <mood>] [--hour <0-23>] [--memory full|forget|none]`

const MEMORY_MODES: readonly MemoryMode[] = ['full', 'forget', 'none']

function summary(character: Character): string {
  const faces = Object.values(character.voice.faces).flat().length
  const tokens = MEMORY_MODES.map((mode) => `${mode} ~${estimateTokens(character.prompts.stable[mode])}`)
  return [
    `${character.name} (${character.id}) from ${relative(process.cwd(), character.dir) || '.'}`,
    `- ${character.moodKeys.length} moods: ${character.moodKeys.join(', ')}`,
    `- ${faces} faces in ${Object.keys(character.voice.faces).length} groups`,
    `- Stable prompt tokens by memory mode: ${tokens.join(', ')}`
  ].join('\n')
}

export function main(argv: readonly string[], write: (text: string) => void = console.log): number {
  let parsed: { values: { mood?: string; hour?: string; memory?: string }; positionals: string[] }
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { mood: { type: 'string' }, hour: { type: 'string' }, memory: { type: 'string' } }
    })
  } catch (error) {
    write(`${(error as Error).message}\n${USAGE}`)
    return 1
  }
  const { values, positionals } = parsed
  const [command, dir] = positionals
  if ((command !== 'check' && command !== 'preview') || positionals.length > 2) {
    write(USAGE)
    return 1
  }
  const characterDir = dir ? resolve(dir) : resolveCharacterDir()
  let character: Character
  try {
    character = loadCharacter(characterDir, HARNESS_DIR)
  } catch (error) {
    write(`${relative(process.cwd(), characterDir) || '.'} is not a valid character pack:`)
    write((error as Error).message)
    return 1
  }
  if (command === 'check') {
    write(summary(character))
    return 0
  }

  const mood = values.mood ?? character.defaultMood
  const hour = values.hour === undefined ? new Date().getHours() : Number(values.hour)
  const memory = (values.memory ?? 'full') as MemoryMode
  const problems = [
    character.moodKeys.includes(mood) ? '' : `--mood must be one of ${character.moodKeys.join(', ')}`,
    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? '' : '--hour must be a whole hour from 0 to 23',
    MEMORY_MODES.includes(memory) ? '' : `--memory must be one of ${MEMORY_MODES.join(', ')}`
  ].filter(Boolean)
  if (problems.length > 0) {
    write(problems.join('\n'))
    return 1
  }
  write(assembleSystemPrompt(character, { mood, hour, displayName: 'User', memory }))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
