/** Layer 2: Conversation tone variants selected by tone detection */
import { type ToneKey, character } from '../../character/index.js'

export type { ToneKey }

export const TONE_PROMPTS: Readonly<Record<ToneKey, string>> = Object.freeze(
  Object.fromEntries(character.moodKeys.map((mood) => [mood, character.moods[mood].prompt]))
)
