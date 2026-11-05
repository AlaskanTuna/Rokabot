import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import type { ExtractionOp } from '../extractionSchema.js'

const mocks = vi.hoisted(() => ({ judgeEpisodeOperations: vi.fn(), memoryPrivacy: 'relaxed' }))

vi.mock('../../jev/judgments.js', () => ({ judgeEpisodeOperations: mocks.judgeEpisodeOperations }))
vi.mock('../../../config.js', () => ({
  config: {
    gemini: { apiKey: 'test-key', extractionModel: 'test-model', safetyThreshold: 'OFF', timeout: 5000 },
    logging: { level: 'silent' },
    memory: {
      maxActiveClaimsPerUser: 20,
      verifyThreshold: 0.5,
      get privacy() {
        return mocks.memoryPrivacy
      }
    },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { getClaimSourceChannels } from '../../../storage/memoryRecallStore.js'
import { registerChannelVisibility, resetChannelVisibilityForTest } from '../channelVisibility.js'
import { type OperationApplicationReport, verifyAndApplyOperations } from '../extractor.js'
import { assertClaim, getActiveClaims } from '../memoryClaims.js'
import { canRecall } from '../privacy.js'

function episode(): ExtractionEpisode {
  return {
    messages: [
      { messageId: 'm-1', userId: 'u-1', displayName: 'Mio', content: 'I like tea', timestamp: 1_000, isBot: false },
      { messageId: 'm-2', userId: 'u-2', displayName: 'Rin', content: 'I like coffee', timestamp: 2_000, isBot: false },
      { messageId: 'm-3', userId: 'bot-1', displayName: 'Roka', content: 'Nice', timestamp: 3_000, isBot: true }
    ],
    context: [],
    startedAt: 1_000,
    endedAt: 3_000
  }
}

function add(value = 'tea', sourceLine?: number): ExtractionOp {
  return {
    op: 'add',
    subject: { kind: 'user', userId: 'u-1' },
    predicate: 'likes',
    value,
    tense: 'current',
    ...(sourceLine === undefined ? {} : { sourceLine })
  }
}

function report(counts: Partial<OperationApplicationReport> = {}): OperationApplicationReport {
  return {
    appliedOps: 0,
    droppedOps: 0,
    duplicateOps: 0,
    stagedOps: 0,
    changedOps: 0,
    pastOps: 0,
    rewordOps: 0,
    retractedOps: 0,
    judgedOutOps: 0,
    uncited: 0,
    inputTokens: expect.any(Number),
    ...counts
  }
}

function setAnswers(answers: Record<string, { noul: number }>) {
  mocks.judgeEpisodeOperations.mockResolvedValueOnce({
    answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, { ...value, confidence: null }])),
    latencyMs: 12,
    inputTokens: 18
  })
}

function positiveAnswers(...keys: string[]): Record<string, { noul: number }> {
  return Object.fromEntries(keys.map((key) => [key, { noul: 0.9 }]))
}

function userAnswers() {
  return positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0')
}

function run(ops: ExtractionOp[], jobId?: number) {
  setAnswers(userAnswers())
  return verifyAndApplyOperations({
    guildId: 'g-1',
    channelId: 'c-1',
    episode: episode(),
    output: { ops, summary: 'A member shared a preference.' },
    subjectIds: new Set(['u-1']),
    jobId
  })
}

function evidenceRows(claimId: number) {
  return getDb()
    .prepare(
      'SELECT job_id, source_message_id, speaker_user_id, channel_id FROM memory_evidence WHERE claim_id = ? ORDER BY id'
    )
    .all(claimId) as Array<{
    job_id: number | null
    source_message_id: string | null
    speaker_user_id: string | null
    channel_id: string | null
  }>
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  mocks.memoryPrivacy = 'relaxed'
  mocks.judgeEpisodeOperations.mockReset()
  getDb()
})

afterEach(() => {
  resetChannelVisibilityForTest()
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

describe('evidence provenance', () => {
  it('stores the cited message and speaker on a valid citation', async () => {
    await expect(run([add('tea', 1)], 7)).resolves.toEqual(report({ appliedOps: 1, changedOps: 1, uncited: 0 }))

    const [claim] = getActiveClaims('g-1', 'u-1')
    expect(evidenceRows(claim.id)).toEqual([
      { job_id: 7, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' }
    ])
  })

  it.each([
    ['a missing line', undefined],
    ['line zero', 0],
    ['a line out of range', 99],
    ['a bot line', 3],
    ["another member's line", 2]
  ])('keeps only the job when the citation is %s, and still applies the op', async (_, sourceLine) => {
    await expect(run([add('tea', sourceLine)], 7)).resolves.toEqual(
      report({ appliedOps: 1, changedOps: 1, uncited: 1 })
    )

    const [claim] = getActiveClaims('g-1', 'u-1')
    expect(evidenceRows(claim.id)).toEqual([
      { job_id: 7, source_message_id: null, speaker_user_id: null, channel_id: 'c-1' }
    ])
  })

  it('lets a guild fact cite any human line', async () => {
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: Object.fromEntries(
        Object.entries(positiveAnswers('durable_0', 'guild_scoped_0')).map(([key, value]) => [
          key,
          { ...value, confidence: null }
        ])
      ),
      latencyMs: 12,
      inputTokens: 18
    })
    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [{ op: 'add', subject: { kind: 'guild' }, predicate: 'rule', value: 'No spoilers', sourceLine: 2 }],
        summary: 'Members agreed a rule.'
      },
      subjectIds: new Set(['u-1']),
      jobId: 7
    })

    expect(result).toEqual(report({ appliedOps: 1, changedOps: 1, uncited: 0 }))
    const row = getDb().prepare('SELECT job_id, source_message_id, speaker_user_id FROM memory_evidence').get() as {
      job_id: number | null
      source_message_id: string | null
      speaker_user_id: string | null
    }
    expect(row).toEqual({ job_id: 7, source_message_id: 'm-2', speaker_user_id: 'u-2' })
  })

  it('leaves one evidence row with the first confidence and salience when a job retries', async () => {
    await run([add('tea', 1)], 7)
    const [first] = getActiveClaims('g-1', 'u-1')

    setAnswers({ ...userAnswers(), ...positiveAnswers('same_as_0_0') })
    const retry = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: { ops: [add('tea', 2)], summary: 'A member shared a preference.' },
      subjectIds: new Set(['u-1']),
      jobId: 7
    })

    expect(retry).toEqual(report({ duplicateOps: 1, uncited: 1 }))
    const [second] = getActiveClaims('g-1', 'u-1')
    expect(evidenceRows(second.id)).toHaveLength(1)
    expect(evidenceRows(second.id)).toEqual([
      { job_id: 7, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' }
    ])
    expect(second.confidence).toBe(first.confidence)
    expect(second.salience).toBe(first.salience)
  })

  it('does not revive a claim the first run retracted when the job retries', async () => {
    const seeded = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'nickname',
      value: 'Rin',
      sourceKind: 'explicit'
    })
    const ops: ExtractionOp[] = [
      {
        op: 'add',
        subject: { kind: 'user', userId: 'u-1' },
        predicate: 'nickname',
        value: 'Rin',
        tense: 'current',
        sourceLine: 1
      },
      { op: 'retract', subject: { kind: 'user', userId: 'u-1' }, predicate: 'nickname', value: 'Rin' }
    ]
    setAnswers({
      ...positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'same_as_0_0'),
      ...positiveAnswers('durable_1', 'attributed_1', 'retracts_1_0')
    })
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: { ops, summary: 'A member dropped a nickname.' },
      subjectIds: new Set(['u-1']),
      jobId: 7
    })
    expect(getDb().prepare('SELECT status, end_reason FROM memory_claim WHERE id = ?').get(seeded.id)).toEqual({
      status: 'rejected',
      end_reason: 'retracted'
    })
    expect(evidenceRows(seeded.id)).toHaveLength(2)

    setAnswers({
      ...positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'),
      ...positiveAnswers('durable_1', 'attributed_1')
    })
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: { ops, summary: 'A member dropped a nickname.' },
      subjectIds: new Set(['u-1']),
      jobId: 7
    })

    expect(getDb().prepare('SELECT status, end_reason FROM memory_claim WHERE id = ?').get(seeded.id)).toEqual({
      status: 'rejected',
      end_reason: 'retracted'
    })
    expect(evidenceRows(seeded.id)).toHaveLength(2)
    expect(getActiveClaims('g-1', 'u-1')).toEqual([])
  })

  it('gives a hidden richer private fact no evidence from a brief public restatement', async () => {
    const hidden = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'single-origin Yunnan black tea at dawn',
      sourceKind: 'explicit',
      channelId: 'private-channel'
    })
    mocks.memoryPrivacy = 'balanced'
    registerChannelVisibility({
      visibility: (channelId) => (channelId === 'c-1' ? 'public' : 'private'),
      parentOf: () => null
    })

    await run([add('tea', 1)], 7)

    expect(mocks.judgeEpisodeOperations.mock.calls[0][0].existing).toEqual([])
    expect(evidenceRows(hidden.id)).toEqual([
      { job_id: null, source_message_id: null, speaker_user_id: null, channel_id: 'private-channel' }
    ])
    const sources = getClaimSourceChannels([hidden.id]).get(hidden.id) ?? [null]
    expect(canRecall(sources, { guildId: 'g-1', channelId: 'c-1' }, 'balanced')).toBe(false)
    expect(getActiveClaims('g-1', 'u-1').map(({ value }) => value)).toEqual(
      expect.arrayContaining(['single-origin Yunnan black tea at dawn', 'tea'])
    )
  })

  it('writes one evidence row per job when two jobs cite the same fact', async () => {
    await run([add('tea', 1)], 7)
    setAnswers({ ...userAnswers(), ...positiveAnswers('same_as_0_0') })
    const second = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: { ops: [add('tea', 1)], summary: 'A member shared a preference.' },
      subjectIds: new Set(['u-1']),
      jobId: 8
    })

    expect(second).toEqual(report({ duplicateOps: 1, uncited: 0 }))
    const [claim] = getActiveClaims('g-1', 'u-1')
    expect(evidenceRows(claim.id)).toEqual([
      { job_id: 7, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' },
      { job_id: 8, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' }
    ])
  })

  it('adds a row per write when no job cites the fact', async () => {
    await run([add('tea', 1)], undefined)
    setAnswers({ ...userAnswers(), ...positiveAnswers('same_as_0_0') })
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: { ops: [add('tea', 1)], summary: 'A member shared a preference.' },
      subjectIds: new Set(['u-1']),
      jobId: undefined
    })

    const [claim] = getActiveClaims('g-1', 'u-1')
    expect(evidenceRows(claim.id)).toEqual([
      { job_id: null, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' },
      { job_id: null, source_message_id: 'm-1', speaker_user_id: 'u-1', channel_id: 'c-1' }
    ])
  })
})
