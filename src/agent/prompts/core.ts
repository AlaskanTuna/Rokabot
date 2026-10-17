/** Layer 0: the character pack's stable sections before its speech section, per memory mode. */
import { character } from '../../character/index.js'
import type { MemoryMode } from '../../character/load.js'

const coreOf = (mode: MemoryMode) =>
  character.prompts.system[mode]
    .filter(({ name }) => name !== 'speech')
    .map(({ text }) => text)
    .join('\n\n')

export const MEMORY_TOOL_RULES = character.prompts.memoryTools

export const CORE_PROMPT = coreOf('full')

/**
 * The same kernel with the memory tools' guidance cut out. A `/ask` turn carries none of those
 * declarations, so describing them here would spend prompt on instructions she cannot act on (#207).
 */
export const CORE_PROMPT_MEMORY_FREE = coreOf('none')

/** With long-term memory off only `forget_user` is still offered, so only its guidance stays. */
export const CORE_PROMPT_FORGET_ONLY = coreOf('forget')
