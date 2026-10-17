import { character } from '../character/index.js'
import { inHours } from '../character/load.js'
import type { WindowMessage } from '../session/types.js'
import type { ToneKey } from './prompts/tones.js'

/** Rule-based tone detection via the character pack's keyword patterns */

/** Scan the last 3 messages for keyword patterns and return the best-matching tone
 * @param messages - Recent conversation messages
 * @param hour - Current hour (0-23) for time-based tone triggers
 * @returns Matched tone key, or the pack's default mood
 */
export function detectTone(messages: WindowMessage[], hour?: number): ToneKey {
  return detectToneWithSource(messages, hour).tone
}

export function detectToneWithSource(messages: WindowMessage[], hour?: number): { tone: ToneKey; ruleFired: boolean } {
  const recentMessages = messages.slice(-3)
  const text = recentMessages.map((m) => m.content).join(' ')
  const { lateNight } = character

  for (const { mood, patterns, minMatches } of character.detection) {
    const matchCount = patterns.filter((p) => p.test(text)).length

    // The late-night mood fires on a single match during its hours
    if (mood === lateNight?.mood && matchCount >= 1 && matchCount < minMatches && hour !== undefined) {
      if (inHours(hour, lateNight.from, lateNight.to)) return { tone: mood, ruleFired: true }
    }

    if (matchCount >= minMatches) return { tone: mood, ruleFired: true }
  }

  return { tone: character.defaultMood, ruleFired: false }
}
