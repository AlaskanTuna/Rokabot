import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  judgeEpisodeSummary: vi.fn(),
  recordJevEvent: vi.fn(),
  config: { memory: { judge: 'jev' as string, summaryThreshold: 0.5, modelSummaryThreshold: 0.7 } }
}))

vi.mock('../../jev/judgments.js', () => ({ judgeEpisodeSummary: mocks.judgeEpisodeSummary }))
vi.mock('../../../storage/jevEventStore.js', () => ({ recordJevEvent: mocks.recordJevEvent }))
vi.mock('../../../config.js', () => ({ config: mocks.config }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('../../../storage/metricsStore.js', () => ({ recordMemoryEvent: vi.fn() }))

import { validateEpisodeSummary } from '../summaryValidation.js'

function input(overrides: Partial<Parameters<typeof validateEpisodeSummary>[0]> = {}) {
  return {
    summary: 'Mio said she runs every morning and Rin agreed to join her.',
    opsRejected: false,
    guildId: 'g-1',
    channelId: 'c-1',
    jobId: 7,
    ...overrides
  }
}

beforeEach(() => {
  mocks.judgeEpisodeSummary.mockReset()
  mocks.recordJevEvent.mockReset()
  mocks.config.memory.judge = 'jev'
})

describe('validateEpisodeSummary', () => {
  it('drops a summary whose every proposed op was rejected, without judging', async () => {
    await expect(validateEpisodeSummary(input({ opsRejected: true }))).resolves.toEqual({
      kept: false,
      dropReason: 'ops_rejected',
      judged: false,
      inputTokens: 0
    })
    expect(mocks.judgeEpisodeSummary).not.toHaveBeenCalled()
    expect(mocks.recordJevEvent).not.toHaveBeenCalled()
  })

  it('drops a summary holding an 18-digit Discord ID, without judging', async () => {
    await expect(validateEpisodeSummary(input({ summary: 'User 123456789012345678 said hello.' }))).resolves.toEqual({
      kept: false,
      dropReason: 'numeric_id',
      judged: false,
      inputTokens: 0
    })
    expect(mocks.judgeEpisodeSummary).not.toHaveBeenCalled()
  })

  it('keeps a summary holding a four-digit year', async () => {
    mocks.judgeEpisodeSummary.mockResolvedValueOnce({
      noul: 0.9,
      confidence: null,
      latencyMs: 4,
      inputTokens: 12
    })

    await expect(validateEpisodeSummary(input({ summary: 'In 1999 Mio moved to Kyoto.' }))).resolves.toEqual({
      kept: true,
      dropReason: null,
      judged: true,
      inputTokens: 12
    })
    expect(mocks.judgeEpisodeSummary).toHaveBeenCalledOnce()
  })

  it('stops at the ops drop before checking the numeric ID', async () => {
    await expect(
      validateEpisodeSummary(input({ summary: 'User 123456789012345678 was involved.', opsRejected: true }))
    ).resolves.toMatchObject({ dropReason: 'ops_rejected' })
    expect(mocks.judgeEpisodeSummary).not.toHaveBeenCalled()
  })

  it('drops a boilerplate summary before judging', async () => {
    await expect(validateEpisodeSummary(input({ summary: 'No new durable facts came up.' }))).resolves.toEqual({
      kept: false,
      dropReason: 'boilerplate',
      judged: false,
      inputTokens: 0
    })
    expect(mocks.judgeEpisodeSummary).not.toHaveBeenCalled()
  })

  it('keeps an otherwise good summary when nothing was proposed', async () => {
    mocks.judgeEpisodeSummary.mockResolvedValueOnce({
      noul: 0.8,
      confidence: null,
      latencyMs: 3,
      inputTokens: 9
    })

    await expect(validateEpisodeSummary(input({ opsRejected: false }))).resolves.toEqual({
      kept: true,
      dropReason: null,
      judged: true,
      inputTokens: 9
    })
  })

  it('keeps a summary unchanged when Jev is unavailable, and writes no event', async () => {
    mocks.judgeEpisodeSummary.mockResolvedValueOnce(null)

    await expect(validateEpisodeSummary(input())).resolves.toEqual({
      kept: true,
      dropReason: null,
      judged: false,
      inputTokens: 0
    })
    expect(mocks.recordJevEvent).not.toHaveBeenCalled()
  })

  it('drops a summary scored just below the threshold with reason incomplete', async () => {
    mocks.judgeEpisodeSummary.mockResolvedValueOnce({
      noul: 0.49,
      confidence: null,
      latencyMs: 3,
      inputTokens: 15
    })

    await expect(validateEpisodeSummary(input())).resolves.toEqual({
      kept: false,
      dropReason: 'incomplete',
      judged: true,
      inputTokens: 15
    })
    expect(mocks.recordJevEvent).toHaveBeenCalledWith({
      kind: 'verification',
      guildId: 'g-1',
      channelId: 'c-1',
      question: 'summary_complete',
      answer: '0.49',
      probability: 0.49,
      confidence: null,
      applied: false,
      latencyMs: 3,
      inputTokens: 15,
      jobId: 7,
      judge: undefined
    })
  })

  it('keeps a summary scored exactly at the threshold', async () => {
    mocks.judgeEpisodeSummary.mockResolvedValueOnce({
      noul: 0.5,
      confidence: null,
      latencyMs: 3,
      inputTokens: 15
    })

    await expect(validateEpisodeSummary(input())).resolves.toMatchObject({
      kept: true,
      dropReason: null,
      judged: true
    })
    expect(mocks.recordJevEvent).toHaveBeenCalledWith(expect.objectContaining({ applied: true, probability: 0.5 }))
  })

  it('holds a main-model judgment to the model threshold', async () => {
    mocks.config.memory.judge = 'model'
    mocks.judgeEpisodeSummary.mockResolvedValueOnce({
      noul: 0.6,
      confidence: null,
      latencyMs: 3,
      inputTokens: 15
    })

    await expect(validateEpisodeSummary(input())).resolves.toMatchObject({ kept: false, dropReason: 'incomplete' })
  })
})
