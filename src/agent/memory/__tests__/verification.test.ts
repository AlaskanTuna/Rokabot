import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import { logger } from '../../../utils/logger.js'
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
import { registerChannelVisibility, resetChannelVisibilityForTest } from '../channelVisibility.js'
import { type OperationApplicationReport, verifyAndApplyOperations } from '../extractor.js'
import {
  assertClaim,
  assertGuildClaim,
  getActiveClaims,
  getActiveGuildClaims,
  rejectClaimIdsForSpeaker
} from '../memoryClaims.js'

function episode(): ExtractionEpisode {
  return {
    messages: [
      { messageId: 'm-1', userId: 'u-1', displayName: 'Mio', content: 'I like tea', timestamp: 1_000, isBot: false }
    ],
    context: [],
    startedAt: 1_000,
    endedAt: 1_000
  }
}

function add(value = 'tea', subjectUserId = 'u-1'): ExtractionOp {
  return { op: 'add', subject: { kind: 'user', userId: subjectUserId }, predicate: 'likes', value, tense: 'current' }
}

function guildPlan(
  value = 'Game night on September 26',
  date: { year: number; month: number; day: number } = { year: 2029, month: 9, day: 26 }
): ExtractionOp {
  return { op: 'add', subject: { kind: 'guild' }, predicate: 'plan', value, date }
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
    inputTokens: expect.any(Number),
    ...counts
  }
}

function output(...ops: ExtractionOp[]) {
  return { ops, summary: 'A member shared a preference.' }
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

const subject = { kind: 'user' as const, userId: 'u-1' }

function seedClaim(input: {
  predicate: string
  value: string
  period?: 'current' | 'past'
  sourceKind?: 'explicit' | 'passive'
  observedAt?: number
}) {
  return assertClaim({
    guildId: 'g-1',
    subjectUserId: 'u-1',
    sourceKind: 'passive',
    ...input
  })
}

function apply(ops: ExtractionOp[], answers: Record<string, number>) {
  setAnswers(Object.fromEntries(Object.entries(answers).map(([key, noul]) => [key, { noul }])))
  return verifyAndApplyOperations({
    guildId: 'g-1',
    channelId: 'c-1',
    episode: episode(),
    output: output(...ops),
    subjectIds: new Set([subject.userId])
  })
}

function factsWithStatus(status: string): Array<{ value: string; period: string }> {
  return getDb()
    .prepare('SELECT value, period FROM memory_claim WHERE subject_kind = ? AND status = ? ORDER BY period, id')
    .all('user', status) as Array<{ value: string; period: string }>
}

function activeFacts() {
  return factsWithStatus('active')
}

function candidateFacts() {
  return factsWithStatus('candidate')
}

function evidenceCount(claimId: number): number {
  return (
    getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(claimId) as {
      count: number
    }
  ).count
}

function statusOf(claimId: number) {
  return getDb().prepare('SELECT status, end_reason FROM memory_claim WHERE id = ?').get(claimId)
}

function jevApplied(question: string): number | undefined {
  return (
    getDb().prepare('SELECT applied FROM jev_events WHERE question = ?').get(question) as
      | { applied: number }
      | undefined
  )?.applied
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  mocks.memoryPrivacy = 'relaxed'
  mocks.judgeEpisodeOperations.mockReset()
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  resetChannelVisibilityForTest()
  vi.restoreAllMocks()
})

describe('verifyAndApplyOperations', () => {
  it('verifies all write operations in one batch and records numeric judgments only', async () => {
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add(), { op: 'noop' }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))

    expect(mocks.judgeEpisodeOperations).toHaveBeenCalledOnce()
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ value: 'tea', needsReview: false })])
    expect(getDb().prepare('SELECT question, answer, probability, confidence, applied FROM jev_events').all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: 'durable_0',
          answer: '0.9',
          probability: 0.9,
          confidence: null,
          applied: 1
        }),
        expect.objectContaining({
          question: 'attributed_0',
          answer: '0.9',
          probability: 0.9,
          confidence: null,
          applied: 1
        })
      ])
    )
    expect(JSON.stringify(getDb().prepare('SELECT * FROM jev_events').all())).not.toContain('I like tea')
  })

  it('links every verification judgment to the queue job', async () => {
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output(add()),
      subjectIds: new Set(['u-1']),
      jobId: 9
    })

    expect(getDb().prepare('SELECT job_id FROM jev_events').all()).toEqual(Array(4).fill({ job_id: 9 }))
  })

  it('reports the Jev input tokens it spent', async () => {
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toMatchObject({ inputTokens: 18 })
  })

  it('counts a re-staged candidate as staged but not changed', async () => {
    const staged = { status: 'candidate', needs_review: 1 }
    mocks.judgeEpisodeOperations.mockResolvedValue(null)
    const run = () =>
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })

    await expect(run()).resolves.toEqual(report({ appliedOps: 1, stagedOps: 1, changedOps: 1, inputTokens: 0 }))
    await expect(run()).resolves.toEqual(report({ appliedOps: 1, stagedOps: 1, changedOps: 0, inputTokens: 0 }))
    expect(getDb().prepare('SELECT status, needs_review FROM memory_claim').all()).toEqual([staged])
  })

  it('counts activating a staged candidate as a change', async () => {
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output(add()),
      subjectIds: new Set(['u-1'])
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, stagedOps: 0, changedOps: 1 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ value: 'tea', needsReview: false })])
  })

  it('does not request verification for noop-only output', async () => {
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({ op: 'noop' }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 0, duplicateOps: 0, changedOps: 0 }))
    expect(mocks.judgeEpisodeOperations).not.toHaveBeenCalled()
  })

  it('drops answers below threshold and accepts answers equal to threshold', async () => {
    setAnswers({
      durable_0: { noul: 0.49 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 }
    })
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([])

    setAnswers({
      durable_0: { noul: 0.5 },
      attributed_0: { noul: 0.5 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 }
    })
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add('coffee')),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))
  })

  it('adds evidence to an existing same-as claim instead of inserting a duplicate', async () => {
    const existing = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit',
      channelId: 'private-channel'
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'same_as_0_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 0, duplicateOps: 1, changedOps: 0 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: existing.id })])
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(existing.id)
    ).toEqual({
      count: 2
    })
  })

  it('does not offer a hidden richer claim as a same-as candidate at balanced', async () => {
    const hidden = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea with honey',
      sourceKind: 'explicit',
      channelId: 'private-channel'
    })
    mocks.memoryPrivacy = 'balanced'
    registerChannelVisibility({
      visibility: (channelId) => (channelId === 'c-1' ? 'public' : 'private'),
      parentOf: () => null
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add('tea')),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))

    expect(mocks.judgeEpisodeOperations.mock.calls[0][0].existing).not.toContainEqual(
      expect.objectContaining({ id: hidden.id })
    )
    expect(getActiveClaims('g-1', 'u-1')).toHaveLength(2)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(hidden.id)).toEqual({
      count: 1
    })
  })

  it('keeps exact-value restatements unaffected when the existing claim is hidden', async () => {
    const hidden = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit',
      channelId: 'private-channel'
    })
    mocks.memoryPrivacy = 'balanced'
    registerChannelVisibility({
      visibility: (channelId) => (channelId === 'c-1' ? 'public' : 'private'),
      parentOf: () => null
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 0 }))

    expect(mocks.judgeEpisodeOperations.mock.calls[0][0].existing).toEqual([])
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: hidden.id, value: 'tea' })])
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(hidden.id)).toEqual({
      count: 2
    })
  })

  it('refreshes an exact active value after verified attribution even when same-as is below threshold', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000)
    const existing = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive',
      observedAt: 1_000
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 },
      same_as_0_0: { noul: 0.1 }
    })

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 0, duplicateOps: 1, changedOps: 0 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: existing.id, lastSeenAt: 1_000 })])
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(existing.id)
    ).toEqual({
      count: 2
    })
  })

  it('does not refresh an exact active value when Jev verification is unavailable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(20_000)
    const existing = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive',
      observedAt: 1_000
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: existing.id, lastSeenAt: 1_000 })])
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(existing.id)
    ).toEqual({
      count: 1
    })
  })

  it('replaces claims and rejects removals by scoped ID without deleting history', async () => {
    const prior = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'changes_0'))
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'update',
          subject: { kind: 'user', userId: 'u-1' },
          existingId: prior.id,
          predicate: 'likes',
          value: 'green tea',
          tense: 'current'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))
    const replacement = getActiveClaims('g-1', 'u-1')[0]
    expect(replacement).toMatchObject({ value: 'green tea', status: 'active' })
    expect(
      getDb().prepare('SELECT status, superseded_by, end_reason FROM memory_claim WHERE id = ?').get(prior.id)
    ).toEqual({
      status: 'superseded',
      superseded_by: replacement.id,
      end_reason: 'superseded'
    })

    setAnswers(positiveAnswers('durable_0', 'attributed_0'))
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'remove',
          subject: { kind: 'user', userId: 'u-1' },
          existingId: replacement.id,
          predicate: 'likes',
          value: 'green tea'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))
    expect(
      getDb().prepare('SELECT status, superseded_by, end_reason FROM memory_claim WHERE id = ?').get(replacement.id)
    ).toEqual({
      status: 'rejected',
      superseded_by: null,
      end_reason: 'removed'
    })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 2 })
  })

  it('does not let an operation target another user’s claim ID', async () => {
    const other = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-2',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'remove',
          subject: { kind: 'user', userId: 'u-1' },
          existingId: other.id,
          predicate: 'likes',
          value: 'tea'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(getActiveClaims('g-1', 'u-2')).toEqual([expect.objectContaining({ id: other.id, status: 'active' })])
  })

  it('switches back to a superseded value through an add operation', async () => {
    const original = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'nickname',
      value: 'Rin',
      sourceKind: 'passive'
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 },
      same_as_0_0: { noul: 0.1 }
    })
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({
        op: 'add',
        subject: { kind: 'user', userId: 'u-1' },
        predicate: 'nickname',
        value: 'Rinnie',
        tense: 'current'
      }),
      subjectIds: new Set(['u-1'])
    })
    const replacement = getActiveClaims('g-1', 'u-1')[0]

    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 },
      same_as_0_0: { noul: 0.1 }
    })
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'add',
          subject: { kind: 'user', userId: 'u-1' },
          predicate: 'nickname',
          value: 'Rin',
          tense: 'current'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: original.id, value: 'Rin' })])
    expect(
      getDb().prepare('SELECT status, superseded_by, end_reason FROM memory_claim WHERE id = ?').get(replacement.id)
    ).toEqual({
      status: 'superseded',
      superseded_by: original.id,
      end_reason: 'superseded'
    })
  })

  it('switches back to a superseded value through an update operation', async () => {
    const original = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'nickname',
      value: 'Rin',
      sourceKind: 'passive'
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'changes_0'))
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({
        op: 'update',
        subject: { kind: 'user', userId: 'u-1' },
        existingId: original.id,
        predicate: 'nickname',
        value: 'Rinnie',
        tense: 'current'
      }),
      subjectIds: new Set(['u-1'])
    })
    const replacement = getActiveClaims('g-1', 'u-1')[0]

    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'changes_0'))
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'update',
          subject: { kind: 'user', userId: 'u-1' },
          existingId: replacement.id,
          predicate: 'nickname',
          value: 'Rin',
          tense: 'current'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: original.id, value: 'Rin' })])
    expect(
      getDb().prepare('SELECT status, superseded_by, end_reason FROM memory_claim WHERE id = ?').get(replacement.id)
    ).toEqual({
      status: 'superseded',
      superseded_by: original.id,
      end_reason: 'superseded'
    })
  })

  it('counts a passive assertion of a forgotten value as dropped without refreshing it', async () => {
    const forgotten = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'nickname',
      value: 'Rin',
      sourceKind: 'explicit',
      observedAt: 1_000
    })
    expect(rejectClaimIdsForSpeaker('g-1', 'u-1', [forgotten.id])).toBe(true)
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'add',
          subject: { kind: 'user', userId: 'u-1' },
          predicate: 'nickname',
          value: 'Rin',
          tense: 'current'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(
      getDb().prepare('SELECT status, last_seen_at, end_reason FROM memory_claim WHERE id = ?').get(forgotten.id)
    ).toEqual({
      status: 'rejected',
      last_seen_at: 1_000,
      end_reason: 'forgotten'
    })
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(forgotten.id)
    ).toEqual({
      count: 1
    })
  })

  it('drops an update targeting a forgotten value without retiring the active value', async () => {
    const active = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    const forgotten = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'coffee',
      sourceKind: 'explicit',
      observedAt: 1_000
    })
    expect(rejectClaimIdsForSpeaker('g-1', 'u-1', [forgotten.id])).toBe(true)
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'current_0', 'past_0', 'changes_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'update',
          subject: { kind: 'user', userId: 'u-1' },
          existingId: active.id,
          predicate: 'likes',
          value: 'coffee',
          tense: 'current'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: active.id, value: 'tea' })])
    expect(
      getDb().prepare('SELECT status, last_seen_at, end_reason FROM memory_claim WHERE id = ?').get(forgotten.id)
    ).toEqual({
      status: 'rejected',
      last_seen_at: 1_000,
      end_reason: 'forgotten'
    })
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(forgotten.id)
    ).toEqual({ count: 1 })
  })

  it.each(['timeout', 'partial answers'])('stages an add when verification has %s', async (failure) => {
    const info = vi.spyOn(logger, 'info')
    if (failure === 'timeout') mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    else
      mocks.judgeEpisodeOperations.mockResolvedValueOnce({
        answers: { durable_0: { noul: 0.9 } },
        latencyMs: 3,
        inputTokens: 2
      })

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, stagedOps: 1, changedOps: 1 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([])
    expect(getDb().prepare('SELECT status, needs_review FROM memory_claim').all()).toEqual([
      { status: 'candidate', needs_review: 1 }
    ])
    expect(info).toHaveBeenCalledWith(
      { guildId: 'g-1', channelId: 'c-1', stagedOps: 1 },
      'Staged unverified memory operations'
    )
    expect(JSON.stringify(info.mock.calls)).not.toContain('I like tea')
  })

  it('stages an unverified update without replacing its active predecessor', async () => {
    const prior = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({
        op: 'update',
        subject: { kind: 'user', userId: 'u-1' },
        existingId: prior.id,
        predicate: 'likes',
        value: 'green tea',
        tense: 'current'
      }),
      subjectIds: new Set(['u-1'])
    })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: prior.id, value: 'tea' })])
    expect(getDb().prepare('SELECT status, needs_review FROM memory_claim WHERE value = ?').get('green tea')).toEqual({
      status: 'candidate',
      needs_review: 1
    })
  })

  it('stages an unverified revival of a superseded value without changing the current value', async () => {
    const prior = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'favorite_game',
      value: 'old game',
      sourceKind: 'explicit'
    })
    const current = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'favorite_game',
      value: 'current game',
      sourceKind: 'explicit'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({
        op: 'add',
        subject: { kind: 'user', userId: 'u-1' },
        predicate: 'favorite_game',
        value: 'old game',
        tense: 'current'
      }),
      subjectIds: new Set(['u-1'])
    })

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: current.id, value: 'current game' })])
    expect(
      getDb().prepare('SELECT status, needs_review, superseded_by FROM memory_claim WHERE id = ?').get(prior.id)
    ).toEqual({ status: 'candidate', needs_review: 1, superseded_by: null })
  })

  it('refuses unsafe values after an unverified update', async () => {
    const prior = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({
        op: 'update',
        subject: { kind: 'user', userId: 'u-1' },
        existingId: prior.id,
        predicate: 'likes',
        value: 'green tea',
        tense: 'current'
      }),
      subjectIds: new Set(['u-1'])
    })

    setAnswers(positiveAnswers('durable_0', 'attributed_0'))
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add('alice@example.com')),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: prior.id, value: 'tea' })])
  })

  it('applies a guild plan with durable and guild-scope verification and records both answers', async () => {
    setAnswers(positiveAnswers('durable_0', 'guild_scoped_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(guildPlan()),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, changedOps: 1 }))

    expect(getActiveGuildClaims('g-1')).toEqual([
      expect.objectContaining({ predicate: 'plan', value: 'Game night on September 26', subjectUserId: null })
    ])
    expect(getActiveClaims('g-1', 'u-1')).toEqual([])
    expect(getDb().prepare('SELECT question, answer FROM jev_events ORDER BY question').all()).toEqual([
      { question: 'durable_0', answer: '0.9' },
      { question: 'guild_scoped_0', answer: '0.9' }
    ])
  })

  it('drops a guild operation below the guild-scope threshold', async () => {
    setAnswers({ durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.49 } })

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(guildPlan()),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 0 })
  })

  it.each(['timeout', 'partial answers'])('stages a valid guild plan when Jev has %s', async (failure) => {
    if (failure === 'timeout') mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    else
      mocks.judgeEpisodeOperations.mockResolvedValueOnce({
        answers: { durable_0: { noul: 0.9, confidence: null } },
        latencyMs: 3,
        inputTokens: 2
      })

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(guildPlan()),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, stagedOps: 1, changedOps: 1 }))
    expect(getDb().prepare("SELECT status, needs_review FROM memory_claim WHERE subject_kind = 'guild'").get()).toEqual(
      {
        status: 'candidate',
        needs_review: 1
      }
    )
    expect(getActiveGuildClaims('g-1')).toEqual([])
  })

  it('adds evidence to an existing guild fact for a same-as answer', async () => {
    const existing = assertGuildClaim({
      guildId: 'g-1',
      predicate: 'plan',
      value: 'Game night on September 26',
      expiresAt: Date.parse('2029-09-26T16:00:00Z'),
      sourceKind: 'passive'
    })
    setAnswers(positiveAnswers('durable_0', 'guild_scoped_0', 'same_as_0_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(guildPlan()),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 0, duplicateOps: 1, changedOps: 0 }))

    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(existing.id)
    ).toEqual({
      count: 2
    })
  })

  it.each(['another guild', 'a user subject'])('rejects a guild operation targeting an ID from %s', async (scope) => {
    const other =
      scope === 'another guild'
        ? assertGuildClaim({
            guildId: 'g-2',
            predicate: 'plan',
            value: 'Other game night',
            expiresAt: Date.parse('2029-09-26T16:00:00Z'),
            sourceKind: 'passive'
          })
        : assertClaim({
            guildId: 'g-1',
            subjectUserId: 'u-1',
            predicate: 'likes',
            value: 'tea',
            sourceKind: 'explicit'
          })
    setAnswers(positiveAnswers('durable_0', 'guild_scoped_0'))

    for (const op of ['update', 'remove'] as const) {
      await expect(
        verifyAndApplyOperations({
          guildId: 'g-1',
          channelId: 'c-1',
          episode: episode(),
          output: output(
            op === 'update'
              ? {
                  op,
                  subject: { kind: 'guild' },
                  existingId: other.id,
                  predicate: 'plan',
                  value: 'Revised game night',
                  date: { year: 2029, month: 9, day: 26 }
                }
              : {
                  op,
                  subject: { kind: 'guild' },
                  existingId: other.id,
                  predicate: 'plan',
                  value: 'Other game night'
                }
          ),
          subjectIds: new Set()
        })
      ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
      setAnswers(positiveAnswers('durable_0', 'guild_scoped_0'))
    }
    expect(getDb().prepare('SELECT status FROM memory_claim WHERE id = ?').get(other.id)).toEqual({ status: 'active' })
  })

  it('stages a guild update without replacing its active predecessor', async () => {
    const prior = assertGuildClaim({
      guildId: 'g-1',
      predicate: 'plan',
      value: 'Game night on September 25',
      expiresAt: Date.parse('2029-09-26T16:00:00Z'),
      sourceKind: 'passive'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'update',
          subject: { kind: 'guild' },
          existingId: prior.id,
          predicate: 'plan',
          value: 'Game night on September 26',
          date: { year: 2029, month: 9, day: 26 }
        }),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 1, droppedOps: 0, duplicateOps: 0, stagedOps: 1, changedOps: 1 }))
    expect(getDb().prepare("SELECT status, needs_review FROM memory_claim WHERE subject_kind = 'guild'").all()).toEqual(
      [
        { status: 'active', needs_review: 0 },
        { status: 'candidate', needs_review: 1 }
      ]
    )
    expect(getActiveGuildClaims('g-1')).toEqual([
      expect.objectContaining({ id: prior.id, value: 'Game night on September 25' })
    ])
  })

  it('drops a guild plan whose date components cannot be resolved before writing', async () => {
    setAnswers(positiveAnswers('durable_0', 'guild_scoped_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'plan',
          value: 'A plan with an incomplete relative date',
          date: { relative: 'next_week' }
        }),
        subjectIds: new Set()
      })
    ).resolves.toEqual(report({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, changedOps: 0 }))
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 0 })
  })
})

describe('tense, changes and retractions', () => {
  it('writes a past mention as a past fact and leaves the current one alone', async () => {
    const teacher = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.1, past_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 1, pastOps: 1, changedOps: 1 })
    expect(activeFacts()).toEqual([
      { value: 'teacher', period: 'current' },
      { value: 'nurse', period: 'past' }
    ])
    expect(evidenceCount(teacher.id)).toBe(1)
  })

  it('refreshes the current fact when the speaker still holds it', async () => {
    const nurse = seedClaim({ predicate: 'general_occupation', value: 'nurse' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'current' }],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.9, same_as_0_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, duplicateOps: 1, pastOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'nurse', period: 'current' }])
    expect(evidenceCount(nurse.id)).toBe(2)
  })

  it('treats a current claim Jev judges past as a past fact', async () => {
    await apply([{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      current_0: 0.1,
      past_0: 0.9
    })
    expect(activeFacts()).toEqual([{ value: 'chess', period: 'past' }])
  })

  it('drops a claim that Jev judges neither current nor past', async () => {
    const report = await apply([{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      current_0: 0.1,
      past_0: 0.1
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, pastOps: 0 })
    expect(activeFacts()).toEqual([])
  })

  it('refreshes the matching current fact and writes no past row when a past-tagged claim still holds', async () => {
    const nurse = seedClaim({ predicate: 'general_occupation', value: 'nurse' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.9, same_as_0_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, duplicateOps: 1, changedOps: 0, pastOps: 0, droppedOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'nurse', period: 'current' }])
    expect(evidenceCount(nurse.id)).toBe(2)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
  })

  it('drops a past-tagged claim that still holds when no current fact matches it', async () => {
    const teacher = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, pastOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'teacher', period: 'current' }])
    expect(evidenceCount(teacher.id)).toBe(1)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
  })

  it('does not refresh a past row when a past-tagged claim still holds', async () => {
    const past = seedClaim({ predicate: 'general_occupation', value: 'nurse', period: 'past' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.9, same_as_0_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, duplicateOps: 0, pastOps: 0 })
    expect(evidenceCount(past.id)).toBe(1)
    expect(activeFacts()).toEqual([{ value: 'nurse', period: 'past' }])
  })

  it('writes nothing for a past-tagged update that still holds and leaves its target alone', async () => {
    const teacher = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [
        {
          op: 'update',
          subject,
          existingId: teacher.id,
          predicate: 'general_occupation',
          value: 'nurse',
          tense: 'past'
        }
      ],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.9, changes_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, pastOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'teacher', period: 'current' }])
    expect(evidenceCount(teacher.id)).toBe(1)
  })

  it('does not let a past-tense claim become current when Jev says it is current', async () => {
    await apply([{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'past' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      current_0: 0.9,
      past_0: 0.1
    })
    expect(activeFacts()).toEqual([])
  })

  it('writes a past-tense update as a past fact without touching the claim it targeted', async () => {
    const teacher = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [
        {
          op: 'update',
          subject,
          existingId: teacher.id,
          predicate: 'general_occupation',
          value: 'nurse',
          tense: 'past'
        }
      ],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.1, past_0: 0.9, changes_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 1, pastOps: 1 })
    expect(activeFacts()).toEqual([
      { value: 'teacher', period: 'current' },
      { value: 'nurse', period: 'past' }
    ])
    expect(statusOf(teacher.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('keeps several past values of a single-value predicate side by side', async () => {
    seedClaim({ predicate: 'general_occupation', value: 'cashier', period: 'past' })
    await apply([{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      current_0: 0.1,
      past_0: 0.9,
      same_as_0_0: 0.1
    })
    expect(activeFacts()).toEqual([
      { value: 'cashier', period: 'past' },
      { value: 'nurse', period: 'past' }
    ])
  })

  it('turns an update that only rewords into evidence and keeps the wording', async () => {
    const claim = seedClaim({ predicate: 'teasing_habit', value: 'teases friends about their cooking' })
    const report = await apply(
      [
        {
          op: 'update',
          subject,
          existingId: claim.id,
          predicate: 'teasing_habit',
          value: 'jokes about how friends cook',
          tense: 'current'
        }
      ],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.5, changes_0: 0.1 }
    )
    expect(report).toMatchObject({ appliedOps: 0, duplicateOps: 1, rewordOps: 1, changedOps: 0, droppedOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'teases friends about their cooking', period: 'current' }])
    expect(evidenceCount(claim.id)).toBe(2)
    expect(jevApplied('changes_0')).toBe(0)
  })

  it('replaces the fact when an update really changes it', async () => {
    const claim = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [
        {
          op: 'update',
          subject,
          existingId: claim.id,
          predicate: 'general_occupation',
          value: 'nurse',
          tense: 'current'
        }
      ],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.1, changes_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 1, rewordOps: 0, changedOps: 1 })
    expect(activeFacts()).toEqual([{ value: 'nurse', period: 'current' }])
    expect(jevApplied('changes_0')).toBe(1)
  })

  it('never rewords evidence onto a past claim', async () => {
    const past = seedClaim({ predicate: 'general_occupation', value: 'nurse', period: 'past' })
    const report = await apply(
      [
        {
          op: 'update',
          subject,
          existingId: past.id,
          predicate: 'general_occupation',
          value: 'registered nurse',
          tense: 'current'
        }
      ],
      { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.1, changes_0: 0.1 }
    )
    expect(report).toMatchObject({ appliedOps: 0, rewordOps: 0, droppedOps: 1 })
    expect(evidenceCount(past.id)).toBe(1)
    expect(activeFacts()).toEqual([{ value: 'nurse', period: 'past' }])
  })

  it('retires a visible fact the speaker retracts', async () => {
    const claim = seedClaim({ predicate: 'hobby', value: 'chess' })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.9
    })
    expect(report).toMatchObject({ appliedOps: 1, changedOps: 1, retractedOps: 1, droppedOps: 0 })
    expect(statusOf(claim.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    expect(jevApplied('retracts_0_0')).toBe(1)
  })

  it('retires a visible fact filed under a sibling predicate of the retraction once Jev confirms it', async () => {
    const legacy = seedClaim({ predicate: 'favorite_game', value: 'chess' })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.9
    })
    expect(report).toMatchObject({ appliedOps: 1, changedOps: 1, retractedOps: 1, droppedOps: 0 })
    expect(statusOf(legacy.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    expect(jevApplied('retracts_0_0')).toBe(1)
  })

  it('asks about the named value under a sibling predicate before another value under the same predicate', async () => {
    const go = seedClaim({ predicate: 'hobby', value: 'go', observedAt: 2_000 })
    const legacy = seedClaim({ predicate: 'favorite_game', value: 'chess', observedAt: 1_000 })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.9,
      retracts_0_1: 0.1
    })
    expect(report).toMatchObject({ appliedOps: 1, retractedOps: 1 })
    expect(statusOf(legacy.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    expect(statusOf(go.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('leaves a claim of another category alone even when its value matches', async () => {
    const coach = seedClaim({ predicate: 'general_occupation', value: 'chess' })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, retractedOps: 0 })
    expect(statusOf(coach.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('retires only the claims whose own retraction question passes, the named value being asked first', async () => {
    const chess = seedClaim({ predicate: 'hobby', value: 'chess', observedAt: 1_000 })
    const go = seedClaim({ predicate: 'hobby', value: 'go', observedAt: 2_000 })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.1,
      retracts_0_1: 0.9
    })
    expect(report).toMatchObject({ appliedOps: 1, retractedOps: 1 })
    expect(statusOf(chess.id)).toEqual({ status: 'active', end_reason: null })
    expect(statusOf(go.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    expect(jevApplied('retracts_0_0')).toBe(0)
    expect(jevApplied('retracts_0_1')).toBe(1)
  })

  it.each([
    ['exactly', 'chess'],
    ['with other case and spacing', ' Chess  ']
  ])('retires a retracted value stored %s even when five newer claims share its predicate', async (_, stored) => {
    const chess = seedClaim({ predicate: 'hobby', value: stored, observedAt: 1_000 })
    const others = ['go', 'shogi', 'xiangqi', 'poker', 'bridge'].map((value, i) =>
      seedClaim({ predicate: 'hobby', value, observedAt: 2_000 + i })
    )
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.9,
      retracts_0_1: 0.1,
      retracts_0_2: 0.1,
      retracts_0_3: 0.1,
      retracts_0_4: 0.1
    })
    expect(report).toMatchObject({ appliedOps: 1, retractedOps: 1, droppedOps: 0 })
    expect(statusOf(chess.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    for (const other of others) expect(statusOf(other.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('retires nothing and drops the retraction when no retraction question passes', async () => {
    const claim = seedClaim({ predicate: 'hobby', value: 'chess' })
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      retracts_0_0: 0.1
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, changedOps: 0, retractedOps: 0 })
    expect(statusOf(claim.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('drops a retraction that matches no visible claim without error', async () => {
    const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
      durable_0: 0.9,
      attributed_0: 0.9
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, retractedOps: 0 })
  })

  it('never retires a fact when the retraction is unverified', async () => {
    const claim = seedClaim({ predicate: 'hobby', value: 'chess' })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    const report = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({ op: 'retract', subject, predicate: 'hobby', value: 'chess' }),
      subjectIds: new Set([subject.userId])
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, stagedOps: 0, retractedOps: 0 })
    expect(statusOf(claim.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('does not retire a retraction aimed at another member', async () => {
    const claim = seedClaim({ predicate: 'hobby', value: 'chess' })
    const report = await apply(
      [{ op: 'retract', subject: { kind: 'user', userId: 'u-2' }, predicate: 'hobby', value: 'chess' }],
      { durable_0: 0.9, attributed_0: 0.9 }
    )
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1 })
    expect(statusOf(claim.id)).toEqual({ status: 'active', end_reason: null })
  })

  it('drops a planned member fact', async () => {
    const report = await apply([{ op: 'add', subject, predicate: 'hobby', value: 'pottery', tense: 'planned' }], {
      durable_0: 0.9,
      attributed_0: 0.9,
      current_0: 0.2,
      past_0: 0.1
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1 })
    expect(activeFacts()).toEqual([])
  })

  it('drops a planned member fact even when verification is unavailable', async () => {
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    const report = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({ op: 'add', subject, predicate: 'hobby', value: 'pottery', tense: 'planned' }),
      subjectIds: new Set([subject.userId])
    })
    expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, stagedOps: 0 })
    expect(candidateFacts()).toEqual([])
  })

  it('stages with the proposed period when Jev leaves out the tense answers', async () => {
    seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    const report = await apply(
      [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
      { durable_0: 0.9, attributed_0: 0.9 }
    )
    expect(report).toMatchObject({ stagedOps: 1, pastOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'teacher', period: 'current' }])
    expect(candidateFacts()).toEqual([{ value: 'nurse', period: 'past' }])
  })

  it('stages a current claim as a current candidate when Jev leaves out the tense answers', async () => {
    seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    await apply([{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'current' }], {
      durable_0: 0.9,
      attributed_0: 0.9
    })
    expect(activeFacts()).toEqual([{ value: 'teacher', period: 'current' }])
    expect(candidateFacts()).toEqual([{ value: 'nurse', period: 'current' }])
  })

  it('stages a past-tense update as a past candidate and leaves its target alone', async () => {
    const teacher = seedClaim({ predicate: 'general_occupation', value: 'teacher' })
    await apply(
      [
        {
          op: 'update',
          subject,
          existingId: teacher.id,
          predicate: 'general_occupation',
          value: 'nurse',
          tense: 'past'
        }
      ],
      { durable_0: 0.9 }
    )
    expect(activeFacts()).toEqual([{ value: 'teacher', period: 'current' }])
    expect(candidateFacts()).toEqual([{ value: 'nurse', period: 'past' }])
  })

  it('stages a current mention even when the same value is already recorded as history', async () => {
    seedClaim({ predicate: 'hobby', value: 'chess', period: 'past' })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)
    const report = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: output({ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }),
      subjectIds: new Set([subject.userId])
    })
    expect(report).toMatchObject({ stagedOps: 1, droppedOps: 0 })
    expect(activeFacts()).toEqual([{ value: 'chess', period: 'past' }])
    expect(candidateFacts()).toEqual([{ value: 'chess', period: 'current' }])
  })

  describe('same-as candidates are scoped to the period being written', () => {
    it('compares a current add against current claims only', async () => {
      const past = seedClaim({ predicate: 'general_occupation', value: 'nurse', period: 'past' })
      const report = await apply(
        [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'current' }],
        { durable_0: 0.9, attributed_0: 0.9, current_0: 0.9, past_0: 0.1 }
      )
      expect(report).toMatchObject({ appliedOps: 1, duplicateOps: 0, stagedOps: 0 })
      expect(activeFacts()).toEqual([
        { value: 'nurse', period: 'current' },
        { value: 'nurse', period: 'past' }
      ])
      expect(evidenceCount(past.id)).toBe(1)
    })

    it('compares a past add against past claims only', async () => {
      const current = seedClaim({ predicate: 'general_occupation', value: 'nurse' })
      const report = await apply(
        [{ op: 'add', subject, predicate: 'general_occupation', value: 'nurse', tense: 'past' }],
        { durable_0: 0.9, attributed_0: 0.9, current_0: 0.1, past_0: 0.9 }
      )
      expect(report).toMatchObject({ appliedOps: 1, duplicateOps: 0, pastOps: 1, stagedOps: 0 })
      expect(activeFacts()).toEqual([
        { value: 'nurse', period: 'current' },
        { value: 'nurse', period: 'past' }
      ])
      expect(evidenceCount(current.id)).toBe(1)
    })

    it('adds evidence to an existing past claim for a reworded past mention', async () => {
      const past = seedClaim({ predicate: 'general_occupation', value: 'nurse', period: 'past' })
      const report = await apply(
        [{ op: 'add', subject, predicate: 'general_occupation', value: 'registered nurse', tense: 'past' }],
        { durable_0: 0.9, attributed_0: 0.9, current_0: 0.1, past_0: 0.9, same_as_0_0: 0.9 }
      )
      expect(report).toMatchObject({ appliedOps: 0, duplicateOps: 1, pastOps: 0 })
      expect(activeFacts()).toEqual([{ value: 'nurse', period: 'past' }])
      expect(evidenceCount(past.id)).toBe(2)
    })

    it('does not use current claims as same-as evidence for a current add that Jev demotes to past', async () => {
      const current = seedClaim({ predicate: 'hobby', value: 'chess' })
      const report = await apply([{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }], {
        durable_0: 0.9,
        attributed_0: 0.9,
        current_0: 0.1,
        past_0: 0.9,
        same_as_0_0: 0.9
      })
      expect(report).toMatchObject({ appliedOps: 1, duplicateOps: 0, pastOps: 1 })
      expect(activeFacts()).toEqual([
        { value: 'chess', period: 'current' },
        { value: 'chess', period: 'past' }
      ])
      expect(evidenceCount(current.id)).toBe(1)
    })

    it('targets only current claims with a retraction', async () => {
      const past = seedClaim({ predicate: 'hobby', value: 'chess', period: 'past' })
      const report = await apply([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], {
        durable_0: 0.9,
        attributed_0: 0.9,
        retracts_0_0: 0.9
      })
      expect(report).toMatchObject({ appliedOps: 0, droppedOps: 1, retractedOps: 0 })
      expect(statusOf(past.id)).toEqual({ status: 'active', end_reason: null })
    })
  })
})
