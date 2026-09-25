import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import type { ExtractionOp } from '../extractionSchema.js'

const mocks = vi.hoisted(() => ({ judgeEpisodeOperations: vi.fn() }))

vi.mock('../../jev/judgments.js', () => ({ judgeEpisodeOperations: mocks.judgeEpisodeOperations }))
vi.mock('../../../config.js', () => ({
  config: {
    gemini: { apiKey: 'test-key', extractionModel: 'test-model', safetyThreshold: 'OFF', timeout: 5000 },
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20, verifyThreshold: 0.5 },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { verifyAndApplyOperations } from '../extractor.js'
import { assertClaim, assertGuildClaim, getActiveClaims, getActiveGuildClaims } from '../memoryClaims.js'

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
  return { op: 'add', subject: { kind: 'user', userId: subjectUserId }, predicate: 'likes', value }
}

function guildPlan(
  value = 'Game night on September 26',
  date: { year: number; month: number; day: number } = { year: 2029, month: 9, day: 26 }
): ExtractionOp {
  return { op: 'add', subject: { kind: 'guild' }, predicate: 'plan', value, date }
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

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  mocks.judgeEpisodeOperations.mockReset()
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

describe('verifyAndApplyOperations', () => {
  it('verifies all write operations in one batch and records numeric judgments only', async () => {
    setAnswers(positiveAnswers('durable_0', 'attributed_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add(), { op: 'noop' }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })

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

  it('does not request verification for noop-only output', async () => {
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output({ op: 'noop' }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 0, duplicateOps: 0 })
    expect(mocks.judgeEpisodeOperations).not.toHaveBeenCalled()
  })

  it('drops answers below threshold and accepts answers equal to threshold', async () => {
    setAnswers({ durable_0: { noul: 0.49 }, attributed_0: { noul: 0.9 } })
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([])

    setAnswers({ durable_0: { noul: 0.5 }, attributed_0: { noul: 0.5 } })
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add('coffee')),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
  })

  it('adds evidence to an existing same-as claim instead of inserting a duplicate', async () => {
    const existing = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    setAnswers(positiveAnswers('durable_0', 'attributed_0', 'same_as_0_0'))

    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add()),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 0, duplicateOps: 1 })

    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: existing.id })])
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_evidence WHERE claim_id = ?').get(existing.id)
    ).toEqual({
      count: 2
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
    setAnswers(positiveAnswers('durable_0', 'attributed_0'))
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
          value: 'green tea'
        }),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
    const replacement = getActiveClaims('g-1', 'u-1')[0]
    expect(replacement).toMatchObject({ value: 'green tea', status: 'active' })
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_claim WHERE id = ?').get(prior.id)).toEqual({
      status: 'superseded',
      superseded_by: replacement.id
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
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_claim WHERE id = ?').get(replacement.id)).toEqual({
      status: 'rejected',
      superseded_by: null
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
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
    expect(getActiveClaims('g-1', 'u-2')).toEqual([expect.objectContaining({ id: other.id, status: 'active' })])
  })

  it.each(['timeout', 'partial answers'])('marks an add for review when verification has %s', async (failure) => {
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
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ value: 'tea', needsReview: true })])
  })

  it('marks an update for review when verification fails and refuses unsafe values', async () => {
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
        value: 'green tea'
      }),
      subjectIds: new Set(['u-1'])
    })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ value: 'green tea', needsReview: true })])

    setAnswers(positiveAnswers('durable_0', 'attributed_0'))
    await expect(
      verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: output(add('alice@example.com')),
        subjectIds: new Set(['u-1'])
      })
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
    expect(getActiveClaims('g-1', 'u-1')).toHaveLength(1)
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
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })

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
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 0 })
  })

  it.each(['timeout', 'partial answers'])('marks a valid guild plan for review when Jev has %s', async (failure) => {
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
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
    expect(getDb().prepare("SELECT status, needs_review FROM memory_claim WHERE subject_kind = 'guild'").get()).toEqual(
      {
        status: 'active',
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
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 0, duplicateOps: 1 })

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
      ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
      setAnswers(positiveAnswers('durable_0', 'guild_scoped_0'))
    }
    expect(getDb().prepare('SELECT status FROM memory_claim WHERE id = ?').get(other.id)).toEqual({ status: 'active' })
  })

  it('marks a guild update for review when Jev verification fails', async () => {
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
    ).resolves.toEqual({ appliedOps: 1, droppedOps: 0, duplicateOps: 0 })
    expect(getDb().prepare("SELECT status, needs_review FROM memory_claim WHERE subject_kind = 'guild'").all()).toEqual(
      [
        { status: 'superseded', needs_review: 0 },
        { status: 'active', needs_review: 1 }
      ]
    )
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
    ).resolves.toEqual({ appliedOps: 0, droppedOps: 1, duplicateOps: 0 })
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 0 })
  })
})
