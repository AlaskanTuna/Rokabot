/** Store a fact about a user for future reference */

import { countFacts, saveFact } from '../../storage/userMemory.js'
import { logger } from '../../utils/logger.js'
import { assertClaim } from '../memory/memoryClaims.js'
import { sensitiveFactReason } from '../memory/privacyGuard.js'

export interface RememberUserParams {
  user_id: string
  guild_id: string
  fact_key: string
  fact_value: string
}

export interface RememberUserResult {
  success: boolean
  message: string
  totalFacts: number
}

/** Save a fact about a user, evicting the oldest when capped */
export function rememberUser(params: RememberUserParams): RememberUserResult {
  const { user_id, guild_id, fact_key, fact_value } = params
  // Refuse before either store is touched, and report the refusal: being asked directly is exactly the
  // case where a silent drop would have her say "remembered" about something she never kept.
  const sensitive = sensitiveFactReason(fact_key, fact_value)
  if (sensitive) {
    logger.info({ factKey: fact_key, reason: sensitive }, 'Refused to store a sensitive fact')
    return {
      success: false,
      message: 'Not saved — that is contact, account or credential detail, which I never write down.',
      totalFacts: countFacts(guild_id, user_id)
    }
  }
  const storedFact = saveFact(guild_id, user_id, fact_key, fact_value)
  let storedClaim = false
  if (guild_id !== 'global') {
    try {
      assertClaim({
        guildId: guild_id,
        subjectUserId: user_id,
        predicate: fact_key,
        value: fact_value,
        sourceKind: 'explicit'
      })
      storedClaim = true
    } catch {
      logger.warn({ factKey: fact_key }, 'Explicit memory fact was not written to claims')
    }
  }
  // Both outcomes were previously discarded, so a fact neither store accepted still came back as
  // "Remembered". Report on the pair rather than on saveFact alone: the two guards do not agree —
  // saveFact rejects an unsafe key as well as an unsafe value, while the claim path checks only the
  // value and lets normalizePredicate fold an awkward key into `misc`. A verbose fact_key must not
  // cost the explicit claim, since that claim is the only thing this tool exists to write.
  if (!storedFact && !storedClaim) {
    logger.info({ factKey: fact_key }, 'Refused to store a fact that failed the prompt-safety guard')
    return {
      success: false,
      message: 'Not saved — I could not keep that one as it was written.',
      totalFacts: countFacts(guild_id, user_id)
    }
  }
  const total = countFacts(guild_id, user_id)
  return {
    success: true,
    message: `Remembered ${fact_key} for ${user_id}.`,
    totalFacts: total
  }
}
