import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as memoryClaims from '../../agent/memory/memoryClaims.js'
import { moveClaim, undoReclassify } from '../../agent/memory/reclassify.js'
import { config } from '../../config.js'
import { closeDb, getDb } from '../database.js'
import * as memoryEpisodeStore from '../memoryEpisodeStore.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import * as memoryRecallStore from '../memoryRecallStore.js'

const memoryStoreConfig = config.memory as { store: 'legacy' | 'dual' | 'item' }
const vector = { values: [0.5, 0.5], modelId: 'synthetic-model', dim: 2, fingerprint: 'synthetic:fingerprint' } as const

function itemIdOf(legacyId: number): number {
  return (
    getDb()
      .prepare("SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = ?")
      .get(legacyId) as {
      id: number
    }
  ).id
}

function seedFact(value: string, predicate = 'hobby') {
  return memoryClaims.assertClaim({
    guildId: 'guild-fixture',
    subjectUserId: 'user-fixture',
    predicate,
    value,
    sourceKind: 'explicit',
    observedAt: 100
  })
}

// Under `dual` an episode written first shifts every item ID, so a claim's legacy ID is another claim's item ID.
describe('item writers after the cutover keep caller-facing IDs', () => {
  let first: memoryClaims.UserMemoryClaim
  let second: memoryClaims.UserMemoryClaim

  beforeEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = ':memory:'
    memoryStoreConfig.store = 'dual'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
    memoryEpisodeStore.saveMemoryEpisode({
      id: 900,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      startedAt: 50,
      endedAt: 60,
      summary: 'ID offset episode.',
      embedding: null,
      createdAt: 70
    })
    first = seedFact('synthetic chess', 'misc')
    second = seedFact('synthetic drawing')
    expect(itemIdOf(first.id)).toBe(second.id)
    memoryStoreConfig.store = 'item'
    configureMemoryItemProjectionTriggers(getDb(), 'item')
  })

  afterEach(() => {
    closeDb()
    memoryStoreConfig.store = 'legacy'
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('returns the claim it added evidence to', () => {
    const updated = memoryClaims.appendEvidence(first.id, { sourceKind: 'human', observedAt: 200 })

    expect(updated).toMatchObject({ id: first.id, value: 'synthetic chess' })
  })

  it('never resolves a legacy ID with no item to another item by its own ID', () => {
    const staleId = itemIdOf(second.id)
    expect(
      memoryClaims.rejectActiveClaimById({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        existingId: staleId
      })
    ).toBe(false)

    memoryClaims.touchRecalled([staleId])

    expect(getDb().prepare('SELECT last_recalled_at FROM memory_item WHERE id = ?').get(staleId)).toEqual({
      last_recalled_at: null
    })
  })

  it('lists episodes under their job ID so maintenance can re-embed them', () => {
    const [episode] = memoryEpisodeStore.listEpisodesForGuild('guild-fixture')

    expect(episode?.id).toBe(900)
    expect(
      memoryEpisodeStore.setEpisodeEmbedding({
        guildId: 'guild-fixture',
        id: 900,
        summary: 'ID offset episode.',
        embedding: vector
      })
    ).toBe(true)
  })

  it('lists facts for embedding under the IDs setClaimEmbedding takes', () => {
    const pending = memoryRecallStore.listActiveClaimsForEmbedding()

    expect(pending.map(({ id }) => id)).toEqual([first.id, second.id])
    expect(
      memoryRecallStore.setClaimEmbedding({ id: first.id, embeddingText: 'Synthetic sentence.', embedding: vector })
    ).toBe(true)
    expect(
      getDb().prepare('SELECT legacy_embedding_text FROM memory_item WHERE id = ?').get(itemIdOf(first.id))
    ).toEqual({ legacy_embedding_text: 'Synthetic sentence.' })
  })

  it('returns the moved fact by its caller-facing ID and undoes it by the v2 audit ID', () => {
    const candidate = memoryClaims.findReclassifyRows(10).find(({ id }) => id === first.id)!
    const movedId = moveClaim(candidate, 'likes', 0.9)

    expect(memoryClaims.getActiveClaimById('guild-fixture', 'user-fixture', movedId)).toMatchObject({
      predicate: 'likes',
      value: 'synthetic chess'
    })
    const detail = JSON.parse(
      (
        getDb()
          .prepare("SELECT detail FROM memory_events WHERE kind = 'claim_reclassified' ORDER BY id DESC LIMIT 1")
          .get() as { detail: string }
      ).detail
    ) as { v: number; oldId: number }
    expect(detail).toMatchObject({ v: 2, oldId: itemIdOf(first.id) })

    // The v2 ID is also the second fact's legacy ID; the audit row decides which fact it names.
    expect(undoReclassify(detail.oldId)).toBe(true)
    expect(memoryClaims.getActiveClaimById('guild-fixture', 'user-fixture', first.id)).toMatchObject({
      predicate: 'misc'
    })
    expect(memoryClaims.getActiveClaimById('guild-fixture', 'user-fixture', second.id)).toMatchObject({
      predicate: 'hobby'
    })
    expect(memoryClaims.findReclassifyRows(10).map(({ id }) => id)).not.toContain(first.id)
  })
})
