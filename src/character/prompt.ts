import { type Character, type MemoryMode, inHours } from './load.js'

export interface SystemPromptInput {
  mood: string
  hour: number
  displayName: string
  memory: MemoryMode
}

export function timeOfDay(character: Character, hour: number): string {
  const bands = character.timeOfDay
  return (bands.find(({ from, to }) => inHours(hour, from, to)) ?? bands[bands.length - 1]).text
}

export function situationPrompt(character: Character, hour: number, displayName: string): string {
  return character.prompts.situation.replace(/\{\{(user|time_of_day)\}\}/g, (_, slot: string) =>
    slot === 'user' ? displayName : timeOfDay(character, hour)
  )
}

/** The stable sections, then the mood, then the situation: the order a provider's prompt cache depends on. */
export function assembleSystemPrompt(character: Character, input: SystemPromptInput): string {
  return [
    character.prompts.stable[input.memory],
    character.moods[input.mood]?.prompt,
    situationPrompt(character, input.hour, input.displayName)
  ].join('\n\n')
}
