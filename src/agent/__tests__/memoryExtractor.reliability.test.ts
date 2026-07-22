import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  getFacts: vi.fn(() => []),
  getSharedRateLimiter: vi.fn(),
  saveFact: vi.fn(),
  tryConsumeAboveFloor: vi.fn()
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

vi.mock('../../config.js', () => ({
  config: {
    gemini: {
      apiKey: 'test-key',
      model: 'gemini-test',
      extractionModel: 'gemini-extraction-test',
      extractionRpmFloor: 3,
      extractionMaxRetries: 1,
      retryBackoffBaseMs: 0,
      retryBackoffCapMs: 0
    },
    logging: { level: 'silent' },
    memory: {
      bufferSize: 20,
      extractionInterval: 1,
      extractionGapMs: 0,
      maxFactsPerUser: 10,
      factRetentionDays: 90,
      channelMonitorTtlMs: 86_400_000
    },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

vi.mock('../../storage/userMemory.js', () => ({
  getFacts: mocks.getFacts,
  saveFact: mocks.saveFact
}))

vi.mock('../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: mocks.getSharedRateLimiter
}))

import { maybeExtractFromBuffer, resetCounters } from '../memoryExtractor.js'
import { addMessage, resetAllBuffers } from '../passiveBuffer.js'
import { beginShutdown, resetForTest } from '../shutdownSignal.js'

function queueExtraction(channelId: string = 'channel-1'): void {
  addMessage(channelId, 'user-1', 'Alice', 'alice', 'I love Frieren')
  maybeExtractFromBuffer(channelId, undefined, 'guild-1')
}

async function waitForExtraction(): Promise<void> {
  await vi.waitFor(() => expect(mocks.generateContent).toHaveBeenCalled())
}

describe('memory extraction reliability', () => {
  beforeEach(() => {
    resetAllBuffers()
    resetCounters()
    resetForTest()
    vi.clearAllMocks()
    mocks.generateContent.mockReset()
    mocks.getFacts.mockReturnValue([])
    mocks.getSharedRateLimiter.mockReturnValue({ tryConsumeAboveFloor: mocks.tryConsumeAboveFloor })
    mocks.tryConsumeAboveFloor.mockReturnValue(true)
  })

  it('skips extraction without calling Gemini when the RPM floor refuses it', async () => {
    mocks.tryConsumeAboveFloor.mockReturnValue(false)

    queueExtraction()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledWith(3)
  })

  it('consumes only successful floor-gated extraction attempts and preserves a two-token user retry', async () => {
    let remainingRpm = 2
    mocks.tryConsumeAboveFloor.mockImplementation((floor: number) => {
      if (remainingRpm < floor) return false
      remainingRpm--
      return true
    })

    queueExtraction()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledTimes(1)
    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledWith(3)
    expect(mocks.tryConsumeAboveFloor(2)).toBe(true)
    expect(remainingRpm).toBe(1)
  })

  it('retries a transient extraction failure once and saves facts after success', async () => {
    mocks.generateContent
      .mockRejectedValueOnce(new Error('503 unavailable'))
      .mockResolvedValueOnce({ text: '[{"userId":"Alice","key":"favorite_anime","value":"Frieren"}]' })

    queueExtraction()
    await waitForExtraction()
    await vi.waitFor(() =>
      expect(mocks.saveFact).toHaveBeenCalledWith('guild-1', 'user-1', 'favorite_anime', 'Frieren')
    )

    expect(mocks.generateContent).toHaveBeenCalledTimes(2)
    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledTimes(2)
  })

  it('uses the configured extraction model', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: '[]' })

    queueExtraction()
    await waitForExtraction()

    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-extraction-test' }))
  })

  it.each([
    ['safety failure', () => mocks.generateContent.mockRejectedValueOnce(new Error('SAFETY block'))],
    ['parse failure', () => mocks.generateContent.mockResolvedValueOnce({ text: 'not JSON' })]
  ])('gives up without retrying on a %s', async (_name, arrange) => {
    arrange()

    queueExtraction()
    await waitForExtraction()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.generateContent).toHaveBeenCalledTimes(1)
    expect(mocks.saveFact).not.toHaveBeenCalled()
  })

  it('does not start extraction while shutdown is in progress', async () => {
    beginShutdown()

    queueExtraction()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(mocks.tryConsumeAboveFloor).not.toHaveBeenCalled()
  })
})
