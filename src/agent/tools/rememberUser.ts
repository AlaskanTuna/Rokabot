/** Store a fact about a user for future reference */

import { logger } from '../../utils/logger.js'
import { assertClaim, getActiveClaims } from '../memory/memoryClaims.js'
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
  const totalFacts = guild_id === 'global' ? 0 : getActiveClaims(guild_id, user_id).length

  if (guild_id === 'global') {
    return {
      success: false,
      message: "I couldn't tell where we are right now, so I didn't save that.",
      totalFacts: 0
    }
  }

  // Being asked directly is exactly the case where a silent drop would have her say "remembered" about nothing.
  const sensitive = sensitiveFactReason(fact_key, fact_value)
  if (sensitive) {
    logger.info({ factKey: fact_key, reason: sensitive }, 'Refused to store a sensitive fact')
    return {
      success: false,
      message: 'Not saved — that is contact, account or credential detail, which I never write down.',
      totalFacts
    }
  }
  try {
    assertClaim({
      guildId: guild_id,
      subjectUserId: user_id,
      predicate: fact_key,
      value: fact_value,
      sourceKind: 'explicit'
    })
  } catch {
    logger.warn({ factKey: fact_key }, 'Explicit memory fact was not written to claims')
    return {
      success: false,
      message: 'Not saved — I could not keep that one as it was written.',
      totalFacts
    }
  }

  const total = getActiveClaims(guild_id, user_id).length
  return {
    success: true,
    message: `Remembered ${fact_key} for ${user_id}.`,
    totalFacts: total
  }
}
