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

import { getDb } from '../../storage/database.js'
import { maybeExtractFromBuffer, resetCounters } from '../memoryExtractor.js'
import { addMessage, resetAllBuffers } from '../passiveBuffer.js'
import { beginShutdown, resetForTest } from '../shutdownSignal.js'

process.env.ROKABOT_DB_PATH = ':memory:'

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
    getDb().prepare('DELETE FROM extraction_events').run()
  })

  it('skips extraction without calling Gemini when the RPM floor refuses it', async () => {
    mocks.tryConsumeAboveFloor.mockReturnValue(false)

    queueExtraction()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledWith(3)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM extraction_events').get()).toEqual({ count: 0 })
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

  it('records a saved extraction event', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: '[{"userId":"Alice","key":"favorite_anime","value":"Frieren"}]'
    })

    queueExtraction()
    await vi.waitFor(() => {
      const rows = getDb()
        .prepare('SELECT guild_id, channel_id, duration_ms, outcome, facts_saved FROM extraction_events')
        .all() as Array<Record<string, unknown>>

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        guild_id: 'guild-1',
        channel_id: 'channel-1',
        outcome: 'saved',
        facts_saved: 1
      })
      expect(rows[0].duration_ms).toBeGreaterThanOrEqual(0)
    })
  })

  it('records a no-facts extraction event', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: '[]' })

    queueExtraction()
    await vi.waitFor(() => {
      expect(getDb().prepare('SELECT outcome, facts_extracted, facts_saved FROM extraction_events').all()).toEqual([
        { outcome: 'no_facts', facts_extracted: 0, facts_saved: 0 }
      ])
    })
  })

  it('records a no-facts event when every extracted fact is already saved', async () => {
    mocks.getFacts.mockReturnValue([{ key: 'favorite_anime', value: 'Frieren' }])
    mocks.generateContent.mockResolvedValueOnce({
      text: '[{"userId":"Alice","key":"favorite_anime","value":"Frieren"}]'
    })

    queueExtraction()
    await vi.waitFor(() => {
      expect(getDb().prepare('SELECT outcome, facts_extracted, facts_saved FROM extraction_events').all()).toEqual([
        { outcome: 'no_facts', facts_extracted: 1, facts_saved: 0 }
      ])
    })
  })

  it('records a failed extraction event after a Gemini failure', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('SAFETY block'))

    queueExtraction()
    await vi.waitFor(() => {
      expect(getDb().prepare('SELECT outcome, facts_extracted, facts_saved FROM extraction_events').all()).toEqual([
        { outcome: 'failed', facts_extracted: 0, facts_saved: 0 }
      ])
    })
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
