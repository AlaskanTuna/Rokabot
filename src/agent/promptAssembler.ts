import { buildContextPrompt } from './prompts/context.js'
import { CORE_PROMPT, CORE_PROMPT_MEMORY_FREE } from './prompts/core.js'
import { SPEECH_PROMPT } from './prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from './prompts/tones.js'

export interface AssemblerInput {
  tone: ToneKey
  hour: number
  displayName: string
  /** `/ask` turns carry no memory tools, so the kernel drops the guidance that names them (#207). */
  memory: boolean
}

/** Assemble the full system prompt from all 4 layers */
export function assembleSystemPrompt(input: AssemblerInput): string {
  const layers = [
    input.memory ? CORE_PROMPT : CORE_PROMPT_MEMORY_FREE,
    SPEECH_PROMPT,
    TONE_PROMPTS[input.tone],
    buildContextPrompt(input.hour, input.displayName)
  ]

  return layers.join('\n\n')
}
