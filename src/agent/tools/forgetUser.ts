import { findMediaSharedBy, forgetMediaForUser } from '../../storage/mediaDigestStore.js'
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
  const mediaMatches = terms.length === 0 ? [] : findMediaSharedBy(guild_id, user_id, terms, 4)
  const matchCount = matches.length + mediaMatches.length

  if (matchCount === 0) {
    return { success: false, message: "I couldn't find a matching note to forget." }
  }

  const notes = [
    ...matches.map(
      ({ predicate, value }) => `${predicate} "${sensitiveFactReason(predicate, value) ? 'a sensitive note' : value}"`
    ),
    ...mediaMatches.map(({ label, summary }) => `media "${label}: ${summary.slice(0, 60)}"`)
  ].join(', ')

  if (matchCount > 3) {
    return { success: false, message: `I found several matching notes: ${notes}. Which one did you mean?` }
  }

  if (
    matches.length > 0 &&
    !rejectClaimIdsForSpeaker(
      guild_id,
      user_id,
      matches.map(({ id }) => id)
    )
  ) {
    return { success: false, message: "I couldn't find a matching note to forget." }
  }
  forgetMediaForUser(
    guild_id,
    user_id,
    mediaMatches.map(({ id }) => id)
  )

  return { success: true, message: `I forgot these notes: ${notes}.` }
}
