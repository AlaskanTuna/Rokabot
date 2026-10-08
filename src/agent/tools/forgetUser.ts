import { config } from '../../config.js'
import { findMediaSharedBy, forgetMediaForUser } from '../../storage/mediaDigestStore.js'
import { getClaimSourceChannels } from '../../storage/memoryRecallStore.js'
import { rejectClaimIdsForSpeaker, searchClaims } from '../memory/memoryClaims.js'
import { type RecallScope, canRecall } from '../memory/privacy.js'
import { sensitiveFactReason } from '../memory/privacyGuard.js'

export interface ForgetUserParams {
  user_id: string
  guild_id: string
  query: string
  channel_id?: string
}

export interface ForgetUserResult {
  success: boolean
  message: string
}

export function forgetUser(params: ForgetUserParams): ForgetUserResult {
  const { user_id, guild_id, query, channel_id } = params
  const terms = query.match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 6) ?? []
  const ftsQuery = terms.map((term) => `"${term}"`).join(' ')
  const matches = searchClaims(guild_id, user_id, ftsQuery, 4)
  const mediaMatches = terms.length === 0 ? [] : findMediaSharedBy(guild_id, user_id, terms, 4)
  const matchCount = matches.length + mediaMatches.length

  if (matchCount === 0) {
    return { success: false, message: "I couldn't find a matching note to forget." }
  }

  const level = config.memory.privacy
  const scope: RecallScope | undefined = channel_id ? { guildId: guild_id, channelId: channel_id } : undefined
  const claimSources = getClaimSourceChannels(matches.map(({ id }) => id))
  const visibleMatches = matches.filter(({ id }) => {
    if (level === 'relaxed') return true
    if (level === 'off' || !scope) return false
    return canRecall(claimSources.get(id) ?? [null], scope, level)
  })
  const visibleMediaMatches = mediaMatches.filter(({ channelIds }) => {
    if (level === 'relaxed') return true
    if (level === 'off' || !scope) return false
    return canRecall(channelIds.length > 0 ? channelIds : [''], scope, level)
  })
  const visibleNotes = [
    ...visibleMatches.map(
      ({ predicate, value }) => `${predicate} "${sensitiveFactReason(predicate, value) ? 'a sensitive note' : value}"`
    ),
    ...visibleMediaMatches.map(({ label, summary }) => `media "${label}: ${summary.slice(0, 60)}"`)
  ]
  const hiddenCount = matchCount - visibleNotes.length
  const countPhrase = (count: number) => `${count} other ${count === 1 ? 'note' : 'notes'}`
  const notes = [
    ...visibleNotes,
    ...(hiddenCount > 0 && visibleNotes.length > 0 ? [`and ${countPhrase(hiddenCount)}`] : [])
  ].join(', ')

  if (matchCount > 3) {
    if (level !== 'relaxed' && visibleNotes.length === 0) {
      return { success: false, message: `I found ${matchCount} matching notes. Which one did you mean?` }
    }
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

  if (level !== 'relaxed' && visibleNotes.length === 0) {
    return { success: true, message: `I forgot ${matchCount} ${matchCount === 1 ? 'note' : 'notes'}.` }
  }

  return { success: true, message: `I forgot these notes: ${notes}.` }
}
