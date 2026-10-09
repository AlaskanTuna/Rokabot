import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import { logger } from '../../../utils/logger.js'

const mocks = vi.hoisted(() => ({
  embedEpisodeText: vi.fn(),
  judgeHiddenRetractions: vi.fn(),
  judgeEpisodeOperations: vi.fn(),
  config: {
    gemini: { apiKey: 'test-key', extractionModel: 'test-model', safetyThreshold: 'OFF', timeout: 5000 },
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20, verifyThreshold: 0.5, privacy: 'strict' },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

vi.mock('../episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../../jev/judgments.js', () => ({
  judgeHiddenRetractions: mocks.judgeHiddenRetractions,
  judgeEpisodeOperations: mocks.judgeEpisodeOperations
}))
vi.mock('../../../config.js', () => ({ config: mocks.config }))

import { closeDb, getDb } from '../../../storage/database.js'
import { setClaimEmbedding } from '../../../storage/memoryRecallStore.js'
import { registerChannelVisibility, resetChannelVisibilityForTest } from '../channelVisibility.js'
import { verifyAndApplyOperations } from '../extractor.js'
import { renderFactSentence } from '../factSentences.js'
import { reconcileHiddenRetractions } from '../hiddenRetractions.js'
import { assertClaim } from '../memoryClaims.js'
import type { PredicateId } from '../predicates.js'

function unit(angle: number): number[] {
  return Array.from({ length: 768 }, (_, index) => (index === 0 ? Math.cos(angle) : index === 1 ? Math.sin(angle) : 0))
}

function seedClaim(input: {
  predicate: PredicateId
  value: string
  channelId: string
  embedding?: number[] | null
  subjectUserId?: string
  period?: 'current' | 'past'
}) {
  const claim = assertClaim({
    guildId: 'guild-1',
    subjectUserId: input.subjectUserId ?? 'user-1',
    predicate: input.predicate,
    value: input.value,
    sourceKind: 'passive',
    channelId: input.channelId,
    ...(input.period ? { period: input.period } : {})
  })
  if (input.embedding !== null) {
    const embedding = input.embedding ?? unit(0)
    setClaimEmbedding({
      id: claim.id,
      embeddingText: renderFactSentence({
        subjectKind: 'user',
        predicate: input.predicate,
        value: input.value,
        eventDate: null
      }),
      embedding
    })
  }
  return claim
}

function statusOf(claimId: number) {
  return getDb().prepare('SELECT status, end_reason FROM memory_claim WHERE id = ?').get(claimId)
}

const ACTIVE = { status: 'active', end_reason: null }
const RETRACTED = { status: 'rejected', end_reason: 'retracted' }

const chess = { subjectUserId: 'user-1', predicate: 'hobby' as const, value: 'chess' }

function reconcile(input: Partial<Parameters<typeof reconcileHiddenRetractions>[0]> = {}) {
  return reconcileHiddenRetractions({
    guildId: 'guild-1',
    channelId: 'public-channel',
    lines: ['[user-1|Alice]: I quit chess'],
    retracts: [chess],
    visibleIds: new Set(),
    ...input
  })
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  mocks.config.memory.privacy = 'strict'
  mocks.embedEpisodeText.mockReset()
  mocks.judgeHiddenRetractions.mockReset()
  mocks.judgeEpisodeOperations.mockReset()
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  resetChannelVisibilityForTest()
  vi.restoreAllMocks()
})

describe('reconcileHiddenRetractions', () => {
  it('retires a hidden fact Jev confirms the message ends, at strict', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.92 })

    const retired = await reconcile()

    expect(retired).toBe(1)
    expect(statusOf(hidden.id)).toEqual(RETRACTED)
    expect(mocks.embedEpisodeText).toHaveBeenCalledWith({
      text: "This person's hobby: chess.",
      role: 'RETRIEVAL_QUERY'
    })
    expect(mocks.judgeHiddenRetractions).toHaveBeenCalledWith({
      lines: ['[user-1|Alice]: I quit chess'],
      statement: "This person's hobby: chess.",
      candidates: [{ id: hidden.id, sentence: "This person's hobby: chess." }]
    })
  })

  it('asks about at most the three most similar hidden facts in the same category', async () => {
    for (let index = 0; index < 5; index++) {
      seedClaim({
        predicate: 'hobby',
        value: `hobby-${index}`,
        channelId: 'private-channel',
        embedding: unit(index * 0.1)
      })
    }
    seedClaim({ predicate: 'general_occupation', value: 'nurse', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({})

    await reconcile({ lines: [] })

    const candidates = mocks.judgeHiddenRetractions.mock.calls[0][0].candidates
    expect(candidates).toHaveLength(3)
    expect(candidates.every(({ sentence }: { sentence: string }) => sentence.includes('hobby'))).toBe(true)
    expect(candidates.map(({ sentence }: { sentence: string }) => sentence)).toEqual([
      "This person's hobby: hobby-0.",
      "This person's hobby: hobby-1.",
      "This person's hobby: hobby-2."
    ])
  })

  it('makes no calls at relaxed or when nothing is hidden, and retires nothing when Jev fails', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })

    mocks.config.memory.privacy = 'relaxed'
    expect(await reconcile({ lines: [] })).toBe(0)
    mocks.config.memory.privacy = 'off'
    expect(await reconcile({ lines: [] })).toBe(0)
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()

    mocks.config.memory.privacy = 'strict'
    expect(await reconcile({ lines: [], visibleIds: new Set([hidden.id]) })).toBe(0)
    expect(await reconcile({ lines: [], retracts: [] })).toBe(0)
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()

    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue(null)
    expect(await reconcile({ lines: [] })).toBe(0)
    expect(statusOf(hidden.id)).toEqual(ACTIVE)
  })

  it('works at balanced, where only public channels are visible', async () => {
    mocks.config.memory.privacy = 'balanced'
    registerChannelVisibility({
      visibility: (channelId) => (channelId === 'public-elsewhere' ? 'public' : 'private'),
      parentOf: () => null
    })
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.9 })

    expect(await reconcile()).toBe(1)
    expect(statusOf(hidden.id)).toEqual(RETRACTED)
  })

  it('never logs a hidden value', async () => {
    const info = vi.spyOn(logger, 'info')
    const warn = vi.spyOn(logger, 'warn')
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.92 })

    expect(await reconcile()).toBe(1)

    expect(info).toHaveBeenCalledOnce()
    expect(info.mock.calls[0][0]).toMatchObject({ guildId: 'guild-1', channelId: 'public-channel', retracted: 1 })
    expect(JSON.stringify(info.mock.calls)).not.toContain('chess')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('chess')
  })

  it('logs a failure without the value or the message and retires nothing', async () => {
    const info = vi.spyOn(logger, 'info')
    const warn = vi.spyOn(logger, 'warn')
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockRejectedValue(new Error('embedding failed for chess'))

    expect(await reconcile()).toBe(0)

    expect(statusOf(hidden.id)).toEqual(ACTIVE)
    expect(warn).toHaveBeenCalledOnce()
    expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toContain('chess')
  })

  it('keeps going with the next retract after one fails', async () => {
    const hidden = seedClaim({ predicate: 'pets', value: 'cat', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.9 })
    seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })

    const retired = await reconcile({ retracts: [chess, { subjectUserId: 'user-1', predicate: 'pets', value: 'cat' }] })

    expect(retired).toBe(1)
    expect(statusOf(hidden.id)).toEqual(RETRACTED)
  })

  it('retires only the facts at or above the verify threshold', async () => {
    const below = seedClaim({ predicate: 'hobby', value: 'go', channelId: 'private-channel', embedding: unit(0.1) })
    const at = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: unit(0) })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({ [below.id]: 0.49, [at.id]: 0.5 })

    expect(await reconcile()).toBe(1)
    expect(statusOf(below.id)).toEqual(ACTIVE)
    expect(statusOf(at.id)).toEqual(RETRACTED)
  })

  it('retires nothing for a retract that matches no hidden fact, and asks nobody', async () => {
    const other = seedClaim({ predicate: 'general_occupation', value: 'nurse', channelId: 'private-channel' })

    expect(await reconcile()).toBe(0)
    expect(statusOf(other.id)).toEqual(ACTIVE)
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
    expect(mocks.judgeHiddenRetractions).not.toHaveBeenCalled()
  })

  it("considers only the subject's current, embedded, hidden facts", async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'go', channelId: 'private-channel', embedding: unit(0.1) })
    const visible = seedClaim({ predicate: 'hobby', value: 'shogi', channelId: 'public-channel', embedding: unit(0) })
    seedClaim({
      predicate: 'hobby',
      value: 'xiangqi',
      channelId: 'private-channel',
      embedding: unit(0),
      period: 'past'
    })
    seedClaim({ predicate: 'hobby', value: 'poker', channelId: 'private-channel', embedding: null })
    seedClaim({
      predicate: 'hobby',
      value: 'bridge',
      channelId: 'private-channel',
      embedding: unit(0),
      subjectUserId: 'user-2'
    })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
    mocks.judgeHiddenRetractions.mockResolvedValue({})

    await reconcile({ visibleIds: new Set([visible.id]) })

    expect(mocks.judgeHiddenRetractions.mock.calls[0][0].candidates).toEqual([
      { id: hidden.id, sentence: "This person's hobby: go." }
    ])
  })

  it('leaves out a hidden fact that is still awaiting review', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    getDb().prepare('UPDATE memory_claim SET needs_review = 1 WHERE id = ?').run(hidden.id)

    expect(await reconcile()).toBe(0)
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
    expect(statusOf(hidden.id)).toEqual(ACTIVE)
  })

  it('skips a retract whose hidden facts all lack embeddings', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel', embedding: null })
    mocks.embedEpisodeText.mockResolvedValue(unit(0))

    expect(await reconcile()).toBe(0)
    expect(mocks.judgeHiddenRetractions).not.toHaveBeenCalled()
    expect(statusOf(hidden.id)).toEqual(ACTIVE)
  })
})

describe('verifyAndApplyOperations hidden retractions', () => {
  const subject = { kind: 'user' as const, userId: 'user-1' }

  function episode(): ExtractionEpisode {
    return {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alice',
          content: 'I quit chess',
          timestamp: 1_000,
          isBot: false
        }
      ],
      context: [],
      startedAt: 1_000,
      endedAt: 1_000
    }
  }

  function answers(values: Record<string, number>) {
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: Object.fromEntries(Object.entries(values).map(([key, noul]) => [key, { noul, confidence: null }])),
      latencyMs: 5,
      inputTokens: 7
    })
  }

  function run(ops: Parameters<typeof verifyAndApplyOperations>[0]['output']['ops']) {
    return verifyAndApplyOperations({
      guildId: 'guild-1',
      channelId: 'public-channel',
      episode: episode(),
      output: { ops, summary: 'A member quit a hobby.' },
      subjectIds: new Set(['user-1'])
    })
  }

  beforeEach(() => {
    mocks.embedEpisodeText.mockResolvedValue(unit(0))
  })

  it('counts a hidden retirement in retractedOps after a retract that matches nothing visible', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    answers({ durable_0: 0.9, attributed_0: 0.9 })
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.9 })

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 1, appliedOps: 0 })
    expect(statusOf(hidden.id)).toEqual(RETRACTED)
  })

  it('adds hidden retirements to the visible ones and never asks about a visible fact', async () => {
    const visible = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'public-channel' })
    const stillVisible = seedClaim({ predicate: 'hobby', value: 'shogi', channelId: 'public-channel' })
    const hidden = seedClaim({ predicate: 'hobby', value: 'go', channelId: 'private-channel' })
    answers({ durable_0: 0.9, attributed_0: 0.9, retracts_0_0: 0.9, retracts_0_1: 0.1 })
    mocks.judgeHiddenRetractions.mockResolvedValue({ [hidden.id]: 0.9 })

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 2, appliedOps: 1 })
    expect(statusOf(visible.id)).toEqual(RETRACTED)
    expect(statusOf(stillVisible.id)).toEqual(ACTIVE)
    expect(statusOf(hidden.id)).toEqual(RETRACTED)
    expect(mocks.judgeHiddenRetractions.mock.calls[0][0].candidates).toEqual([
      { id: hidden.id, sentence: "This person's hobby: go." }
    ])
  })

  it('completes with nothing retired when a retract matches nothing, visible or hidden', async () => {
    answers({ durable_0: 0.9, attributed_0: 0.9 })

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 0, appliedOps: 0, droppedOps: 1 })
    expect(mocks.judgeHiddenRetractions).not.toHaveBeenCalled()
  })

  it('leaves the report intact when the hidden pass fails', async () => {
    const hidden = seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    answers({ durable_0: 0.9, attributed_0: 0.9 })
    mocks.judgeHiddenRetractions.mockRejectedValue(new Error('jev down'))

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 0, droppedOps: 1 })
    expect(statusOf(hidden.id)).toEqual(ACTIVE)
  })

  it('never reconciles a retract that failed the durable or attribution check', async () => {
    seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    answers({ durable_0: 0.9, attributed_0: 0.1 })

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 0, droppedOps: 1 })
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
  })

  it('never reconciles a retract when verification is unavailable', async () => {
    seedClaim({ predicate: 'hobby', value: 'chess', channelId: 'private-channel' })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 0, droppedOps: 1 })
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
  })

  it('makes no extra calls at relaxed', async () => {
    mocks.config.memory.privacy = 'relaxed'
    seedClaim({ predicate: 'hobby', value: 'go', channelId: 'private-channel' })
    answers({ durable_0: 0.9, attributed_0: 0.9, retracts_0_0: 0.1 })

    const report = await run([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }])

    expect(report).toMatchObject({ retractedOps: 0 })
    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
    expect(mocks.judgeHiddenRetractions).not.toHaveBeenCalled()
  })
})
