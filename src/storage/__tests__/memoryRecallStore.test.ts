import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { geminiVector, localVector } from '../../agent/memory/embeddings/__tests__/vectors.js'
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
        period: 'current',
        embeddingText: null,
        hasEmbedding: false
      }
    ])
    expect(
      setClaimEmbedding({
        id: fact.id,
        embeddingText: "This person's hobby: chess.",
        embedding: geminiVector(Array(768).fill(0.1))
      })
    ).toBe(true)
    expect(listActiveClaimsForEmbedding()[0]).toMatchObject({
      embeddingText: "This person's hobby: chess.",
      hasEmbedding: true
    })
    expect(getClaimEmbeddings([fact.id]).get(fact.id)).toHaveLength(768)
  })

  it('lists a past claim with its period so its embedding sentence can say so', () => {
    assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'general_occupation',
      value: 'nurse',
      sourceKind: 'passive',
      period: 'past'
    })

    expect(listActiveClaimsForEmbedding()).toEqual([expect.objectContaining({ value: 'nurse', period: 'past' })])
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

    expect(setClaimEmbedding({ id: fact.id, embeddingText: 'x', embedding: geminiVector(Array(768).fill(0.1)) })).toBe(
      false
    )
  })

  it('treats a vector from another embedding space as missing, so the next sweep re-embeds it', () => {
    const fact = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit'
    })
    setClaimEmbedding({
      id: fact.id,
      embeddingText: "This person's hobby: chess.",
      embedding: localVector(Array(384).fill(0.1))
    })

    expect(listActiveClaimsForEmbedding()[0]).toMatchObject({ hasEmbedding: false })
    expect(getClaimEmbeddings([fact.id]).has(fact.id)).toBe(false)
  })
})
