import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientAvailable: true,
  systemOne: vi.fn(),
  warn: vi.fn()
}))

vi.mock('../client.js', () => ({
  getJevClient: vi.fn(() => (mocks.clientAvailable ? { systemOne: mocks.systemOne } : null))
}))
vi.mock('../../../config.js', () => ({ config: { jev: { memoryTimeoutMs: 5_000 } } }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('@typesafe-ai/sdk', () => ({ noul: vi.fn((instructions) => ({ instructions })) }))

import { noul } from '@typesafe-ai/sdk'
import { judgeEpisodeAdmission, judgeEpisodeOperations, judgeHiddenRetractions } from '../judgments.js'

describe('judgeEpisodeAdmission', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.warn.mockReset()
    vi.mocked(noul).mockClear()
  })

  it('asks one lasting-fact question over the complete delta', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { lasting_fact: { type: 'noul', noul: 0.82 } },
      usage: { input_tokens: 19, output_tokens: 2 }
    })
    const lines = [
      '[u-1|Mio]: I like tea',
      '[u-2|Rin]: I run every morning',
      ...Array.from({ length: 6 }, (_, i) => `line-${i}`)
    ]

    const result = await judgeEpisodeAdmission({ lines })

    expect(noul).toHaveBeenCalledWith(
      'Do `messages` state a lasting fact about a member — their likes, life, work, relationships, plans or nickname — or a fact about the group such as an event, a plan, a place or a running joke, or correct something said earlier? Jokes, questions, greetings and passing moods do not count.'
    )
    expect(mocks.systemOne).toHaveBeenCalledWith(
      { state: { messages: lines }, questions: { lasting_fact: expect.any(Object) } },
      { timeout: 5_000 }
    )
    expect(result).toMatchObject({ noul: 0.82, confidence: null, inputTokens: 19 })
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns null without a configured Jev client', async () => {
    mocks.clientAvailable = false

    await expect(judgeEpisodeAdmission({ lines: ['fact'] })).resolves.toBeNull()
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it('fails closed and does not log episode content when Jev fails', async () => {
    mocks.systemOne.mockRejectedValueOnce(new Error('private episode text'))

    await expect(judgeEpisodeAdmission({ lines: ['private episode text'] })).resolves.toBeNull()

    expect(mocks.warn).toHaveBeenCalledWith(
      { kind: 'extraction', errorName: 'Error', status: undefined },
      'Jev judgment failed'
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private episode text')
  })
})

describe('judgeEpisodeOperations', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.warn.mockReset()
    vi.mocked(noul).mockClear()
  })

  it('asks one batched set of durable, attribution, tense and same-as questions', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: {
        durable_0: { type: 'noul', noul: 0.9 },
        attributed_0: { type: 'noul', noul: 0.95 },
        current_0: { type: 'noul', noul: 0.85 },
        past_0: { type: 'noul', noul: 0.2 },
        same_as_0_0: { type: 'noul', noul: 0.8 }
      },
      usage: { input_tokens: 24, output_tokens: 3 }
    })
    const ops = [
      { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea', tense: 'current' },
      { op: 'noop' }
    ] as const
    const existing = [
      {
        id: 7,
        guildId: 'g-1',
        subjectKind: 'user',
        subjectUserId: 'u-1',
        predicate: 'likes',
        value: 'green tea',
        period: 'current'
      }
    ] as never

    const result = await judgeEpisodeOperations({ lines: ['[u-1|Mio]: I like tea'], ops: [ops[0]], existing })

    expect(noul).toHaveBeenCalledTimes(5)
    expect(mocks.systemOne).toHaveBeenCalledOnce()
    expect(mocks.systemOne.mock.calls[0][0]).toMatchObject({
      state: {
        messages: ['[u-1|Mio]: I like tea'],
        operations: [ops[0]],
        existing: [expect.objectContaining({ id: 7, predicate: 'likes', value: 'green tea' })]
      },
      questions: {
        durable_0: expect.any(Object),
        attributed_0: expect.any(Object),
        current_0: expect.any(Object),
        past_0: expect.any(Object),
        same_as_0_0: expect.any(Object)
      }
    })
    expect(result).toMatchObject({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        attributed_0: { noul: 0.95, confidence: null },
        current_0: { noul: 0.85, confidence: null },
        past_0: { noul: 0.2, confidence: null },
        same_as_0_0: { noul: 0.8, confidence: null }
      },
      inputTokens: 24
    })
  })

  it('returns null for partial verification answers and skips an empty request', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { durable_0: { type: 'noul', noul: 0.9 } },
      usage: { input_tokens: 10, output_tokens: 1 }
    })

    await expect(
      judgeEpisodeOperations({
        lines: ['fact'],
        ops: [
          { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea', tense: 'current' }
        ],
        existing: []
      })
    ).resolves.toBeNull()
    await expect(judgeEpisodeOperations({ lines: [], ops: [], existing: [] })).resolves.toBeNull()
    expect(mocks.systemOne).toHaveBeenCalledOnce()
  })

  it('uses guild scope questions in place of user attribution questions', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: {
        durable_0: { type: 'noul', noul: 0.99 },
        guild_scoped_0: { type: 'noul', noul: 0.99 }
      },
      usage: { input_tokens: 20, output_tokens: 2 }
    })
    const result = await judgeEpisodeOperations({
      lines: ['[u-1|Mio]: We should host a game night tomorrow.'],
      ops: [
        {
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'plan',
          value: 'Members planned a game night',
          date: { relative: 'tomorrow' }
        }
      ],
      existing: []
    })

    expect(mocks.systemOne).toHaveBeenCalledOnce()
    const questions = mocks.systemOne.mock.calls[0]?.[0]?.questions ?? {}
    expect(Object.keys(questions)).toEqual(['durable_0', 'guild_scoped_0'])
    expect(Object.keys(questions)).not.toContain('attributed_0')
    expect(result?.answers).toEqual({
      durable_0: { noul: 0.99, confidence: null },
      guild_scoped_0: { noul: 0.99, confidence: null }
    })
  })
  describe('tense, change and retraction questions', () => {
    const subject = { kind: 'user' as const, userId: 'u-1' }

    function existingClaim(
      id: number,
      value: string,
      options: { period?: 'current' | 'past'; predicate?: string } = {}
    ) {
      return {
        id,
        guildId: 'g-1',
        subjectKind: 'user',
        subjectUserId: 'u-1',
        predicate: options.predicate ?? 'hobby',
        value,
        period: options.period ?? 'current'
      }
    }

    async function ask(ops: unknown[], existing: unknown[] = []) {
      mocks.systemOne.mockImplementationOnce(async (request: { questions: Record<string, unknown> }) => ({
        answers: Object.fromEntries(Object.keys(request.questions).map((key) => [key, { type: 'noul', noul: 0.7 }])),
        usage: { input_tokens: 5, output_tokens: 1 }
      }))
      const result = await judgeEpisodeOperations({
        lines: ['[u-1|Mio]: hi'],
        ops: ops as never,
        existing: existing as never
      })
      const questions = (mocks.systemOne.mock.calls[0]?.[0]?.questions ?? {}) as Record<
        string,
        { instructions: string }
      >
      return { result, questions }
    }

    it('asks whether an add is true now and was true earlier', async () => {
      const { questions } = await ask([{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }])

      expect(Object.keys(questions)).toEqual(['durable_0', 'attributed_0', 'current_0', 'past_0'])
      expect(questions.current_0.instructions).toBe('Is this true of the subject now, at the time of these messages?')
      expect(questions.past_0.instructions).toBe(
        'Was this true of the subject at some earlier time, even if it is not now?'
      )
    })

    it('also asks whether an update changes the claim it targets', async () => {
      const { questions } = await ask(
        [{ op: 'update', subject, existingId: 7, predicate: 'hobby', value: 'go', tense: 'current' }],
        [existingClaim(7, 'chess')]
      )

      expect(Object.keys(questions)).toEqual(['durable_0', 'attributed_0', 'current_0', 'past_0', 'changes_0'])
      expect(questions.changes_0.instructions).toBe(
        'Does this change the existing claim #7 into a different fact, rather than restate it in other words?'
      )
    })

    it('asks about the history of a past-tense operation and keeps the usual wording otherwise', async () => {
      const { questions } = await ask([
        { op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'past' },
        { op: 'add', subject, predicate: 'hobby', value: 'go', tense: 'current' }
      ])

      expect(questions.durable_0.instructions).toBe(
        "Is this a lasting fact about the person's history, such as a former job, place or long-held habit, rather than a one-off event?"
      )
      expect(questions.durable_0.instructions).toContain('history')
      expect(questions.durable_1.instructions).toBe(
        'Is this operation a lasting trait, preference, relationship or plan rather than a momentary state or an event that has already happened?'
      )
    })

    it('asks whether a retraction ends a lasting fact, keeping the usual durability wording for other operations', async () => {
      const { questions } = await ask([
        { op: 'retract', subject, predicate: 'hobby', value: 'chess' },
        { op: 'add', subject, predicate: 'hobby', value: 'go', tense: 'current' }
      ])

      expect(questions.durable_0.instructions).toBe(
        'Does this say a lasting fact about the person (such as a hobby, job, diet or habit) has ended, rather than a short pause or a passing mood?'
      )
      expect(questions.durable_1.instructions).toBe(
        'Is this operation a lasting trait, preference, relationship or plan rather than a momentary state or an event that has already happened?'
      )
    })

    it('asks one retraction question per matching current claim of the subject, capped at five', async () => {
      const existing = [
        existingClaim(1, 'chess'),
        existingClaim(2, 'go'),
        existingClaim(3, 'shogi', { period: 'past' }),
        existingClaim(4, 'tea', { predicate: 'likes' }),
        { ...existingClaim(5, 'xiangqi'), subjectUserId: 'u-2' },
        ...[6, 7, 8, 9, 10, 11].map((id) => existingClaim(id, `hobby-${id}`))
      ]
      const { questions } = await ask([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], existing)

      expect(Object.keys(questions)).toEqual([
        'durable_0',
        'attributed_0',
        'retracts_0_0',
        'retracts_0_1',
        'retracts_0_2',
        'retracts_0_3',
        'retracts_0_4'
      ])
      expect(questions.retracts_0_0.instructions).toBe(
        'Do the messages say that the subject\'s hobby "chess" no longer holds?'
      )
      expect(questions.retracts_0_1.instructions).toBe(
        'Do the messages say that the subject\'s hobby "go" no longer holds?'
      )
      expect(JSON.stringify(questions)).not.toContain('shogi')
      expect(JSON.stringify(questions)).not.toContain('xiangqi')
    })

    it('asks about the retracted value first, exact matches before case-insensitive ones, even past the cap', async () => {
      const existing = [
        ...[1, 2, 3, 4, 5].map((id) => existingClaim(id, `hobby-${id}`)),
        existingClaim(6, ' Chess '),
        existingClaim(7, 'chess')
      ]
      const { questions } = await ask([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], existing)

      expect(Object.keys(questions).filter((key) => key.startsWith('retracts_'))).toEqual([
        'retracts_0_0',
        'retracts_0_1',
        'retracts_0_2',
        'retracts_0_3',
        'retracts_0_4'
      ])
      expect(questions.retracts_0_0.instructions).toBe(
        'Do the messages say that the subject\'s hobby "chess" no longer holds?'
      )
      expect(questions.retracts_0_1.instructions).toBe(
        'Do the messages say that the subject\'s hobby " Chess " no longer holds?'
      )
      expect(questions.retracts_0_2.instructions).toContain('"hobby-1"')
    })

    it('also asks about same-category claims under a sibling predicate, each worded with its own predicate', async () => {
      const existing = [
        existingClaim(1, 'go', { predicate: 'favorite_game' }),
        existingClaim(2, 'go'),
        existingClaim(3, ' Chess ', { predicate: 'favorite_game' }),
        existingClaim(4, 'chess', { predicate: 'favorite_game' }),
        existingClaim(5, 'chess'),
        existingClaim(6, 'chess', { predicate: 'general_occupation' })
      ]
      const { questions } = await ask([{ op: 'retract', subject, predicate: 'hobby', value: 'chess' }], existing)

      expect(Object.keys(questions).filter((key) => key.startsWith('retracts_'))).toEqual([
        'retracts_0_0',
        'retracts_0_1',
        'retracts_0_2',
        'retracts_0_3',
        'retracts_0_4'
      ])
      expect(questions.retracts_0_0.instructions).toBe(
        'Do the messages say that the subject\'s hobby "chess" no longer holds?'
      )
      expect(questions.retracts_0_1.instructions).toBe(
        'Do the messages say that the subject\'s favorite game "chess" no longer holds?'
      )
      expect(questions.retracts_0_2.instructions).toBe(
        'Do the messages say that the subject\'s favorite game " Chess " no longer holds?'
      )
      expect(questions.retracts_0_3.instructions).toBe(
        'Do the messages say that the subject\'s hobby "go" no longer holds?'
      )
      expect(questions.retracts_0_4.instructions).toBe(
        'Do the messages say that the subject\'s favorite game "go" no longer holds?'
      )
      expect(JSON.stringify(questions)).not.toContain('general occupation')
    })

    it('words the predicate of a retraction question as a label', async () => {
      const { questions } = await ask(
        [{ op: 'retract', subject, predicate: 'general_occupation', value: 'nurse' }],
        [existingClaim(1, 'nurse', { predicate: 'general_occupation' })]
      )

      expect(questions.retracts_0_0.instructions).toBe(
        'Do the messages say that the subject\'s general occupation "nurse" no longer holds?'
      )
    })

    it('compares an add only with existing claims of the period it writes', async () => {
      const existing = [
        existingClaim(1, 'chess'),
        existingClaim(2, 'go', { period: 'past' }),
        existingClaim(3, 'shogi')
      ]
      const current = await ask([{ op: 'add', subject, predicate: 'hobby', value: 'tea', tense: 'current' }], existing)
      expect(Object.keys(current.questions).filter((key) => key.startsWith('same_as_'))).toEqual([
        'same_as_0_0',
        'same_as_0_1'
      ])
      expect(current.questions.same_as_0_0.instructions).toContain('#1')
      expect(current.questions.same_as_0_1.instructions).toContain('#3')

      mocks.systemOne.mockClear()
      const past = await ask([{ op: 'add', subject, predicate: 'hobby', value: 'tea', tense: 'past' }], existing)
      expect(Object.keys(past.questions).filter((key) => key.startsWith('same_as_'))).toEqual(['same_as_0_0'])
      expect(past.questions.same_as_0_0.instructions).toContain('#2')
    })

    it('asks no tense, change or retraction question for a remove or a guild operation', async () => {
      const removed = await ask([{ op: 'remove', subject, existingId: 7, predicate: 'hobby', value: 'chess' }])
      expect(Object.keys(removed.questions)).toEqual(['durable_0', 'attributed_0'])

      mocks.systemOne.mockClear()
      const guild = await ask([
        {
          op: 'add',
          subject: { kind: 'guild' },
          predicate: 'plan',
          value: 'Game night',
          date: { relative: 'tomorrow' }
        }
      ])
      expect(Object.keys(guild.questions)).toEqual(['durable_0', 'guild_scoped_0'])
    })

    it('returns null when a tense answer is missing', async () => {
      mocks.systemOne.mockResolvedValueOnce({
        answers: {
          durable_0: { type: 'noul', noul: 0.9 },
          attributed_0: { type: 'noul', noul: 0.9 },
          current_0: { type: 'noul', noul: 0.9 }
        },
        usage: { input_tokens: 5, output_tokens: 1 }
      })

      await expect(
        judgeEpisodeOperations({
          lines: ['fact'],
          ops: [{ op: 'add', subject, predicate: 'hobby', value: 'chess', tense: 'current' }],
          existing: []
        })
      ).resolves.toBeNull()
    })
  })
})

describe('judgeHiddenRetractions', () => {
  const candidates = [
    { id: 11, sentence: "This person's hobby: chess." },
    { id: 12, sentence: "This person's hobby: go." }
  ]
  const input = { lines: ['[u-1|Mio]: I quit chess'], statement: "This person's hobby: chess.", candidates }

  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.warn.mockReset()
    vi.mocked(noul).mockClear()
  })

  it('asks one retraction question per candidate, keyed by claim id', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { retracts_11: { type: 'noul', noul: 0.93 }, retracts_12: { type: 'noul', noul: 0.04 } },
      usage: { input_tokens: 12, output_tokens: 2 }
    })

    await expect(judgeHiddenRetractions(input)).resolves.toEqual({ 11: 0.93, 12: 0.04 })

    expect(mocks.systemOne).toHaveBeenCalledOnce()
    const [request, options] = mocks.systemOne.mock.calls[0]
    expect(request.state).toEqual({ messages: input.lines, statement: input.statement, facts: candidates })
    expect(Object.keys(request.questions)).toEqual(['retracts_11', 'retracts_12'])
    expect(request.questions.retracts_11.instructions).toBe(
      'Do the messages say that this fact about the speaker no longer holds: "This person\'s hobby: chess."?'
    )
    expect(request.questions.retracts_12.instructions).toBe(
      'Do the messages say that this fact about the speaker no longer holds: "This person\'s hobby: go."?'
    )
    expect(options).toEqual({ timeout: 5_000 })
  })

  it('returns null without a configured Jev client, or without candidates', async () => {
    mocks.clientAvailable = false
    await expect(judgeHiddenRetractions(input)).resolves.toBeNull()
    mocks.clientAvailable = true
    await expect(judgeHiddenRetractions({ ...input, candidates: [] })).resolves.toBeNull()
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing answer', { retracts_11: { type: 'noul', noul: 0.9 } }],
    ['a non-noul answer', { retracts_11: { type: 'noul', noul: 0.9 }, retracts_12: { type: 'choice', choice: 'a' } }],
    ['an out-of-range answer', { retracts_11: { type: 'noul', noul: 0.9 }, retracts_12: { type: 'noul', noul: 1.5 } }],
    [
      'a non-finite answer',
      { retracts_11: { type: 'noul', noul: Number.NaN }, retracts_12: { type: 'noul', noul: 0.1 } }
    ]
  ])('returns null for %s', async (_, answers) => {
    mocks.systemOne.mockResolvedValueOnce({ answers, usage: { input_tokens: 1, output_tokens: 1 } })
    await expect(judgeHiddenRetractions(input)).resolves.toBeNull()
  })

  it('fails closed and does not log the facts or messages when Jev fails', async () => {
    mocks.systemOne.mockRejectedValueOnce(new Error("This person's hobby: chess."))

    await expect(judgeHiddenRetractions(input)).resolves.toBeNull()

    expect(mocks.warn).toHaveBeenCalledWith(
      { kind: 'extraction', errorName: 'Error', status: undefined },
      'Jev judgment failed'
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('chess')
  })
})
