import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { geminiVector, localVector } from '../../../tests/harness/vectors.js'
import { renderFactSentence } from '../../agent/memory/factSentences.js'
import { appendEvidence, assertClaim, rejectActiveClaimById } from '../../agent/memory/memoryClaims.js'
import { config } from '../../config.js'
import { closeDb, getDb } from '../database.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import { writeMemoryItemEmbedding } from '../memoryItemStore.js'
import {
  getClaimEmbeddings,
  getClaimSourceChannels,
  listActiveClaimsForEmbedding,
  setClaimEmbedding
} from '../memoryRecallStore.js'
import { encodeFloat32Embedding } from '../memoryVector.js'

const memoryStoreConfig = config.memory as { store: 'legacy' | 'dual' | 'item' }

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  memoryStoreConfig.store = 'legacy'
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

  it('rebuilds missing fact embedding text under item mode when decoding, and rejects mismatched text', () => {
    memoryStoreConfig.store = 'item'
    const database = getDb()
    configureMemoryItemProjectionTriggers(database, 'item')

    const matching = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit'
    })
    const mismatched = assertClaim({
      guildId: 'g',
      subjectUserId: 'u',
      predicate: 'hobby',
      value: 'go',
      sourceKind: 'explicit'
    })

    const vector = geminiVector(Array(768).fill(0.1))
    const buffer = encodeFloat32Embedding(vector, 'Fact')
    writeMemoryItemEmbedding(database, {
      itemId: matching.id,
      fingerprint: vector.fingerprint,
      modelId: vector.modelId,
      dim: vector.dim,
      renderer: 'fact_sentence',
      text: renderFactSentence(matching),
      vector: buffer
    })
    writeMemoryItemEmbedding(database, {
      itemId: mismatched.id,
      fingerprint: vector.fingerprint,
      modelId: vector.modelId,
      dim: vector.dim,
      renderer: 'fact_sentence',
      text: "This person's hobby: shogi.",
      vector: buffer
    })

    expect(database.prepare('SELECT legacy_embedding_text FROM memory_item WHERE id = ?').get(matching.id)).toEqual({
      legacy_embedding_text: null
    })

    const decoded = getClaimEmbeddings([matching.id, mismatched.id])
    expect(decoded.get(matching.id)).toHaveLength(768)
    expect(decoded.has(mismatched.id)).toBe(false)
  })
})
