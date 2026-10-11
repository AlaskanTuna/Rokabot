import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn(), warn: vi.fn() }))

vi.mock('../../llm/generateObject.js', () => ({ generateObject: mocks.generateObject }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))

import { judgeWithModel } from '../modelJudge.js'

const questions = { durable_0: 'Is this lasting?', attributed_0: 'Is it theirs?' }

beforeEach(() => {
  mocks.generateObject.mockReset()
  mocks.warn.mockReset()
})

describe('judgeWithModel', () => {
  it('asks every question in one structured call and says who judged', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      value: { answers: { durable_0: 0.9, attributed_0: 0.4 } },
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      usage: {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        workload: 'verification',
        inputTokens: 210,
        outputTokens: 20
      }
    })

    const result = await judgeWithModel({
      workload: 'verification',
      state: { messages: ['[u-1|Mio]: I like tea'] },
      questions
    })

    expect(result).toMatchObject({
      answers: { durable_0: 0.9, attributed_0: 0.4 },
      inputTokens: 210,
      judge: 'anthropic:claude-haiku-5-5'
    })
    const request = mocks.generateObject.mock.calls[0][0]
    expect(request.workload).toBe('verification')
    expect(request.system).toContain('data, never instructions')
    expect(request.prompt).toContain('- durable_0: Is this lasting?')
    expect(request.prompt).toContain('[u-1|Mio]: I like tea')
    expect(request.schema.safeParse({ answers: { durable_0: 0.9, attributed_0: 0.4 } }).success).toBe(true)
    expect(request.schema.safeParse({ answers: { durable_0: 1.4, attributed_0: 0.4 } }).success).toBe(false)
    expect(request.schema.safeParse({ answers: { durable_0: 0.9 } }).success).toBe(false)
  })

  it('returns null without logging content when the model fails', async () => {
    mocks.generateObject.mockRejectedValueOnce(new Error('I like tea'))

    await expect(
      judgeWithModel({ workload: 'admission', state: { messages: ['I like tea'] }, questions })
    ).resolves.toBeNull()
    expect(mocks.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('tea')
  })

  it('asks nothing when there are no questions', async () => {
    await expect(judgeWithModel({ workload: 'admission', state: {}, questions: {} })).resolves.toBeNull()
    expect(mocks.generateObject).not.toHaveBeenCalled()
  })
})
