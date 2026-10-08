import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendEvidence, assertClaim, rejectActiveClaimById } from '../../agent/memory/memoryClaims.js'
import { closeDb } from '../database.js'
import {
  getClaimEmbeddings,
  getClaimSourceChannels,
  listActiveClaimsForEmbedding,
  setClaimEmbedding
} from '../memoryRecallStore.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('memoryRecallStore', () => {
  it('lists active claims with their embedding state and stores an embedding', () => {
    const fact = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit',
      channelId: 'c1'
    })

    expect(listActiveClaimsForEmbedding()).toEqual([
      {
        id: fact.id,
        subjectKind: 'user',
        predicate: 'hobby',
        value: 'chess',
        eventDate: null,
        embeddingText: null,
        hasEmbedding: false
      }
    ])
    expect(
      setClaimEmbedding({ id: fact.id, embeddingText: "This person's hobby: chess.", embedding: Array(768).fill(0.1) })
    ).toBe(true)
    expect(listActiveClaimsForEmbedding()[0]).toMatchObject({
      embeddingText: "This person's hobby: chess.",
      hasEmbedding: true
    })
    expect(getClaimEmbeddings([fact.id]).get(fact.id)).toHaveLength(768)
  })

  it('returns every evidence channel per claim, and null for evidence without one', () => {
    const fact = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'passive',
      channelId: 'c1'
    })
    appendEvidence(fact.id, { channelId: 'c2', sourceKind: 'passive' })
    appendEvidence(fact.id, { sourceKind: 'explicit' })

    expect(getClaimSourceChannels([fact.id]).get(fact.id)?.sort()).toEqual(['c1', 'c2', null].sort())
  })

  it('skips claims that are no longer active when storing an embedding', () => {
    const fact = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit'
    })
    rejectActiveClaimById({ guildId: 'g', subjectUserId: 'u', existingId: fact.id })

    expect(setClaimEmbedding({ id: fact.id, embeddingText: 'x', embedding: Array(768).fill(0.1) })).toBe(false)
  })
})
