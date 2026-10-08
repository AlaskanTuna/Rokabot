import { type MemoryPrivacy, config } from '../../config.js'
import { channelVisibility } from './channelVisibility.js'

export type RecallScope = Readonly<{ guildId: string; channelId: string }>

/** The one privacy check for long-term memory: may an item learned in `sources` be recalled `here`? */
export function canRecall(
  sources: readonly (string | null)[],
  here: RecallScope,
  level: MemoryPrivacy = config.memory.privacy
): boolean {
  if (level === 'off') return false
  if (level === 'relaxed') return true
  const resolver = channelVisibility()
  const parent = resolver.parentOf(here.channelId)
  return (sources.length === 0 ? [null] : sources).some((source) => {
    if (source === null) return level === 'balanced'
    if (source === here.channelId || source === parent) return true
    return level === 'balanced' && resolver.visibility(source) === 'public'
  })
}
