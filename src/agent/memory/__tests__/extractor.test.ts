import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  admitEpisode: vi.fn(),
  generateContent: vi.fn(),
  judgeEpisodeOperations: vi.fn()
}))

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

vi.mock('../../../config.js', () => ({
  config: {
    gemini: {
      apiKey: 'test-key',
      timeout: 15_000,
      extractionModel: 'gemini-extraction-test',
      safetyThreshold: 'OFF'
    },
    logging: { level: 'silent' },
    jev: { model: 'jev-test' },
    memory: { maxActiveClaimsPerUser: 20, verifyThreshold: 0.5, admitThreshold: 0.5, embeddingModel: 'embed-test' },
    rateLimit: { rpm: 15, rpd: 500 },
    timezone: 'Asia/Singapore'
  }
}))

vi.mock('../admission.js', () => ({ admitEpisode: mocks.admitEpisode }))
vi.mock('../../jev/judgments.js', () => ({ judgeEpisodeOperations: mocks.judgeEpisodeOperations }))

import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import { JevUnavailableError } from '../extractionErrors.js'
import { startRunTrace } from '../extractionRun.js'
import { extractEpisode, runEpisodePipeline, verifyAndApplyOperations } from '../extractor.js'
import { assertClaim, assertGuildClaim, getActiveClaims } from '../memoryClaims.js'

beforeAll(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

beforeEach(() => {
  mocks.admitEpisode.mockReset()
  mocks.admitEpisode.mockResolvedValue({ admitted: true, reason: 'admitted', probability: 0.8, inputTokens: 30 })
  mocks.generateContent.mockReset()
  mocks.judgeEpisodeOperations.mockReset()
  getDb().exec(
    'DELETE FROM memory_events; DELETE FROM memory_evidence; DELETE FROM memory_claim; DELETE FROM jev_events;'
  )
})

afterAll(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('runEpisodePipeline', () => {
  const episode: ExtractionEpisode = {
    messages: [
      { messageId: 'm-1', userId: 'user-1', displayName: 'Alice', content: 'I like tea', timestamp: 1, isBot: false },
      { messageId: 'm-2', userId: 'bot-1', displayName: 'Roka', content: 'Nice~', timestamp: 2, isBot: true }
    ],
    context: [],
    startedAt: 1,
    endedAt: 2
  }
  const queueJob = {
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    episode,
    status: 'processing' as const,
    attempts: 0,
    transientRetries: 0,
    enqueuedAt: 2
  }

  it('drops before Gemini when admission rejects the episode', async () => {
    mocks.admitEpisode.mockResolvedValueOnce({
      admitted: false,
      reason: 'below_threshold',
      probability: 0.31,
      inputTokens: 25
    })
    const trace = startRunTrace(queueJob, 1)

    await expect(runEpisodePipeline(queueJob, trace)).resolves.toEqual({
      status: 'dropped',
      summary: null,
      appliedOps: 0,
      duplicateOps: 0
    })
    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(trace).toMatchObject({
      stage: 'admission',
      outcome: 'below_threshold',
      admission: { probability: 0.31, threshold: 0.5 },
      tokens: 25
    })
    expect(trace.stageMs).toHaveProperty('admission')
  })

  it.each(['trivial', 'sensitive'] as const)(
    'records a %s precheck rejection without a probability',
    async (reason) => {
      mocks.admitEpisode.mockResolvedValueOnce({ admitted: false, reason, probability: null, inputTokens: 0 })
      const trace = startRunTrace(queueJob, 1)

      await runEpisodePipeline(queueJob, trace)

      expect(trace).toMatchObject({ stage: 'precheck', outcome: reason, tokens: 0 })
      expect(trace.admission).toBeUndefined()
    }
  )

  it('throws so the queue can retry when Jev could not judge the episode', async () => {
    mocks.admitEpisode.mockResolvedValueOnce({
      admitted: false,
      reason: 'jev_unavailable',
      probability: null,
      inputTokens: 0
    })
    const trace = startRunTrace(queueJob, 1)

    await expect(runEpisodePipeline(queueJob, trace)).rejects.toBeInstanceOf(JevUnavailableError)
    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(trace).toMatchObject({ stage: 'admission', outcome: 'jev_unavailable' })
  })

  it('extracts only after admission and returns its summary and write counts', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ops: [{ op: 'noop' }], summary: 'Alice likes tea.' })
    })
    const trace = startRunTrace(queueJob, 1)

    await expect(runEpisodePipeline(queueJob, trace)).resolves.toEqual({
      status: 'completed',
      summary: 'Alice likes tea.',
      appliedOps: 0,
      duplicateOps: 0
    })
    expect(mocks.admitEpisode).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      jobId: 1,
      episode
    })
    expect(mocks.generateContent).toHaveBeenCalledOnce()
    expect(mocks.generateContent.mock.calls[0][0].contents).toContain('[bot-1|Roka (bot context only)]')
    expect(trace).toMatchObject({ stage: 'applied', outcome: 'noop', tokens: 30 })
    expect(trace.ops).toEqual({ proposed: 0, applied: 0, duplicate: 0, staged: 0, dropped: 0, changed: 0 })
    expect(Object.keys(trace.stageMs).sort()).toEqual(['admission', 'extraction', 'verification'])
  })

  it('traces the written ops and sums the tokens of admission, extraction and verification', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        ops: [{ op: 'add', subject: { kind: 'user', userId: 'user-1' }, predicate: 'likes', value: 'tea' }],
        summary: 'Alice likes tea.'
      }),
      usageMetadata: { promptTokenCount: 400 }
    })
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: { durable_0: { noul: 0.9, confidence: null }, attributed_0: { noul: 0.9, confidence: null } },
      latencyMs: 5,
      inputTokens: 60
    })
    const trace = startRunTrace(queueJob, 1)

    await expect(runEpisodePipeline(queueJob, trace)).resolves.toMatchObject({ status: 'completed', appliedOps: 1 })

    expect(trace).toMatchObject({ stage: 'applied', outcome: 'written', tokens: 30 + 400 + 60 })
    expect(trace.ops).toEqual({ proposed: 1, applied: 1, duplicate: 0, staged: 0, dropped: 0, changed: 1 })
    expect(getDb().prepare('SELECT DISTINCT job_id FROM jev_events').all()).toEqual([{ job_id: 1 }])
  })

  it('stops the trace at extraction when Gemini fails', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('overloaded'))
    const trace = startRunTrace(queueJob, 1)

    await expect(runEpisodePipeline(queueJob, trace)).rejects.toThrow('overloaded')

    expect(trace.stage).toBe('extraction')
    expect(trace.stageMs).toHaveProperty('extraction')
  })
})

describe('extractEpisode', () => {
  it('uses one typed Gemini request with delta-only subjects, active claims, context, and returns the summary', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'context-user',
      predicate: 'likes',
      value: 'context only claim',
      sourceKind: 'explicit'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'favorite_game',
      value: 'needs review only',
      sourceKind: 'passive',
      needsReview: true
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'candidate only',
      sourceKind: 'passive',
      status: 'candidate',
      needsReview: true
    })
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'I like tea',
          timestamp: 1_000,
          isBot: false
        },
        {
          messageId: 'm-2',
          userId: 'user-2',
          displayName: 'Rin',
          content: 'I play chess',
          timestamp: 2_000,
          isBot: false
        },
        { messageId: 'm-3', userId: 'bot-1', displayName: 'Roka', content: 'Nice!', timestamp: 3_000, isBot: true }
      ],
      context: [
        {
          messageId: 'c-1',
          userId: 'context-user',
          displayName: 'Context User',
          content: 'I like running',
          timestamp: 500,
          isBot: false
        }
      ],
      startedAt: 1_000,
      endedAt: 3_000
    }
    const output = {
      ops: [{ op: 'add', subject: { kind: 'user', userId: 'user-2' }, predicate: 'likes', value: 'chess' }],
      summary: 'Alex enjoys tea, and Rin plays chess.'
    }
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(output) })

    await expect(extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })).resolves.toEqual(output)

    expect(mocks.generateContent).toHaveBeenCalledOnce()
    const request = mocks.generateContent.mock.calls[0][0]
    expect(request.model).toBe('gemini-extraction-test')
    expect(request.config).toMatchObject({ responseMimeType: 'application/json', responseSchema: expect.any(Object) })
    expect(request.contents).toContain('Delta messages:')
    expect(request.contents).toContain('[user-1|Alex]: I like tea')
    expect(request.contents).toContain('[bot-1|Roka (bot context only)]: Nice!')
    expect(request.contents).toContain('Context (background only, never a subject):')
    expect(request.contents).toContain('[context-user|Context User]: I like running')
    expect(request.contents).toContain('Allowed human user IDs: user-1, user-2')
    expect(request.contents).toContain('"userId": "user-1"')
    expect(request.contents).toContain('"predicate": "likes"')
    expect(request.contents).not.toContain('needs review only')
    expect(request.contents).not.toContain('candidate only')
    expect(request.contents).toContain(
      'If a member restates a current durable fact, return add with the same subject, predicate, and exact value as its existing claim.'
    )
    expect(request.contents).toContain('Never add a rewording.')
    expect(request.contents).toContain('Return noop only when no durable fact came up.')
    expect(request.contents).not.toContain('context only claim')
    expect(request.contents).toContain('one-to-two sentence third-person summary')
  })

  it('asks for a member’s own occupation and keeps employer, workplace, and school names forbidden', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ops: [{ op: 'noop' }], summary: 'A fact.' }) })
    const episode: ExtractionEpisode = {
      messages: [
        { messageId: 'm-1', userId: 'user-1', displayName: 'Bea', content: 'I work nights', timestamp: 1, isBot: false }
      ],
      context: [],
      startedAt: 1,
      endedAt: 1
    }

    await extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })

    const prompt = mocks.generateContent.mock.calls[0][0].contents
    expect(prompt).toContain('general_occupation')
    expect(prompt).toContain('never the employer, workplace, or location')
    expect(prompt).toContain('names of schools, employers, or workplaces')
  })

  it('requires the day but leaves the year to the messages', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ops: [{ op: 'noop' }], summary: 'A fact.' }) })
    const episode: ExtractionEpisode = {
      messages: [
        { messageId: 'm-1', userId: 'user-1', displayName: 'Ari', content: 'Movie night', timestamp: 1, isBot: false }
      ],
      context: [],
      startedAt: 1,
      endedAt: 1
    }

    await extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })

    expect(mocks.generateContent.mock.calls[0][0].contents).toContain(
      'give the month and day, plus the year only when the messages state it'
    )
  })
})

describe('verifyAndApplyOperations', () => {
  afterEach(() => vi.restoreAllMocks())

  it('records passive claims and evidence at the latest message timestamp', async () => {
    const observedAt = Date.parse('2026-09-26T10:00:00Z')
    const processedAt = Date.parse('2026-09-27T10:00:00Z')
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'I like tea',
          timestamp: observedAt - 1,
          isBot: false
        },
        {
          messageId: 'm-2',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'I really like tea',
          timestamp: observedAt,
          isBot: false
        }
      ],
      context: [],
      startedAt: observedAt - 1,
      endedAt: observedAt
    }
    vi.spyOn(Date, 'now').mockReturnValue(processedAt)
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        attributed_0: { noul: 0.9, confidence: null }
      },
      latencyMs: 1,
      inputTokens: 1
    })

    await verifyAndApplyOperations({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode,
      output: {
        ops: [{ op: 'add', subject: { kind: 'user', userId: 'user-1' }, predicate: 'likes', value: 'tea' }],
        summary: 'Alex likes tea.'
      },
      subjectIds: new Set(['user-1'])
    })

    expect(getActiveClaims('guild-1', 'user-1')[0]).toMatchObject({
      firstSeenAt: observedAt,
      lastSeenAt: observedAt
    })
    expect(getDb().prepare('SELECT observed_at FROM memory_evidence').all()).toEqual([{ observed_at: observedAt }])
  })

  it('resolves week-relative guild dates against the latest episode message', async () => {
    const observedAt = Date.parse('2026-09-26T10:00:00Z')
    const processedAt = Date.parse('2026-09-27T10:00:00Z')
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'Movie night is this Saturday',
          timestamp: observedAt,
          isBot: false
        }
      ],
      context: [],
      startedAt: observedAt,
      endedAt: observedAt
    }
    vi.spyOn(Date, 'now').mockReturnValue(processedAt)
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        guild_scoped_0: { noul: 0.9, confidence: null }
      },
      latencyMs: 1,
      inputTokens: 1
    })

    await verifyAndApplyOperations({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode,
      output: {
        ops: [
          {
            op: 'add',
            subject: { kind: 'guild' },
            predicate: 'upcoming_event',
            value: 'Movie night',
            date: { relative: 'this_week', weekday: 'saturday' }
          }
        ],
        summary: 'The server plans a movie night.'
      },
      subjectIds: new Set(['user-1'])
    })

    expect(
      getDb().prepare("SELECT event_date, expires_at FROM memory_claim WHERE subject_kind = 'guild'").all()
    ).toEqual([{ event_date: '2026-09-26', expires_at: Date.parse('2026-09-26T16:00:00Z') }])
  })

  it('keeps a later last-seen time when applying an older duplicate observation', async () => {
    const observedAt = Date.parse('2026-09-26T10:00:00Z')
    const existingAt = Date.parse('2026-09-27T10:00:00Z')
    const processedAt = Date.parse('2026-09-28T10:00:00Z')
    const existing = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive',
      observedAt: existingAt
    })
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'I like tea',
          timestamp: observedAt,
          isBot: false
        }
      ],
      context: [],
      startedAt: observedAt,
      endedAt: observedAt
    }
    vi.spyOn(Date, 'now').mockReturnValue(processedAt)
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        attributed_0: { noul: 0.9, confidence: null },
        same_as_0_0: { noul: 0.9, confidence: null }
      },
      latencyMs: 1,
      inputTokens: 1
    })

    await verifyAndApplyOperations({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode,
      output: {
        ops: [{ op: 'add', subject: { kind: 'user', userId: 'user-1' }, predicate: 'likes', value: 'tea' }],
        summary: 'Alex likes tea.'
      },
      subjectIds: new Set(['user-1'])
    })

    expect(getActiveClaims('guild-1', 'user-1')[0].lastSeenAt).toBe(existingAt)
    expect(
      getDb().prepare('SELECT observed_at FROM memory_evidence WHERE claim_id = ? ORDER BY id').all(existing.id)
    ).toEqual([{ observed_at: existingAt }, { observed_at: observedAt }])
  })

  it('records message time on user and guild claim replacements', async () => {
    const observedAt = Date.parse('2026-09-26T10:00:00Z')
    const priorAt = Date.parse('2026-09-25T10:00:00Z')
    const processedAt = Date.parse('2026-09-27T10:00:00Z')
    vi.spyOn(Date, 'now').mockReturnValue(processedAt)
    const userClaim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'nickname',
      value: 'Rin',
      sourceKind: 'explicit',
      observedAt: priorAt
    })
    const guildClaim = assertGuildClaim({
      guildId: 'guild-1',
      predicate: 'rule',
      value: 'Old rule',
      expiresAt: null,
      sourceKind: 'explicit',
      observedAt: priorAt
    })
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'Call me Rinny and no spoilers',
          timestamp: observedAt,
          isBot: false
        }
      ],
      context: [],
      startedAt: observedAt,
      endedAt: observedAt
    }
    mocks.judgeEpisodeOperations.mockResolvedValueOnce({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        attributed_0: { noul: 0.9, confidence: null },
        durable_1: { noul: 0.9, confidence: null },
        guild_scoped_1: { noul: 0.9, confidence: null }
      },
      latencyMs: 1,
      inputTokens: 1
    })

    await verifyAndApplyOperations({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode,
      output: {
        ops: [
          {
            op: 'update',
            subject: { kind: 'user', userId: 'user-1' },
            existingId: userClaim.id,
            predicate: 'nickname',
            value: 'Rinny'
          },
          {
            op: 'update',
            subject: { kind: 'guild' },
            existingId: guildClaim.id,
            predicate: 'rule',
            value: 'No spoilers'
          }
        ],
        summary: 'Alex updated a nickname and server rule.'
      },
      subjectIds: new Set(['user-1'])
    })

    expect(getActiveClaims('guild-1', 'user-1').find(({ value }) => value === 'Rinny')).toMatchObject({
      firstSeenAt: observedAt,
      lastSeenAt: observedAt
    })
    expect(
      getDb()
        .prepare(
          "SELECT first_seen_at, last_seen_at FROM memory_claim WHERE subject_kind = 'guild' AND value = 'No spoilers'"
        )
        .get()
    ).toEqual({ first_seen_at: observedAt, last_seen_at: observedAt })
  })
})

describe('extractEpisode channel privacy', () => {
  const episode: ExtractionEpisode = {
    messages: [
      { messageId: 'm-1', userId: 'user-1', displayName: 'Alex', content: 'I like tea', timestamp: 1_000, isBot: false }
    ],
    context: [],
    startedAt: 1_000,
    endedAt: 1_000
  }
  const originalPrivacy = config.memory.privacy
  const setPrivacy = (privacy: string | undefined) => Object.assign(config.memory, { privacy })

  beforeEach(() => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea said here',
      sourceKind: 'explicit',
      channelId: 'channel-1'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea said elsewhere',
      sourceKind: 'explicit',
      channelId: 'other'
    })
    assertGuildClaim({
      guildId: 'guild-1',
      predicate: 'rule',
      value: 'guild rule said here',
      expiresAt: null,
      sourceKind: 'explicit',
      channelId: 'channel-1'
    })
    assertGuildClaim({
      guildId: 'guild-1',
      predicate: 'rule',
      value: 'guild rule said elsewhere',
      expiresAt: null,
      sourceKind: 'explicit',
      channelId: 'other'
    })
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ ops: [{ op: 'noop' }], summary: 'A fact.' }) })
  })

  afterEach(() => {
    setPrivacy(originalPrivacy)
  })

  it('keeps claims and guild facts from other channels out of the prompt under strict', async () => {
    setPrivacy('strict')

    await extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })

    const prompt = mocks.generateContent.mock.calls[0][0].contents
    expect(prompt).toContain('tea said here')
    expect(prompt).toContain('guild rule said here')
    expect(prompt).not.toContain('tea said elsewhere')
    expect(prompt).not.toContain('guild rule said elsewhere')
  })

  it('drops claims from a private channel under balanced too', async () => {
    setPrivacy('balanced')

    await extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })

    const prompt = mocks.generateContent.mock.calls[0][0].contents
    expect(prompt).toContain('tea said here')
    expect(prompt).not.toContain('tea said elsewhere')
  })

  it('sends every claim and guild fact at relaxed', async () => {
    setPrivacy('relaxed')

    await extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })

    const prompt = mocks.generateContent.mock.calls[0][0].contents
    expect(prompt).toContain('tea said here')
    expect(prompt).toContain('tea said elsewhere')
    expect(prompt).toContain('guild rule said here')
    expect(prompt).toContain('guild rule said elsewhere')
  })
})
