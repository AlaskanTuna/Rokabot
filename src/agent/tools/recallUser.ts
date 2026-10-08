/** Recall all stored facts about a user */

import { config } from '../../config.js'
import { embedEpisodeText } from '../memory/episodeEmbeddings.js'
import { touchRecalled } from '../memory/memoryClaims.js'
import { type RecallScope } from '../memory/privacy.js'
import { recallFactsForSubject } from '../memory/recall.js'
import { retrieveForSubject } from '../memory/retriever.js'

export interface RecallUserParams {
  user_id: string
  guild_id: string
  message: string
  channel_id?: string
}

export interface RecallUserResult {
  facts: string
  factCount: number
}

/** Capped so the model sees her sharpest notes rather than the whole archive; retrieveForSubject owns the ordering */
const MAX_RECALLED_FACTS = 15

type SelectedFact = Readonly<{ id: number; key: string; value: string }>

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
  }).catch(() => null)
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
    return items.map((item) => ({ id: item.id, key: item.label, value: item.text }))
  }
  return retrieveForSubject(guild_id, user_id, message, MAX_RECALLED_FACTS, scope).map(({ claim }) => ({
    id: claim.id,
    key: claim.predicate,
    value: claim.value
  }))
}

export async function recallUser(params: RecallUserParams): Promise<RecallUserResult> {
  const { guild_id } = params
  const selected = guild_id === 'global' || config.memory.privacy === 'off' ? [] : await selectFacts(params)
  const uniqueFacts = selected
    .filter((fact, index) => {
      const identity = `${fact.key}\u0000${fact.value}`.toLowerCase()
      return (
        index ===
        selected.findIndex((candidate) => `${candidate.key}\u0000${candidate.value}`.toLowerCase() === identity)
      )
    })
    .slice(0, MAX_RECALLED_FACTS)

  const surfaced = new Set(uniqueFacts.map((fact) => `${fact.key}\u0000${fact.value}`.toLowerCase()))
  touchRecalled(
    selected.filter((fact) => surfaced.has(`${fact.key}\u0000${fact.value}`.toLowerCase())).map((fact) => fact.id)
  )

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
