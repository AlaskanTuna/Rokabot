import { loadCharacter } from './load.js'
import { HARNESS_DIR, resolveCharacterDir } from './paths.js'

export type { Character, MemoryMode, Mood } from './load.js'

/** The character this process runs as, loaded and validated once at startup. */
export const character = loadCharacter(resolveCharacterDir(), HARNESS_DIR)
