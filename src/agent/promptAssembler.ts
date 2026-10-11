import { buildContextPrompt } from './prompts/context.js'
import { CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE } from './prompts/core.js'
import { SPEECH_PROMPT } from './prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from './prompts/tones.js'

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
  const layers = [
    input.memory ? (input.forgetOnly ? CORE_PROMPT_FORGET_ONLY : CORE_PROMPT) : CORE_PROMPT_MEMORY_FREE,
    SPEECH_PROMPT,
    TONE_PROMPTS[input.tone],
    buildContextPrompt(input.hour, input.displayName)
  ]

  return layers.join('\n\n')
}

const STABLE_PREFIXES = [CORE_PROMPT, CORE_PROMPT_FORGET_ONLY, CORE_PROMPT_MEMORY_FREE].map(
  (core) => `${core}\n\n${SPEECH_PROMPT}`
)

/** Splits off the core and speech layers, which never change between turns, so a provider can cache them. */
export function splitStablePrefix(prompt: string): { stable: string; rest: string } | undefined {
  const stable = STABLE_PREFIXES.find((prefix) => prompt.startsWith(prefix))
  return stable === undefined ? undefined : { stable, rest: prompt.slice(stable.length) }
}
