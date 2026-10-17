import { character } from '../character/index.js'
import { assembleSystemPrompt as assembleForCharacter } from '../character/prompt.js'
import type { ToneKey } from './prompts/tones.js'

export interface AssemblerInput {
  tone: ToneKey
  hour: number
  displayName: string
  /** `/ask` turns carry no memory tools, so the kernel drops the guidance that names them (#207). */
  memory: boolean
  /** `memory.privacy: off` withholds remember_user and recall_user but still offers forget_user. */
  forgetOnly?: boolean
}

/** Assemble the full system prompt from all 4 layers */
export function assembleSystemPrompt(input: AssemblerInput): string {
  return assembleForCharacter(character, {
    mood: input.tone,
    hour: input.hour,
    displayName: input.displayName,
    memory: input.memory ? (input.forgetOnly ? 'forget' : 'full') : 'none'
  })
}

const STABLE_PREFIXES = [character.prompts.stable.full, character.prompts.stable.forget, character.prompts.stable.none]

/** Splits off the core and speech layers, which never change between turns, so a provider can cache them. */
export function splitStablePrefix(prompt: string): { stable: string; rest: string } | undefined {
  const stable = STABLE_PREFIXES.find((prefix) => prompt.startsWith(prefix))
  return stable === undefined ? undefined : { stable, rest: prompt.slice(stable.length) }
}
