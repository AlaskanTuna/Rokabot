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
import { type OperationApplicationReport, verifyAndApplyOperations } from '../extractor.js'
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
    uncited: 1,
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

function statusOf(claimId: number) {
  return getDb().prepare('SELECT status, end_reason FROM memory_claim WHERE id = ?').get(claimId)
}

function evidenceChannels(claimId: number): Array<string | null> {
  return (
    getDb().prepare('SELECT channel_id FROM memory_evidence WHERE claim_id = ? ORDER BY id').all(claimId) as Array<{
      channel_id: string | null
    }>
  ).map((row) => row.channel_id)
}

function freshEvidenceChannels(before: Set<number>): Array<string | null> {
  return (
    getDb().prepare('SELECT id, channel_id FROM memory_evidence').all() as Array<{
      id: number
      channel_id: string | null
    }>
  )
    .filter((row) => !before.has(row.id))
    .map((row) => row.channel_id)
}

function jevApplied(question: string): number | undefined {
  return (
    getDb().prepare('SELECT applied FROM jev_events WHERE question = ?').get(question) as
      | { applied: number }
      | undefined
  )?.applied
}

function seedUser(predicate: 'hobby' | 'likes' | 'nickname' | 'general_occupation' | 'teasing_habit', value: string) {
  return assertClaim({ guildId: 'g-1', subjectUserId: 'u-1', predicate, value, sourceKind: 'explicit' })
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
  vi.restoreAllMocks()
})

describe('operation applier dispatch', () => {
  it('applies one add, update, remove and retract batch through the shared context', async () => {
    const chess = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit'
    })
    const tea = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    const go = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'hobby',
      value: 'go',
      sourceKind: 'explicit'
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.1 },
      durable_1: { noul: 0.9 },
      attributed_1: { noul: 0.9 },
      current_1: { noul: 0.9 },
      past_1: { noul: 0.1 },
      changes_1: { noul: 0.9 },
      durable_2: { noul: 0.9 },
      attributed_2: { noul: 0.9 },
      durable_3: { noul: 0.9 },
      attributed_3: { noul: 0.9 },
      retracts_3_0: { noul: 0.9 },
      retracts_3_1: { noul: 0.1 },
      retracts_3_2: { noul: 0.1 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'nickname',
            value: 'Rinnie',
            tense: 'current'
          },
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: tea.id,
            predicate: 'likes',
            value: 'green tea',
            tense: 'current'
          },
          {
            op: 'remove',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: go.id,
            predicate: 'hobby',
            value: 'go'
          },
          { op: 'retract', subject: { kind: 'user', userId: 'u-1' }, predicate: 'hobby', value: 'chess' }
        ] as ExtractionOp[],
        summary: 'A member shared several updates.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ appliedOps: 4, changedOps: 4, retractedOps: 1, uncited: 2 }))
    expect(statusOf(chess.id)).toEqual({ status: 'rejected', end_reason: 'retracted' })
    expect(statusOf(go.id)).toEqual({ status: 'rejected', end_reason: 'removed' })
    expect(statusOf(tea.id)).toEqual({ status: 'superseded', end_reason: 'superseded' })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([
      expect.objectContaining({ predicate: 'likes', value: 'green tea' }),
      expect.objectContaining({ predicate: 'nickname', value: 'Rinnie' })
    ])
  })

  it('drops an update whose predicate does not match its target instead of inserting a past row', async () => {
    const tea = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.1 },
      past_0: { noul: 0.9 },
      changes_0: { noul: 0.9 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: tea.id,
            predicate: 'general_occupation',
            value: 'nurse',
            tense: 'past'
          }
        ] as ExtractionOp[],
        summary: 'A member shared history.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ droppedOps: 1 }))
    expect(statusOf(tea.id)).toEqual({ status: 'active', end_reason: null })
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: tea.id, value: 'tea' })])
  })

  it('stages an unverified add and an unverified update together without touching the active claim', async () => {
    const tea = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'hobby',
            value: 'go',
            tense: 'current'
          },
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: tea.id,
            predicate: 'likes',
            value: 'green tea',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member shared updates.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ appliedOps: 2, stagedOps: 2, changedOps: 2, uncited: 2 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([expect.objectContaining({ id: tea.id, value: 'tea' })])
    expect(
      getDb().prepare("SELECT value, status FROM memory_claim WHERE status = 'candidate' ORDER BY value").all()
    ).toEqual([
      { value: 'go', status: 'candidate' },
      { value: 'green tea', status: 'candidate' }
    ])
  })

  describe('evidence channel', () => {
    type ChannelCase = {
      name: string
      setup: () => { ops: ExtractionOp[]; answers: Record<string, { noul: number }> }
      expected: Partial<OperationApplicationReport>
    }

    const channelCases: ChannelCase[] = [
      {
        name: 'past-tagged restatement refresh',
        setup: () => {
          seedUser('likes', 'tea')
          return {
            ops: [
              {
                op: 'add',
                subject: { kind: 'user', userId: 'u-1' },
                predicate: 'likes',
                value: 'tea',
                tense: 'past'
              }
            ],
            answers: {
              durable_0: { noul: 0.9 },
              attributed_0: { noul: 0.9 },
              current_0: { noul: 0.9 },
              past_0: { noul: 0.9 }
            }
          }
        },
        expected: { duplicateOps: 1 }
      },
      {
        name: 'reworded update',
        setup: () => {
          const claim = seedUser('teasing_habit', 'teases friends about their cooking')
          return {
            ops: [
              {
                op: 'update',
                subject: { kind: 'user', userId: 'u-1' },
                existingId: claim.id,
                predicate: 'teasing_habit',
                value: 'jokes about how friends cook',
                tense: 'current'
              }
            ],
            answers: {
              durable_0: { noul: 0.9 },
              attributed_0: { noul: 0.9 },
              current_0: { noul: 0.9 },
              past_0: { noul: 0.5 },
              changes_0: { noul: 0.1 }
            }
          }
        },
        expected: { duplicateOps: 1, rewordOps: 1 }
      },
      {
        name: 'exact same-as',
        setup: () => {
          seedUser('likes', 'tea')
          return {
            ops: [
              {
                op: 'add',
                subject: { kind: 'user', userId: 'u-1' },
                predicate: 'likes',
                value: 'tea',
                tense: 'current'
              }
            ],
            answers: {
              durable_0: { noul: 0.9 },
              attributed_0: { noul: 0.9 },
              current_0: { noul: 0.9 },
              past_0: { noul: 0.1 },
              same_as_0_0: { noul: 0.9 }
            }
          }
        },
        expected: { duplicateOps: 1 }
      },
      {
        name: 'judged same-as',
        setup: () => {
          seedUser('likes', 'tea')
          return {
            ops: [
              {
                op: 'add',
                subject: { kind: 'user', userId: 'u-1' },
                predicate: 'likes',
                value: 'coffee',
                tense: 'current'
              }
            ],
            answers: {
              durable_0: { noul: 0.9 },
              attributed_0: { noul: 0.9 },
              current_0: { noul: 0.9 },
              past_0: { noul: 0.1 },
              same_as_0_0: { noul: 0.9 }
            }
          }
        },
        expected: { duplicateOps: 1 }
      },
      {
        name: 'guild insert',
        setup: () => ({
          ops: [
            {
              op: 'add',
              subject: { kind: 'guild' },
              predicate: 'plan',
              value: 'Game night on September 26',
              date: { year: 2029, month: 9, day: 26 }
            }
          ],
          answers: { durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.9 } }
        }),
        expected: { appliedOps: 1, changedOps: 1 }
      },
      {
        name: 'user insert',
        setup: () => ({
          ops: [
            {
              op: 'add',
              subject: { kind: 'user', userId: 'u-1' },
              predicate: 'hobby',
              value: 'go',
              tense: 'current'
            }
          ],
          answers: {
            durable_0: { noul: 0.9 },
            attributed_0: { noul: 0.9 },
            current_0: { noul: 0.9 },
            past_0: { noul: 0.1 }
          }
        }),
        expected: { appliedOps: 1, changedOps: 1 }
      },
      {
        name: 'guild replace',
        setup: () => {
          const prior = assertGuildClaim({
            guildId: 'g-1',
            predicate: 'rule',
            value: 'Old rule',
            expiresAt: null,
            sourceKind: 'explicit'
          })
          return {
            ops: [
              {
                op: 'update',
                subject: { kind: 'guild' },
                existingId: prior.id,
                predicate: 'rule',
                value: 'New rule'
              }
            ],
            answers: { durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.9 } }
          }
        },
        expected: { appliedOps: 1, changedOps: 1 }
      },
      {
        name: 'user replace',
        setup: () => {
          const tea = seedUser('likes', 'tea')
          return {
            ops: [
              {
                op: 'update',
                subject: { kind: 'user', userId: 'u-1' },
                existingId: tea.id,
                predicate: 'likes',
                value: 'green tea',
                tense: 'current'
              }
            ],
            answers: {
              durable_0: { noul: 0.9 },
              attributed_0: { noul: 0.9 },
              current_0: { noul: 0.9 },
              past_0: { noul: 0.1 },
              changes_0: { noul: 0.9 }
            }
          }
        },
        expected: { appliedOps: 1, changedOps: 1 }
      }
    ]

    it.each(channelCases)('records the channel on $name', async ({ setup, expected }) => {
      const { ops, answers } = setup()
      setAnswers(answers)
      const before = new Set(
        (getDb().prepare('SELECT id FROM memory_evidence').all() as Array<{ id: number }>).map((row) => row.id)
      )
      const result = await verifyAndApplyOperations({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        output: { ops, summary: 'A member shared a fact.' },
        subjectIds: new Set(['u-1'])
      })
      expect(result).toEqual(report(expected))
      const fresh = freshEvidenceChannels(before)
      expect(fresh.length).toBeGreaterThan(0)
      expect(fresh).toEqual(fresh.map(() => 'c-1'))
    })
  })

  it('does not count evidence toward a row retired earlier in the batch for an exact restatement', async () => {
    const go = seedUser('hobby', 'go')
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      durable_1: { noul: 0.9 },
      attributed_1: { noul: 0.9 },
      current_1: { noul: 0.9 },
      past_1: { noul: 0.1 },
      same_as_1_0: { noul: 0.9 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'remove',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: go.id,
            predicate: 'hobby',
            value: 'go'
          },
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'hobby',
            value: 'go',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member removed then restated a fact.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ appliedOps: 1, droppedOps: 1, changedOps: 1 }))
    expect(statusOf(go.id)).toEqual({ status: 'rejected', end_reason: 'removed' })
    expect(evidenceChannels(go.id)).toEqual([null])
    expect(jevApplied('same_as_1_0')).toBe(0)
  })

  it('does not count evidence toward a row retired earlier in the batch for a judged restatement', async () => {
    const tea = seedUser('likes', 'tea')
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      durable_1: { noul: 0.9 },
      attributed_1: { noul: 0.9 },
      current_1: { noul: 0.9 },
      past_1: { noul: 0.1 },
      same_as_1_0: { noul: 0.9 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'remove',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: tea.id,
            predicate: 'likes',
            value: 'tea'
          },
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'likes',
            value: 'coffee',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member removed then reworded a fact.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ appliedOps: 1, droppedOps: 1, changedOps: 1 }))
    expect(statusOf(tea.id)).toEqual({ status: 'rejected', end_reason: 'removed' })
    expect(evidenceChannels(tea.id)).toEqual([null])
    expect(jevApplied('same_as_1_0')).toBe(0)
  })

  it('removes a guild fact without touching history', async () => {
    const rule = assertGuildClaim({
      guildId: 'g-1',
      predicate: 'rule',
      value: 'Old rule',
      expiresAt: null,
      sourceKind: 'explicit'
    })
    setAnswers({ durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.9 } })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'remove',
            subject: { kind: 'guild' },
            existingId: rule.id,
            predicate: 'rule',
            value: 'Old rule'
          }
        ] as ExtractionOp[],
        summary: 'The server dropped a rule.'
      },
      subjectIds: new Set()
    })

    expect(result).toEqual(report({ appliedOps: 1, changedOps: 1, uncited: 0 }))
    expect(statusOf(rule.id)).toEqual({ status: 'rejected', end_reason: 'removed' })
    expect(getActiveGuildClaims('g-1')).toEqual([])
  })

  it('writes a past-resolved update as a past fact and never rewords the current row', async () => {
    const teacher = seedUser('general_occupation', 'teacher')
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.1 },
      past_0: { noul: 0.9 },
      changes_0: { noul: 0.1 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: teacher.id,
            predicate: 'general_occupation',
            value: 'nurse',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member shared history.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ appliedOps: 1, changedOps: 1, pastOps: 1 }))
    expect(getActiveClaims('g-1', 'u-1')).toEqual([
      expect.objectContaining({ value: 'teacher', period: 'current' }),
      expect.objectContaining({ value: 'nurse', period: 'past' })
    ])
    expect(evidenceChannels(teacher.id)).toEqual([null])
  })

  it('drops an unverified update aimed at a past claim instead of staging a row', async () => {
    const nurse = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'general_occupation',
      value: 'nurse',
      sourceKind: 'explicit',
      period: 'past'
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce(null)

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: nurse.id,
            predicate: 'general_occupation',
            value: 'doctor',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member shared an update.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ droppedOps: 1 }))
    expect(statusOf(nurse.id)).toEqual({ status: 'active', end_reason: null })
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM memory_claim WHERE status = 'candidate'").get()).toEqual({
      count: 0
    })
  })

  it('refreshes only the same-predicate claim when a past-tagged restatement still holds', async () => {
    const hobby = seedUser('hobby', 'chess')
    const occupation = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'general_occupation',
      value: 'chess',
      sourceKind: 'explicit'
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.9 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'hobby',
            value: 'chess',
            tense: 'past'
          }
        ] as ExtractionOp[],
        summary: 'A member restated a hobby.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ duplicateOps: 1 }))
    expect(evidenceChannels(hobby.id)).toEqual([null, 'c-1'])
    expect(evidenceChannels(occupation.id)).toEqual([null])
  })

  it('stores the named object user on inserted and replaced claims', async () => {
    const friend = assertClaim({
      guildId: 'g-1',
      subjectUserId: 'u-1',
      predicate: 'relationship_to',
      value: 'friend',
      sourceKind: 'explicit'
    })
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.1 },
      same_as_0_0: { noul: 0.1 },
      durable_1: { noul: 0.9 },
      attributed_1: { noul: 0.9 },
      current_1: { noul: 0.9 },
      past_1: { noul: 0.1 },
      changes_1: { noul: 0.9 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: {
        messages: [
          {
            messageId: 'm-1',
            userId: 'u-1',
            displayName: 'Mio',
            content: 'I like tea',
            timestamp: 1_000,
            isBot: false
          },
          {
            messageId: 'm-2',
            userId: 'u-2',
            displayName: 'Rin',
            content: 'I like coffee',
            timestamp: 1_000,
            isBot: false
          }
        ],
        context: [],
        startedAt: 1_000,
        endedAt: 1_000
      },
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'relationship_to',
            value: 'sibling',
            tense: 'current',
            objectUserId: 'u-2'
          },
          {
            op: 'update',
            subject: { kind: 'user', userId: 'u-1' },
            existingId: friend.id,
            predicate: 'relationship_to',
            value: 'partner',
            tense: 'current',
            objectUserId: 'u-2'
          }
        ] as ExtractionOp[],
        summary: 'A member shared relationships.'
      },
      subjectIds: new Set(['u-1', 'u-2'])
    })

    expect(result).toEqual(report({ appliedOps: 2, changedOps: 2, uncited: 2 }))
    expect(getDb().prepare("SELECT object_user_id FROM memory_claim WHERE value = 'sibling'").get()).toEqual({
      object_user_id: 'u-2'
    })
    expect(getDb().prepare("SELECT object_user_id FROM memory_claim WHERE value = 'partner'").get()).toEqual({
      object_user_id: 'u-2'
    })
  })

  it('carries the event date onto a replaced guild fact', async () => {
    const plan = assertGuildClaim({
      guildId: 'g-1',
      predicate: 'plan',
      value: 'Old plan',
      expiresAt: Date.parse('2029-09-26T16:00:00Z'),
      sourceKind: 'explicit'
    })
    setAnswers({ durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.9 } })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'update',
            subject: { kind: 'guild' },
            existingId: plan.id,
            predicate: 'plan',
            value: 'New plan',
            date: { year: 2029, month: 9, day: 26 }
          }
        ] as ExtractionOp[],
        summary: 'The server replanned.'
      },
      subjectIds: new Set()
    })

    expect(result).toEqual(report({ appliedOps: 1, changedOps: 1 }))
    expect(
      getDb().prepare("SELECT event_date FROM memory_claim WHERE subject_kind = 'guild' AND value = 'New plan'").get()
    ).toEqual({ event_date: '2029-09-26' })
  })

  it('records a passive source and the message time on a new guild fact', async () => {
    setAnswers({ durable_0: { noul: 0.9 }, guild_scoped_0: { noul: 0.9 } })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'guild' },
            predicate: 'plan',
            value: 'Game night on September 26',
            date: { year: 2029, month: 9, day: 26 }
          }
        ] as ExtractionOp[],
        summary: 'The server made a plan.'
      },
      subjectIds: new Set()
    })

    expect(result).toEqual(report({ appliedOps: 1, changedOps: 1 }))
    const claim = getActiveGuildClaims('g-1').find(({ value }) => value === 'Game night on September 26')
    expect(claim).toBeDefined()
    expect(
      getDb()
        .prepare('SELECT source_kind, observed_at FROM memory_evidence WHERE claim_id = ?')
        .all(claim?.id ?? 0)
    ).toEqual([{ source_kind: 'passive', observed_at: 1_000 }])
  })

  it('treats a same-as answer at the threshold as a match', async () => {
    const tea = seedUser('likes', 'tea')
    setAnswers({
      durable_0: { noul: 0.9 },
      attributed_0: { noul: 0.9 },
      current_0: { noul: 0.9 },
      past_0: { noul: 0.1 },
      same_as_0_0: { noul: 0.5 }
    })

    const result = await verifyAndApplyOperations({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'likes',
            value: 'coffee',
            tense: 'current'
          }
        ] as ExtractionOp[],
        summary: 'A member restated a taste.'
      },
      subjectIds: new Set(['u-1'])
    })

    expect(result).toEqual(report({ duplicateOps: 1 }))
    expect(evidenceChannels(tea.id)).toEqual([null, 'c-1'])
    expect(jevApplied('same_as_0_0')).toBe(1)
  })
})
