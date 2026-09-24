import { retractClaim, searchClaims } from '../memory/memoryClaims.js'
import { sensitiveFactReason } from '../memory/privacyGuard.js'

export interface ForgetUserParams {
  user_id: string
  guild_id: string
  message: string
}

export interface ForgetUserResult {
  success: boolean
  message: string
}

export function forgetUser(params: ForgetUserParams): ForgetUserResult {
  const { user_id, guild_id, message } = params
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12)
  const ftsQuery = terms.map((term) => `"${term}"`).join(' OR ')
  const match = searchClaims(guild_id, user_id, ftsQuery, 1)[0]

  if (
    !match ||
    !retractClaim({
      guildId: guild_id,
      subjectUserId: user_id,
      predicate: match.predicate,
      value: match.value
    })
  ) {
    return { success: false, message: "I couldn't find a matching active note to forget." }
  }

  if (sensitiveFactReason(match.predicate, match.value)) {
    return { success: true, message: 'I removed that sensitive note.' }
  }

  return { success: true, message: `I forgot the ${match.predicate} note “${match.value}”.` }
}
