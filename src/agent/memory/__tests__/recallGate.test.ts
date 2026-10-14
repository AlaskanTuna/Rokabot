import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { memoryDefaults, testConfig } = vi.hoisted(() => {
  const memoryDefaults = {
    privacy: 'relaxed',
    recallTokenBudget: 600,
    recallCoreFacts: 3,
    factMinSimilarity: 0.6,
    serverFactMinSimilarity: 0.6,
    episodeMinSimilarity: 0.7,
    mediaMinSimilarity: 0.7,
    episodeRecallK: 3,
    mediaRecallK: 2,
    recentParticipantLimit: 3,
    salienceHalfLifeDays: 30,
    recallCooldownMs: 21_600_000,
    maxActiveClaimsPerUser: 20,
    maxClaimsPerTurn: 8,
    recallGateShortlist: { fact: 8, server_fact: 4, conversation: 8, media: 4 },
    recallGateMinNoul: { fact: 0.9, server_fact: null, conversation: 0.9, media: 0.9 }
  }
  return {
    memoryDefaults,
    testConfig: {
      logging: { level: 'silent' },
      timezone: 'UTC',
      embeddings: { provider: 'gemini', dim: 768, fingerprint: 'gemini:gemini-embedding-2:768:gemini-task-prefix' },
      memory: { ...memoryDefaults }
    }
  }
})

vi.mock('../../../config.js', () => ({ config: testConfig }))

import { closeDb } from '../../../storage/database.js'
import { recordMediaOccurrence, saveMediaDigest } from '../../../storage/mediaDigestStore.js'
import { saveMemoryEpisode } from '../../../storage/memoryEpisodeStore.js'
import { setClaimEmbedding } from '../../../storage/memoryRecallStore.js'
import { upsertUserName } from '../../../storage/userNames.js'
import { resetChannelVisibilityForTest } from '../channelVisibility.js'
import { geminiVector } from '../embeddings/__tests__/vectors.js'
import { type ClaimPeriod, assertClaim, pinClaim } from '../memoryClaims.js'
import {
  type GatePool,
  type RecallInput,
  type RecallItem,
  packRecallItems,
  recallForTurn,
  recallGatePool
} from '../recall.js'
import { buildRecallShortlist, selectGatedItems } from '../recallGate.js'

const NOW = 1_000_000
const GUILD = 'guild-a'
const SCOPE = { guildId: GUILD, channelId: 'chan-a' }

const axis = (index: number): number[] => Array.from({ length: 768 }, (_, position) => (position === index ? 1 : 0))
const mix = (index: number, other: number, weight: number): number[] =>
  axis(index).map((value, position) => value * Math.sqrt(1 - weight * weight) + (position === other ? weight : 0))

function input(overrides: Partial<RecallInput> = {}): RecallInput {
  return {
    scope: SCOPE,
    speakerId: 'speaker',
    participantIds: [],
    namedIds: [],
    message: 'hello there',
    queryEmbedding: axis(1),
    now: NOW,
    ...overrides
  }
}

function fact(
  userId: string,
  predicate: string,
  value: string,
  embedding: readonly number[] | null,
  options: { channelId?: string; observedAt?: number; pinned?: boolean; period?: ClaimPeriod } = {}
): number {
  const claim = assertClaim({
    guildId: GUILD,
    subjectUserId: userId,
    predicate,
    value,
    sourceKind: 'passive',
    channelId: options.channelId ?? 'chan-a',
    observedAt: options.observedAt ?? NOW,
    ...(options.period ? { period: options.period } : {})
  })
  if (options.pinned) pinClaim(claim.id)
  if (embedding)
    setClaimEmbedding({ id: claim.id, embeddingText: `${predicate}: ${value}`, embedding: geminiVector(embedding) })
  return claim.id
}

function episode(id: number, channelId: string, embedding: readonly number[], endedAt: number = NOW): void {
  saveMemoryEpisode({
    id,
    guildId: GUILD,
    channelId,
    startedAt: endedAt - 1000,
    endedAt,
    summary: `summary ${id}`,
    embedding: geminiVector(embedding)
  })
}

function media(label: string, channelId: string, embedding: readonly number[]): void {
  const digest = saveMediaDigest({
    guildId: GUILD,
    contentKey: label,
    kind: 'video',
    label,
    summary: `${label} summary`,
    digestJson: '{}',
    embedding: geminiVector(embedding),
    createdAt: NOW
  })
  if (!digest) throw new Error('media digest was not saved')
  recordMediaOccurrence({
    digestId: digest.id,
    guildId: GUILD,
    channelId,
    messageId: `msg-${label}`,
    sharedByUserId: 'speaker',
    sourceAuthorId: null,
    origin: 'upload',
    observedAt: NOW
  })
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  Object.assign(testConfig.memory, memoryDefaults)
  upsertUserName('speaker', 'speaker', 'Speaker')
  upsertUserName('participant-1', 'participant-1', 'Participant One')
})

afterEach(() => {
  resetChannelVisibilityForTest()
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

const entry = (kind: RecallItem['kind'], id: number, extra: Partial<RecallItem> = {}) => ({
  item: {
    kind,
    id,
    score: 0.7,
    core: false,
    subjectUserId: 'speaker',
    label: 'hobby',
    text: `text ${id}`,
    date: null,
    period: 'current',
    ...extra
  } as RecallItem,
  at: NOW - id,
  similarity: 0.7,
  keyword: false,
  keptByFloor: true
})
const pool = (entries: ReturnType<typeof entry>[], core: RecallItem[] = []): GatePool => ({
  core,
  entries,
  fallback: false,
  gated: 0
})
const LANES = { fact: 2, server_fact: 1, conversation: 2, media: 1 }
const CUTOFFS = { fact: 0.9, server_fact: null, conversation: 0.9, media: 0.9 }

describe('recallGatePool', () => {
  it('keeps candidates below every similarity floor, with their similarity', () => {
    const near = fact('speaker', 'hobby', 'chess', axis(1))
    const far = fact('speaker', 'hobby', 'go', mix(1, 2, 0.95))
    const gatePool = recallGatePool(input())
    expect(gatePool.entries.map(({ item }) => item.id).sort()).toEqual([near, far].sort())
    expect(gatePool.entries.find(({ item }) => item.id === far)).toMatchObject({ keptByFloor: false })
  })

  it('returns core facts separately and never as entries', () => {
    const nickname = fact('speaker', 'nickname', 'Ali', axis(1))
    const hobby = fact('speaker', 'hobby', 'chess', axis(1))
    const gatePool = recallGatePool(input())
    expect(gatePool.core.map(({ id }) => id)).toEqual([nickname])
    expect(gatePool.entries.map(({ item }) => item.id)).toEqual([hobby])
  })

  it('flags keyword matches and, without a query vector, offers only them', () => {
    const chess = fact('speaker', 'hobby', 'chess', axis(1))
    fact('speaker', 'food', 'ramen', axis(2))
    const gatePool = recallGatePool(input({ queryEmbedding: null, message: 'do you still play chess' }))
    expect(gatePool.entries.map(({ item, keyword }) => [item.id, keyword])).toEqual([[chess, true]])
    expect(gatePool.fallback).toBe(true)
  })

  it('keeps a memory from another private channel out of the pool under strict privacy', () => {
    testConfig.memory.privacy = 'strict'
    fact('speaker', 'hobby', 'chess', axis(1), { channelId: 'chan-other' })
    expect(recallGatePool(input()).entries).toEqual([])
  })

  it('offers conversations and media beside facts, each with its own floor verdict', () => {
    episode(1, 'chan-a', axis(1))
    media('clip', 'chan-a', mix(1, 2, 0.95))
    const gatePool = recallGatePool(input())
    expect(gatePool.entries.map(({ item, keptByFloor }) => [item.kind, keptByFloor]).sort()).toEqual([
      ['conversation', true],
      ['media', false]
    ])
  })
})

describe('packRecallItems', () => {
  it('selects exactly what recallForTurn selects from the same floor-kept candidates', () => {
    for (let id = 1; id <= 5; id++) episode(id, 'chan-a', axis(1))
    fact('speaker', 'nickname', 'Ali', axis(1))
    fact('speaker', 'hobby', 'chess', axis(1))
    const { items } = recallForTurn(input())
    const gatePool = recallGatePool(input())
    const ordered = gatePool.entries.filter(({ keptByFloor }) => keptByFloor).map(({ item }) => item)
    expect(packRecallItems(gatePool.core, ordered).map(({ kind, id }) => [kind, id])).toEqual(
      items.map(({ kind, id }) => [kind, id])
    )
  })
})

describe('buildRecallShortlist', () => {
  it('fills each kind lane, keyword facts first, interleaves lanes, then lends unused slots', () => {
    const shortlist = buildRecallShortlist(
      pool([
        entry('fact', 1),
        entry('fact', 2),
        { ...entry('fact', 3), keyword: true },
        entry('conversation', 4),
        entry('conversation', 5),
        entry('conversation', 6)
      ]),
      LANES
    )
    expect(shortlist.map(({ key }) => key)).toEqual([
      'fact:3',
      'conversation:4',
      'fact:1',
      'conversation:5',
      'fact:2',
      'conversation:6'
    ])
  })

  it('drops a candidate that cannot fit the block on its own', () => {
    expect(buildRecallShortlist(pool([entry('conversation', 1, { text: 'x'.repeat(4000) })]), LANES)).toEqual([])
  })
})

describe('selectGatedItems', () => {
  const nickname = { ...entry('fact', 9, { label: 'nickname', text: 'Ali' }).item, core: true }

  it('injects core facts plus shortlisted items at or above their cutoff, highest first', () => {
    const gatePool = pool([entry('fact', 1), entry('fact', 2), entry('fact', 3)], [nickname])
    const shortlist = buildRecallShortlist(gatePool, LANES)
    const probabilities = new Map([
      ['fact:1', 0.9],
      ['fact:2', 0.95],
      ['fact:3', 0.89]
    ])
    expect(selectGatedItems(gatePool, shortlist, probabilities, CUTOFFS).map(({ id }) => id)).toEqual([9, 2, 1])
  })

  it('keeps core facts and nothing else when Jev gave no probabilities', () => {
    const gatePool = pool([entry('fact', 1)], [nickname])
    const shortlist = buildRecallShortlist(gatePool, LANES)
    expect(selectGatedItems(gatePool, shortlist, null, CUTOFFS).map(({ id }) => id)).toEqual([9])
  })

  it('never injects a kind whose cutoff is null, whatever its probability', () => {
    const gatePool = pool([entry('server_fact', 1, { subjectUserId: null })])
    const shortlist = buildRecallShortlist(gatePool, LANES)
    expect(selectGatedItems(gatePool, shortlist, new Map([['server_fact:1', 1]]), CUTOFFS)).toEqual([])
  })
})
