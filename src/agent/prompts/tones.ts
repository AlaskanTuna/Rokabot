/** Layer 2: Conversation tone variants selected by tone detection */
import { character } from '../../character/index.js'

/** A mood named in the character pack's moods.yml. */
export type ToneKey = string

export const TONE_PROMPTS: Readonly<Record<ToneKey, string>> = Object.freeze(
  Object.fromEntries(character.moodKeys.map((mood) => [mood, character.moods[mood].prompt]))
)
