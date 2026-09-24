import { rejectClaimIdsForSpeaker, searchClaims } from '../memory/memoryClaims.js'
import { sensitiveFactReason } from '../memory/privacyGuard.js'

export interface ForgetUserParams {
  user_id: string
  guild_id: string
  query: string
}

export interface ForgetUserResult {
  success: boolean
  message: string
}

export function forgetUser(params: ForgetUserParams): ForgetUserResult {
  const { user_id, guild_id, query } = params
  const terms = query.match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 6) ?? []
  const ftsQuery = terms.map((term) => `"${term}"`).join(' ')
  const matches = searchClaims(guild_id, user_id, ftsQuery, 4)

  if (matches.length === 0) {
    return { success: false, message: "I couldn't find a matching note to forget." }
  }

  const notes = matches
    .map(
      ({ predicate, value }) => `${predicate} "${sensitiveFactReason(predicate, value) ? 'a sensitive note' : value}"`
    )
    .join(', ')

  if (matches.length > 3) {
    return { success: false, message: `I found several matching notes: ${notes}. Which one did you mean?` }
  }

  if (
    !rejectClaimIdsForSpeaker(
      guild_id,
      user_id,
      matches.map(({ id }) => id)
    )
  ) {
    return { success: false, message: "I couldn't find a matching note to forget." }
  }

  return { success: true, message: `I forgot these notes: ${notes}.` }
}
