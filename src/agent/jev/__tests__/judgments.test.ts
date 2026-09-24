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

vi.mock('../../../config.js', () => ({ config: { jev: { timeoutMs: 1200, memoryTimeoutMs: 5000 } } }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../utils/timezone.js', () => ({ getLocalHour: mocks.localHour }))
vi.mock('@typesafe-ai/sdk', () => ({
  choice: vi.fn((instructions, criteria) => ({ instructions, criteria })),
  noul: vi.fn((instructions) => ({ instructions }))
}))

import { choice, noul } from '@typesafe-ai/sdk'
import { TONE_CRITERIA, judgeTurn } from '../judgments.js'

function setAnswers(answers: Record<string, unknown>, inputTokens = 17) {
  mocks.systemOne.mockResolvedValueOnce({ answers, usage: { input_tokens: inputTokens, output_tokens: 3 } })
}

function choiceAnswer(choiceValue: string, confidence = 0.9) {
  return { type: 'choice', choice: choiceValue, confidence, probabilities: {} }
}

function turnInput(overrides: Partial<Parameters<typeof judgeTurn>[0]> = {}) {
  return {
    speakerName: 'Mika',
    message: 'Do you remember @Rin?',
    recentLines: ['[Rin]: old line'],
    ambiguous: [],
    includeTone: true,
    ...overrides
  }
}

describe('judgeTurn', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.localHour.mockReset().mockReturnValue(10)
    mocks.warn.mockReset()
  })

  it('does not request a judgment when there is nothing to ask', async () => {
    const result = await judgeTurn(turnInput({ includeTone: false }))

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
