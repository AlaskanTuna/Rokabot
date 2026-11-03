/** Recall all stored facts about a user */

import { config } from '../../config.js'
import { getUserName } from '../../storage/userNames.js'
import { embedEpisodeText } from '../memory/episodeEmbeddings.js'
import { resolveName } from '../memory/identityResolver.js'
import { type ClaimPeriod, touchRecalled } from '../memory/memoryClaims.js'
import { type RecallScope } from '../memory/privacy.js'
import { recallFactsForSubject } from '../memory/recall.js'
import { retrieveForSubject } from '../memory/retriever.js'

export interface RecallUserParams {
  user_id: string
  guild_id: string
  message: string
  channel_id?: string
  user_name?: string
}

export interface RecallUserResult {
  facts: string
  factCount: number
}

/** Capped so the model sees her sharpest notes rather than the whole archive; retrieveForSubject owns the ordering */
const MAX_RECALLED_FACTS = 15

type SelectedFact = Readonly<{ id: number; key: string; value: string; period: ClaimPeriod }>

// The period is part of the identity: a past fact must not hide the current one that says the same thing.
const identityOf = (fact: SelectedFact): string => `${fact.period}\u0000${fact.key}\u0000${fact.value}`.toLowerCase()
const render = (facts: readonly SelectedFact[]): string => facts.map((fact) => `${fact.key}: ${fact.value}`).join(', ')

// A slow or failing embedding must never hold up the turn: keyword ranking is the fallback.
async function embedQuery(message: string): Promise<readonly number[] | null> {
  if (message.trim() === '') return null
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, config.memory.embeddingTimeoutMs)
  })
  const embedded = embedEpisodeText({
    text: message,
    role: 'RETRIEVAL_QUERY',
    signal: controller.signal
  })
    .then(({ values }) => values)
    .catch(() => null)
  try {
    return await Promise.race([embedded, timedOut])
  } finally {
    clearTimeout(timer)
  }
}

async function selectFacts(params: RecallUserParams): Promise<SelectedFact[]> {
  const { user_id, guild_id, message, channel_id } = params
  // With no channel the gate sees a channel that matches no source, so an unknown channel never widens recall.
  const scope: RecallScope = { guildId: guild_id, channelId: channel_id ?? '' }
  if (config.memory.recall === 'unified') {
    const items = recallFactsForSubject({
      scope,
      speakerId: user_id,
      subjectUserId: user_id,
      message,
      queryEmbedding: await embedQuery(message),
      limit: MAX_RECALLED_FACTS
    })
    return items.map((item) => ({ id: item.id, key: item.label, value: item.text, period: item.period }))
  }
  return retrieveForSubject(guild_id, user_id, message, MAX_RECALLED_FACTS, scope).map(({ claim }) => ({
    id: claim.id,
    key: claim.predicate,
    value: claim.value,
    period: claim.period
  }))
}

export async function recallUser(params: RecallUserParams): Promise<RecallUserResult> {
  const { guild_id, channel_id, user_name } = params
  let userId = params.user_id
  if (user_name) {
    const userIds = resolveName(
      user_name,
      guild_id,
      channel_id ? { guildId: guild_id, channelId: channel_id } : undefined
    )
    if (userIds.length === 0) return { facts: "I don't know anyone by that name here yet.", factCount: 0 }
    if (userIds.length > 1) {
      const displayNames = userIds.map((id) => getUserName(id)?.displayName ?? id)
      return {
        facts: `Several people here go by "${user_name}": ${displayNames.join(', ')}. Ask which one they mean.`,
        factCount: 0
      }
    }
    userId = userIds[0]
  }
  const selected =
    guild_id === 'global' || config.memory.privacy === 'off' ? [] : await selectFacts({ ...params, user_id: userId })
  const uniqueFacts = selected
    .filter((fact, index) => {
      const identity = identityOf(fact)
      return index === selected.findIndex((candidate) => identityOf(candidate) === identity)
    })
    .slice(0, MAX_RECALLED_FACTS)

  const surfaced = new Set(uniqueFacts.map(identityOf))
  touchRecalled(selected.filter((fact) => surfaced.has(identityOf(fact))).map((fact) => fact.id))

  if (uniqueFacts.length === 0) {
    return {
      facts: "I don't have any notes about this person yet.",
      factCount: 0
    }
  }

  const past = uniqueFacts.filter(({ period }) => period === 'past')
  const current = uniqueFacts.filter(({ period }) => period === 'current')
  const formatted = [render(current), ...(past.length > 0 ? [`In the past: ${render(past)}`] : [])]
    .filter((part) => part !== '')
    .join('. ')
  return {
    facts: formatted,
    factCount: uniqueFacts.length
  }
}
