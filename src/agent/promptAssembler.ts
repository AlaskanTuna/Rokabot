import { buildContextPrompt } from './prompts/context.js'
import { CORE_PROMPT, FORGET_USER_GUIDANCE } from './prompts/core.js'
import { SPEECH_PROMPT } from './prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from './prompts/tones.js'

export interface AssemblerInput {
  tone: ToneKey
  hour: number
  displayName: string
  includeForgetUser?: boolean
}

/** Assemble the full system prompt from all 4 layers */
export function assembleSystemPrompt(input: AssemblerInput): string {
  const corePrompt =
    input.includeForgetUser === false ? CORE_PROMPT.replace(`\n${FORGET_USER_GUIDANCE}`, '') : CORE_PROMPT
  const layers = [
    corePrompt,
    SPEECH_PROMPT,
    TONE_PROMPTS[input.tone],
    buildContextPrompt(input.hour, input.displayName)
  ]

  return layers.join('\n\n')
}
