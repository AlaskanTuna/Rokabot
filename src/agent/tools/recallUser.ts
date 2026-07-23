/** Recall all stored facts about a user */

import { getFacts } from '../../storage/userMemory.js'
import { getActiveClaims, touchRecalled } from '../memory/memoryClaims.js'

export interface RecallUserParams {
  user_id: string
  guild_id: string
}

export interface RecallUserResult {
  facts: string
  factCount: number
}

export function recallUser(params: RecallUserParams): RecallUserResult {
  const { user_id, guild_id } = params
  const claims = guild_id === 'global' ? [] : getActiveClaims(guild_id, user_id)
  const facts = [
    ...claims.map((claim) => ({ key: claim.predicate, value: claim.value })),
    ...getFacts(guild_id, user_id)
  ]
  const uniqueFacts = facts.filter((fact, index) => {
    const identity = `${fact.key}\u0000${fact.value}`.toLowerCase()
    return (
      index === facts.findIndex((candidate) => `${candidate.key}\u0000${candidate.value}`.toLowerCase() === identity)
    )
  })

  touchRecalled(claims.map((claim) => claim.id))

  if (uniqueFacts.length === 0) {
    return {
      facts: "I don't have any notes about this person yet.",
      factCount: 0
    }
  }

  const formatted = uniqueFacts.map((f) => `${f.key}: ${f.value}`).join(', ')
  return {
    facts: formatted,
    factCount: uniqueFacts.length
  }
}
