/** Layer 3: Dynamically generated situational context */
import { character } from '../../character/index.js'
import { situationPrompt } from '../../character/prompt.js'

// No roster of who else is around, deliberately (#52). The line named recent speakers — precisely the set
// memory-tools.md's recall_user rule ends by excluding ("Someone who only appears earlier in the conversation is
// not a reason to call it") — and reframed absent third parties as participants. Paired A/B, same key and
// pinned hour, 2026-08-22: recall 1.000 -> 0.722 (Fisher one-sided p = 0.023), below the gate's own 0.80
// floor, against precision 0.947 -> 1.000. Measured once before at 0.389; the cost is real and reproduces,
// the magnitude does not. The speaker's own name is kept — that part was never in question.

/** Build the situational context layer */
export function buildContextPrompt(hour: number, displayName: string): string {
  return situationPrompt(character, hour, displayName)
}
