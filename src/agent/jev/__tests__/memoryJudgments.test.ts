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
import { judgeEpisodeAdmission, judgeEpisodeOperations } from '../judgments.js'

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

  it('asks one batched set of durable, attribution, and same-as questions', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: {
        durable_0: { type: 'noul', noul: 0.9 },
        attributed_0: { type: 'noul', noul: 0.95 },
        same_as_0_0: { type: 'noul', noul: 0.8 }
      },
      usage: { input_tokens: 24, output_tokens: 3 }
    })
    const ops = [
      { op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea' },
      { op: 'noop' }
    ] as const
    const existing = [
      { id: 7, guildId: 'g-1', subjectKind: 'user', subjectUserId: 'u-1', predicate: 'likes', value: 'green tea' }
    ] as never

    const result = await judgeEpisodeOperations({ lines: ['[u-1|Mio]: I like tea'], ops: [ops[0]], existing })

    expect(noul).toHaveBeenCalledTimes(3)
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
        same_as_0_0: expect.any(Object)
      }
    })
    expect(result).toMatchObject({
      answers: {
        durable_0: { noul: 0.9, confidence: null },
        attributed_0: { noul: 0.95, confidence: null },
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
        ops: [{ op: 'add', subject: { kind: 'user', userId: 'u-1' }, predicate: 'likes', value: 'tea' }],
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
})
