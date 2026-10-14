import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientAvailable: true, systemOne: vi.fn(), warn: vi.fn() }))
vi.mock('../client.js', () => ({
  getJevClient: vi.fn(() => (mocks.clientAvailable ? { systemOne: mocks.systemOne } : null))
}))
vi.mock('../../../config.js', () => ({
  config: { memory: { recallGateContextTokens: 1000, recallGateInputTokens: 8000 } }
}))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../utils/tokens.js', () => ({ estimateTokens: (text: string) => Math.ceil(text.length / 4) }))
vi.mock('@typesafe-ai/sdk', () => ({ noul: vi.fn((instructions, criteria) => ({ instructions, criteria })) }))

import { RECALL_QUESTION, judgeRecallCandidates } from '../recallJudgment.js'

function entry(kind: string, id: number, text: string, subjectUserId: string | null = 'user-2') {
  return {
    key: `${kind}:${id}`,
    item: { kind, id, score: 0.7, core: false, subjectUserId, label: 'hobby', text, date: null, period: 'current' },
    at: 1,
    similarity: 0.7,
    keyword: false,
    keptByFloor: true
  } as never
}

function input(overrides = {}) {
  return {
    speakerId: 'user-1',
    speakerName: 'Mika',
    message: 'what should I get Aki?',
    recentLines: ['[Aki]: I want a guitar'],
    date: '2026-10-15',
    shortlist: [entry('fact', 1, 'wants a Yamaha guitar'), entry('conversation', 2, 'talked about clocks', null)],
    nameOf: (userId: string) => (userId === 'user-2' ? 'Aki' : 'Mika'),
    ...overrides
  }
}

describe('judgeRecallCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.clientAvailable = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks one isolated noul per candidate with request-local identities and parses probabilities', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { recall_0: { type: 'noul', noul: 0.93 }, recall_1: { type: 'noul', noul: 0.04 } },
      usage: { input_tokens: 2100 }
    })

    const judged = await judgeRecallCandidates(input(), { timeoutMs: 1000 })

    const [request] = mocks.systemOne.mock.calls[0]
    expect(request.state.turn).toMatchObject({
      speaker: 'u0',
      people: [
        { id: 'u0', name: 'Mika' },
        { id: 'u1', name: 'Aki' }
      ]
    })
    expect(request.questions.recall_0.instructions).toMatchObject({
      question: RECALL_QUESTION,
      candidate: { kind: 'fact', subject: 'u1', text: 'wants a Yamaha guitar' }
    })
    expect(JSON.stringify(request)).not.toContain('user-2')
    expect(judged).toMatchObject({ status: 'ok', inputTokens: 2100, judgedKeys: ['fact:1', 'conversation:2'] })
    expect([...(judged.probabilities ?? [])]).toEqual([
      ['fact:1', 0.93],
      ['conversation:2', 0.04]
    ])
  })

  it('rejects the whole batch when any answer is missing or out of range', async () => {
    mocks.systemOne.mockResolvedValueOnce({
      answers: { recall_0: { type: 'noul', noul: 1.2 } },
      usage: { input_tokens: 9 }
    })
    expect(await judgeRecallCandidates(input(), { timeoutMs: 1000 })).toMatchObject({
      status: 'invalid',
      probabilities: null
    })
  })

  it('settles as deadline even when the SDK call never resolves', async () => {
    vi.useFakeTimers()
    mocks.systemOne.mockReturnValueOnce(new Promise(() => {}))
    let settled: Awaited<ReturnType<typeof judgeRecallCandidates>> | undefined
    void judgeRecallCandidates(input(), { timeoutMs: 300 }).then((judged) => {
      settled = judged
    })
    await vi.advanceTimersByTimeAsync(301)
    expect(settled).toMatchObject({ status: 'deadline', probabilities: null, usageUnknown: true })
  })

  it('makes no call with an empty shortlist, no client, or no time left', async () => {
    expect((await judgeRecallCandidates(input({ shortlist: [] }), { timeoutMs: 1000 })).status).toBe('skipped')
    expect((await judgeRecallCandidates(input(), { timeoutMs: 0 })).status).toBe('deadline')
    mocks.clientAvailable = false
    expect((await judgeRecallCandidates(input(), { timeoutMs: 1000 })).status).toBe('no_client')
    expect(mocks.systemOne).not.toHaveBeenCalled()
  })

  it('abstains rather than truncate a message over the context cap, and drops old lines first', async () => {
    expect((await judgeRecallCandidates(input({ message: '字'.repeat(5000) }), { timeoutMs: 1000 })).status).toBe(
      'skipped'
    )
    mocks.systemOne.mockResolvedValueOnce({
      answers: { recall_0: { type: 'noul', noul: 0.5 }, recall_1: { type: 'noul', noul: 0.5 } },
      usage: { input_tokens: 1 }
    })
    await judgeRecallCandidates(input({ recentLines: ['x'.repeat(4000), '[Aki]: hi'] }), { timeoutMs: 1000 })
    expect(mocks.systemOne.mock.calls[0][0].state.turn.recent_messages).toEqual(['[Aki]: hi'])
  })

  it('logs a failure without text and reports error', async () => {
    mocks.systemOne.mockRejectedValueOnce(Object.assign(new Error('secret message text'), { status: 529 }))
    expect((await judgeRecallCandidates(input(), { timeoutMs: 1000 })).status).toBe('error')
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('secret message text')
  })
})
