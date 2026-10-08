import '../env.js'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  registerChannelVisibility,
  resetChannelVisibilityForTest
} from '../../../src/agent/memory/channelVisibility.js'
import { embedEpisodeText } from '../../../src/agent/memory/episodeEmbeddings.js'
import { embedPendingFacts } from '../../../src/agent/memory/factEmbeddings.js'
import { assertClaim } from '../../../src/agent/memory/memoryClaims.js'
import { recallForTurn } from '../../../src/agent/memory/recall.js'
import { config } from '../../../src/config.js'
import { closeDb } from '../../../src/storage/database.js'
import { upsertUserName } from '../../../src/storage/userNames.js'

const GUILD = 'live-guild'
const memory = config.memory as { privacy: string }
const facts = [
  ['hobby', 'playing chess and studying openings', 'general'],
  ['pets', 'a grey cat named Mochi', 'general'],
  ['general_occupation', 'night-shift nurse', 'general'],
  ['nickname', 'Ali', 'general'],
  ['misc', 'is secretly planning a surprise birthday party for Sam', 'staff']
] as const

async function recall(message: string, channelId: string) {
  const queryEmbedding = await embedEpisodeText({ text: message, role: 'RETRIEVAL_QUERY' })
  return recallForTurn({
    scope: { guildId: GUILD, channelId },
    speakerId: 'speaker',
    participantIds: [],
    namedIds: [],
    message,
    queryEmbedding
  })
}

function summary(result: Awaited<ReturnType<typeof recall>>) {
  return result.items.map((item) => `${item.core ? 'core ' : ''}${item.label}=${item.score.toFixed(3)}`)
}

beforeAll(async () => {
  upsertUserName('speaker', 'speaker', 'Speaker')
  for (const [predicate, value, channelId] of facts) {
    assertClaim({ guildId: GUILD, subjectUserId: 'speaker', predicate, value, sourceKind: 'passive', channelId })
  }
  registerChannelVisibility({
    visibility: (channelId) => (channelId === 'general' ? 'public' : 'private'),
    parentOf: () => null
  })
  await expect(embedPendingFacts()).resolves.toEqual({ embedded: facts.length, failed: 0 })
}, 60_000)

afterAll(() => {
  memory.privacy = 'relaxed'
  resetChannelVisibilityForTest()
  closeDb()
})

it('recalls the fact a question is about, and only core facts for small talk', async () => {
  memory.privacy = 'relaxed'
  const chess = await recall('Any chess openings you would recommend for a beginner?', 'general')
  const smallTalk = await recall('hey roka, how is your day going?', 'general')
  console.info('Memory recall live results', { chess: summary(chess), smallTalk: summary(smallTalk) })

  expect(chess.items.some((item) => item.label === 'hobby')).toBe(true)
  expect(chess.items.find((item) => item.core)?.label).toBe('nickname')
  expect(smallTalk.items.filter((item) => !item.core)).toHaveLength(0)
}, 30_000)

it('keeps a private-channel fact out of other channels under balanced and strict', async () => {
  const question = 'What surprise party are you planning?'
  memory.privacy = 'relaxed'
  const relaxed = await recall(question, 'general')
  memory.privacy = 'balanced'
  const balanced = await recall(question, 'general')
  memory.privacy = 'strict'
  const strict = await recall(question, 'general')
  const strictAtSource = await recall(question, 'staff')
  console.info('Memory privacy live results', {
    relaxed: summary(relaxed),
    balanced: summary(balanced),
    strict: summary(strict),
    strictAtSource: summary(strictAtSource)
  })

  expect(relaxed.items.some((item) => item.label === 'misc')).toBe(true)
  expect(balanced.items.some((item) => item.label === 'misc')).toBe(false)
  expect(strict.items.some((item) => item.label === 'misc')).toBe(false)
  expect(strictAtSource.items.some((item) => item.label === 'misc')).toBe(true)
}, 30_000)
