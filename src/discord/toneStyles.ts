import type { ToneKey } from '../agent/prompts/tones.js'
import { character } from '../character/index.js'

interface ToneStyle {
  color: number
  imageUrl: string
}

const TONE_STYLES: Readonly<Record<ToneKey, ToneStyle>> = Object.fromEntries(
  character.moodKeys.map((mood) => [
    mood,
    { color: character.moods[mood].color, imageUrl: character.moods[mood].placeholder }
  ])
)

export function getToneStyle(tone: ToneKey): ToneStyle {
  return TONE_STYLES[tone]
}
