import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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

const mocks = vi.hoisted(() => ({ judge: vi.fn(), recordJevEvent: vi.fn() }))

vi.mock('../../../config.js', () => ({ config: testConfig }))
vi.mock('../../jev/recallJudgment.js', () => ({ RECALL_RUBRIC_VERSION: 'r1', judgeRecallCandidates: mocks.judge }))
vi.mock('../../../storage/jevEventStore.js', () => ({ recordJevEvent: mocks.recordJevEvent }))

import { closeDb } from '../../../storage/database.js'
import { setClaimEmbedding } from '../../../storage/memoryRecallStore.js'
import { upsertUserName } from '../../../storage/userNames.js'
import { resetChannelVisibilityForTest } from '../channelVisibility.js'
import { geminiVector } from '../embeddings/__tests__/vectors.js'
import { assertClaim } from '../memoryClaims.js'
import type { RecallInput } from '../recall.js'
import { runRecallGate } from '../recallGateRun.js'

const NOW = 1_000_000
const GUILD = 'guild-a'
const SCOPE = { guildId: GUILD, channelId: 'chan-a' }

const axis = (index: number): number[] => Array.from({ length: 768 }, (_, position) => (position === index ? 1 : 0))

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

function fact(userId: string, predicate: string, value: string, embedding: readonly number[] | null): number {
  const claim = assertClaim({
    guildId: GUILD,
    subjectUserId: userId,
    predicate,
    value,
    sourceKind: 'passive',
    channelId: 'chan-a',
    observedAt: NOW
  })
  if (embedding)
    setClaimEmbedding({ id: claim.id, embeddingText: `${predicate}: ${value}`, embedding: geminiVector(embedding) })
  return claim.id
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  Object.assign(testConfig.memory, memoryDefaults)
  mocks.judge.mockReset()
  mocks.recordJevEvent.mockReset()
  upsertUserName('speaker', 'speaker', 'Speaker')
})

afterEach(() => {
  resetChannelVisibilityForTest()
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

function args(overrides: { message?: string; mode?: 'shadow' | 'unified'; deadlineAt?: number } = {}) {
  return {
    input: input(overrides.message ? { message: overrides.message } : {}),
    speakerName: 'Mika',
    recentLines: [],
    nameOf: () => 'someone',
    deadlineAt: overrides.deadlineAt ?? performance.now() + 1000,
    mode: overrides.mode ?? 'shadow',
    channelId: 'chan-a',
    guildId: GUILD
  } as const
}

it('records one recall jev_events row for an attempted request, with no text, and returns gated items', async () => {
  const nickname = fact('speaker', 'nickname', 'Ali', axis(1))
  const chess = fact('speaker', 'hobby', 'chess', axis(1))
  mocks.judge.mockResolvedValueOnce({
    status: 'ok',
    probabilities: new Map([[`fact:${chess}`, 0.95]]),
    judgedKeys: [`fact:${chess}`],
    latencyMs: 410,
    inputTokens: 1800,
    usageUnknown: false
  })

  const { items, detail } = await runRecallGate(args({ message: 'any chess plans?' }))

  expect(items.map(({ id }) => id)).toEqual([nickname, chess])
  expect(detail).toMatchObject({
    v: 1,
    status: 'ok',
    core: [['fact', nickname]],
    selected: [
      ['fact', nickname],
      ['fact', chess]
    ]
  })
  expect(detail.shortlist).toEqual([['fact', chess, 0.95]])
  expect(mocks.recordJevEvent).toHaveBeenCalledTimes(1)
  const row = mocks.recordJevEvent.mock.calls[0][0]
  expect(row).toMatchObject({
    kind: 'recall',
    applied: false,
    probability: null,
    confidence: null,
    latencyMs: 410,
    inputTokens: 1800
  })
  expect(row.question).toBe(`recall:r1:${detail.ref}`)
  expect(JSON.stringify(row)).not.toMatch(/chess|Ali/)
})

it('writes no jev_events row when no request was attempted, and keeps core facts', async () => {
  const nickname = fact('speaker', 'nickname', 'Ali', axis(1))
  mocks.judge.mockResolvedValueOnce({
    status: 'skipped',
    probabilities: null,
    judgedKeys: [],
    latencyMs: 0,
    inputTokens: 0,
    usageUnknown: false
  })
  const { items, detail } = await runRecallGate(args())
  expect(items.map(({ id }) => id)).toEqual([nickname])
  expect(detail.status).toBe('skipped')
  expect(mocks.recordJevEvent).not.toHaveBeenCalled()
})

it('passes the time left before the deadline and marks applied only in unified mode with a non-core pick', async () => {
  const chess = fact('speaker', 'hobby', 'chess', axis(1))
  mocks.judge.mockResolvedValueOnce({
    status: 'ok',
    probabilities: new Map([[`fact:${chess}`, 0.99]]),
    judgedKeys: [`fact:${chess}`],
    latencyMs: 5,
    inputTokens: 5,
    usageUnknown: false
  })
  await runRecallGate(args({ mode: 'unified', deadlineAt: performance.now() + 700 }))
  expect(mocks.judge.mock.calls[0][1].timeoutMs).toBeGreaterThan(600)
  expect(mocks.recordJevEvent.mock.calls[0][0].applied).toBe(true)
})
