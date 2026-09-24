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
import { judgeEpisodeAdmission } from '../judgments.js'

describe('judgeEpisodeAdmission', () => {
  beforeEach(() => {
    mocks.clientAvailable = true
    mocks.systemOne.mockReset()
    mocks.warn.mockReset()
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
