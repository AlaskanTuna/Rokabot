/** Layer 1: Speech patterns, verbal style, and dialogue flavor */
import { character } from '../../character/index.js'

export const SPEECH_PROMPT = character.prompts.system.full.find(({ name }) => name === 'speech')?.text ?? ''
