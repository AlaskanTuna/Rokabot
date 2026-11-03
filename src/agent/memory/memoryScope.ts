import type { MemoryPrivacy } from '../../config.js'

/** The three memory states a turn can run in: `/ask` reads nothing, privacy `off` keeps forget only. */
export type MemoryScope = 'none' | 'full' | 'forget'

/** The one constructor for `MemoryScope`: the Discord-facing `memory` boolean plus the privacy level. */
export function resolveMemoryScope(memory: boolean, privacy: MemoryPrivacy): MemoryScope {
  if (!memory) return 'none'
  return privacy === 'off' ? 'forget' : 'full'
}
