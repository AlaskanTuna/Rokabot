import { buildContextPrompt } from './prompts/context.js'
import { CORE_PROMPT } from './prompts/core.js'
import { SPEECH_PROMPT } from './prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from './prompts/tones.js'

export interface AssemblerInput {
  tone: ToneKey
  participants: string[]
  hour: number
  displayName: string
}

/** Assemble the full system prompt from all 4 layers */
export function assembleSystemPrompt(input: AssemblerInput): string {
  const layers = [
    CORE_PROMPT,
    SPEECH_PROMPT,
    TONE_PROMPTS[input.tone],
    buildContextPrompt(input.participants, input.hour, input.displayName)
  ]

  return layers.join('\n\n')
}
