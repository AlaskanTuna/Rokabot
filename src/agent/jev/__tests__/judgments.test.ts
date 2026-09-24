import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientAvailable: true,
  systemOne: vi.fn(),
  localHour: vi.fn(() => 10),
  warn: vi.fn()
}))

vi.mock('../client.js', () => ({
  getJevClient: vi.fn(() => (mocks.clientAvailable ? { systemOne: mocks.systemOne } : null))
}))

vi.mock('../../../config.js', () => ({ config: { jev: { timeoutMs: 1200, backgroundTimeoutMs: 5000 } } }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../utils/timezone.js', () => ({ getLocalHour: mocks.localHour }))
vi.mock('@typesafe-ai/sdk', () => ({
  choice: vi.fn((instructions, criteria) => ({ instructions, criteria })),
  noul: vi.fn((instructions) => ({ instructions }))
}))

import { choice, noul } from '@typesafe-ai/sdk'
import { LOOKUP_QUESTION, TONE_CRITERIA, judgeExtraction, judgeTurn } from '../judgments.js'

function setAnswers(answers: Record<string, unknown>, inputTokens = 17) {
  mocks.systemOne.mockResolvedValueOnce({ answers, usage: { input_tokens: inputTokens, output_tokens: 3 } })
}

function choiceAnswer(choiceValue: string, confidence = 0.9, probabilities: Record<string, number> = {}) {
  return { type: 'choice', choice: choiceValue, confidence, probabilities }
}

function noulAnswer(noulValue: number) {
  return { type: 'noul', noul: noulValue }
}

function turnInput(overrides: Partial<Parameters<typeof judgeTurn>[0]> = {}) {
  return {
    speakerName: 'Mika',
    message: 'Do you remember @Rin?',
    recentLines: ['[Rin]: old line'],
    ambiguous: [],
    includeTone: true,
    includeLookup: false,
    ...overrides
  }
}

describe('judgeTurn', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.localHour.mockReset().mockReturnValue(10)
    mocks.warn.mockReset()
    vi.mocked(noul).mockClear()
  })

  it('does not request a judgment when there is nothing to ask', async () => {
    const result = await judgeTurn(turnInput({ includeTone: false }))

    expect(result).toBeNull()
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it('asks for needs_lookup on the same request and returns its probability', async () => {
    setAnswers({
      tone: choiceAnswer('curious', 0.8, { curious: 0.8 }),
      needs_lookup: noulAnswer(0.91)
    })

    const result = await judgeTurn(turnInput({ includeLookup: true }))
    const request = mocks.systemOne.mock.calls[0]?.[0]

    expect(noul).toHaveBeenCalledWith(LOOKUP_QUESTION)
    expect(Object.keys(request.questions)).toEqual(['tone', 'needs_lookup'])
    expect(result?.needsLookup).toBe(0.91)
    expect(result?.tone).toEqual({ tone: 'curious', confidence: 0.8, probability: expect.any(Number) })
  })

  it('omits the noul entirely when the caller does not ask for it', async () => {
    setAnswers({ tone: choiceAnswer('curious', 0.8, { curious: 0.8 }) })

    const result = await judgeTurn(turnInput())

    expect(noul).not.toHaveBeenCalled()
    expect(Object.keys(mocks.systemOne.mock.calls[0]?.[0].questions)).toEqual(['tone'])
    expect(result?.needsLookup).toBeNull()
  })

  it('returns a null needsLookup when the noul answer is not a number', async () => {
    setAnswers({ tone: choiceAnswer('curious', 0.8), needs_lookup: { type: 'noul', noul: 'high' } })

    const result = await judgeTurn(turnInput({ includeLookup: true }))

    expect(result?.needsLookup).toBeNull()
  })

  it('returns a null needsLookup when the noul is absent from the answers', async () => {
    setAnswers({ tone: choiceAnswer('curious', 0.8) })

    const result = await judgeTurn(turnInput({ includeLookup: true }))

    expect(result?.needsLookup).toBeNull()
  })

  it('makes no request when lookup is the only feature asked for and it is off', async () => {
    const result = await judgeTurn(turnInput({ includeTone: false, ambiguous: [], includeLookup: false }))

    expect(result).toBeNull()
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it('asks for tone only and returns the typed answer', async () => {
    setAnswers({ tone: choiceAnswer('nostalgic', 0.94) }, 21)

    const result = await judgeTurn(turnInput({ recentLines: ['old', 'new'] }))

    expect(choice).toHaveBeenCalledWith(
      'Which mood should Roka, a warm and teasing shopkeeper, reply to `message` in, given `recent_messages` and `time_of_day`?',
      TONE_CRITERIA
    )
    expect(Object.keys(TONE_CRITERIA)).toEqual([
      'playful',
      'sincere',
      'domestic',
      'flustered',
      'curious',
      'annoyed',
      'tender',
      'confident',
      'nostalgic',
      'mischievous',
      'sleepy',
      'competitive'
    ])
    expect(mocks.systemOne).toHaveBeenCalledWith(
      {
        state: {
          speaker: 'Mika',
          message: 'Do you remember @Rin?',
          recent_messages: ['old', 'new'],
          time_of_day: 'morning'
        },
        questions: { tone: expect.any(Object) }
      },
      { signal: undefined, timeout: 1200 }
    )
    expect(result).toMatchObject({ tone: { tone: 'nostalgic', confidence: 0.94 }, referents: [], inputTokens: 21 })
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('trims recent context to three lines and returns the selected option probability', async () => {
    setAnswers({
      tone: choiceAnswer('sincere', 0.71, { sincere: 0.84, playful: 0.16 })
    })

    const result = await judgeTurn(turnInput({ recentLines: ['line-1', 'line-2', 'line-3', 'line-4'] }))
    const request = mocks.systemOne.mock.calls[0]?.[0]

    expect(request.state.recent_messages).toEqual(['line-2', 'line-3', 'line-4'])
    expect(result?.tone).toEqual({ tone: 'sincere', confidence: 0.71, probability: 0.84 })
  })

  it('returns null probability when the SDK omits the selected option probability', async () => {
    setAnswers({ tone: choiceAnswer('sincere', 0.71) })

    const result = await judgeTurn(turnInput())

    expect(result?.tone).toEqual({ tone: 'sincere', confidence: 0.71, probability: null })
  })

  it.each([[-0.01], [1.01], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'returns null probability when the SDK returns an invalid value (%s)',
    async (probability) => {
      setAnswers({ tone: choiceAnswer('sincere', 0.71, { sincere: probability }) })

      const result = await judgeTurn(turnInput())

      expect(result?.tone?.probability).toBeNull()
    }
  )

  it.each([0, 1])('accepts probabilities at the inclusive boundary %s', async (probability) => {
    setAnswers({ tone: choiceAnswer('sincere', 0.71, { sincere: probability }) })

    const result = await judgeTurn(turnInput())

    expect(result?.tone?.probability).toBe(probability)
  })

  it('maps referent choices back to user IDs', async () => {
    setAnswers({ referent_0: choiceAnswer('c0_1', 0.88) })

    const result = await judgeTurn(
      turnInput({
        includeTone: false,
        ambiguous: [
          {
            alias: 'Rin',
            candidates: [
              { userId: 'id-1', displayName: 'Rin A' },
              { userId: 'id-2', displayName: 'Rin B' }
            ]
          }
        ]
      })
    )

    expect(result?.tone).toBeNull()
    expect(result?.referents).toEqual([{ alias: 'Rin', userId: 'id-2', confidence: 0.88 }])
  })

  it.each(['none', 'unclear'])('maps the %s referent answer to null', async (answer) => {
    setAnswers({ referent_0: choiceAnswer(answer, 0.73) })

    const result = await judgeTurn(
      turnInput({
        includeTone: false,
        ambiguous: [{ alias: 'Rin', candidates: [{ userId: 'id-1', displayName: 'Rin A' }] }]
      })
    )

    expect(result?.referents).toEqual([{ alias: 'Rin', userId: null, confidence: 0.73 }])
  })

  it('limits aliases to three and members per alias to eight', async () => {
    const ambiguous = Array.from({ length: 4 }, (_, aliasIndex) => ({
      alias: `alias-${aliasIndex}`,
      candidates: Array.from({ length: 9 }, (_, candidateIndex) => ({
        userId: `${aliasIndex}-${candidateIndex}`,
        displayName: `Member ${aliasIndex}-${candidateIndex}`
      }))
    }))
    setAnswers({
      referent_0: choiceAnswer('c0_0'),
      referent_1: choiceAnswer('c1_0'),
      referent_2: choiceAnswer('c2_0')
    })

    const result = await judgeTurn(turnInput({ includeTone: false, ambiguous }))
    const request = mocks.systemOne.mock.calls[0]?.[0]

    expect(request.state.candidates).toHaveLength(3)
    expect(request.state.candidates[0].members).toHaveLength(8)
    expect(request.state.candidates[2].members[7]).toEqual({ id: 'c2_7', display_name: 'Member 2-7' })
    expect(Object.keys(request.questions)).toEqual(['referent_0', 'referent_1', 'referent_2'])
    expect(result?.referents).toHaveLength(3)
  })

  it.each([
    [4, 'late night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [21, 'evening'],
    [22, 'late night']
  ])('uses the %s hour time bucket', async (hour, expected) => {
    mocks.localHour.mockReturnValue(hour)
    setAnswers({ tone: choiceAnswer('playful') })

    await judgeTurn(turnInput())

    expect(mocks.systemOne.mock.calls[0]?.[0].state.time_of_day).toBe(expected)
  })

  it('fails open and logs no judgment content when the request fails', async () => {
    mocks.systemOne.mockRejectedValueOnce(Object.assign(new Error('private message and name'), { status: 503 }))

    const result = await judgeTurn(turnInput({ message: 'private message', speakerName: 'Private Name' }))

    expect(result).toBeNull()
    expect(mocks.warn).toHaveBeenCalledWith({ kind: 'turn', errorName: 'Error', status: 503 }, 'Jev judgment failed')
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private message')
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('Private Name')
  })
})

describe('judgeExtraction', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.warn.mockReset()
  })

  it('returns the lasting-fact probability and sends only the last six lines', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { lasting_fact: { type: 'noul', noul: 0.82 } },
      usage: { input_tokens: 12, output_tokens: 2 }
    })

    const result = await judgeExtraction({ lines: ['1', '2', '3', '4', '5', '6', '7', '8'] })

    expect(noul).toHaveBeenCalledWith(
      'Does the last line of `messages` state a lasting fact about a member — their likes, life, work, relationships, plans or nickname — or correct something said earlier? Jokes, questions, greetings and passing moods do not count.'
    )
    expect(mocks.systemOne).toHaveBeenCalledWith(
      { state: { messages: ['3', '4', '5', '6', '7', '8'] }, questions: { lasting_fact: expect.any(Object) } },
      { timeout: 5000 }
    )
    expect(result).toMatchObject({ noul: 0.82, inputTokens: 12 })
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('fails open when extraction judgment fails', async () => {
    mocks.systemOne.mockRejectedValueOnce(new Error('private content'))

    await expect(judgeExtraction({ lines: ['private content'] })).resolves.toBeNull()

    expect(mocks.warn).toHaveBeenCalledWith(
      { kind: 'extraction', errorName: 'Error', status: undefined },
      'Jev judgment failed'
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private content')
  })

  it('does not request a judgment without a configured client', async () => {
    mocks.clientAvailable = false

    await expect(judgeExtraction({ lines: ['fact'] })).resolves.toBeNull()

    expect(mocks.systemOne).not.toHaveBeenCalled()
  })
})
