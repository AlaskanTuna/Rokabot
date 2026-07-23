/** Store a fact about a user for future reference */

import { countFacts, saveFact } from '../../storage/userMemory.js'
import { logger } from '../../utils/logger.js'
import { assertClaim } from '../memory/memoryClaims.js'

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
  saveFact(guild_id, user_id, fact_key, fact_value)
  if (guild_id !== 'global') {
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
    }
  }
  const total = countFacts(guild_id, user_id)
  return {
    success: true,
    message: `Remembered ${fact_key} for ${user_id}.`,
    totalFacts: total
  }
}
