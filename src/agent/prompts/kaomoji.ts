/** The character's kaomoji, grouped by feeling, and which groups each mood draws its faces from. */
import { character } from '../../character/index.js'
import type { ToneKey } from './tones.js'

/** A face group named in the character pack's voice.yml. */
export type FaceGroup = string

export const FACES: Readonly<Record<FaceGroup, readonly string[]>> = character.voice.faces

/** Which feelings each mood draws its faces from. */
export const TONE_FACES: Readonly<Record<ToneKey, readonly FaceGroup[]>> = Object.freeze(
  Object.fromEntries(character.moodKeys.map((mood) => [mood, character.moods[mood].faces]))
)
