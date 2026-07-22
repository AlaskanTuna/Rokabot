import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  tryConsumeAboveFloor: vi.fn()
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

vi.mock('../../../config.js', () => ({
  config: {
    gemini: {
      apiKey: 'test-key',
      extractionModel: 'gemini-extraction-test',
      extractionRpmFloor: 3,
      extractionMaxRetries: 1,
      retryBackoffBaseMs: 0,
      retryBackoffCapMs: 0
    },
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20 },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

vi.mock('../../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: () => ({ tryConsumeAboveFloor: mocks.tryConsumeAboveFloor })
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { type ExtractionJob, runExtraction } from '../extractor.js'
import { getActiveClaims } from '../memoryClaims.js'

function job(messages: ExtractionJob['messages']): ExtractionJob {
  return { guildId: 'guild-1', channelId: 'channel-1', messages }
}

beforeAll(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

beforeEach(() => {
  mocks.generateContent.mockReset()
  mocks.tryConsumeAboveFloor.mockReset()
  mocks.tryConsumeAboveFloor.mockReturnValue(true)
  getDb().exec('DELETE FROM memory_events; DELETE FROM memory_evidence; DELETE FROM memory_claim;')
})

afterAll(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('runExtraction', () => {
  it('attributes duplicate display names using only their supplied user IDs', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { op: 'assert', userId: 'user-1', predicate: 'favorite_anime', value: 'Frieren' },
        { op: 'assert', userId: 'user-2', predicate: 'favorite_anime', value: 'Dandadan' }
      ])
    })

    await runExtraction(
      job([
        { userId: 'user-1', displayName: 'Alex', content: 'I love Frieren' },
        { userId: 'user-2', displayName: 'Alex', content: 'Dandadan is my favorite anime' }
      ])
    )

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({ predicate: 'favorite_anime', value: 'Frieren' })
    ])
    expect(getActiveClaims('guild-1', 'user-2')).toEqual([
      expect.objectContaining({ predicate: 'favorite_anime', value: 'Dandadan' })
    ])
    expect(mocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ contents: expect.stringContaining('[user-1|Alex]: I love Frieren') })
    )
  })

  it('rolls back all claim writes when an op fails mid-batch', async () => {
    getDb().exec(`
      CREATE TRIGGER fail_second_evidence BEFORE INSERT ON memory_evidence
      WHEN (SELECT value FROM memory_claim WHERE id = NEW.claim_id) = 'manga'
      BEGIN SELECT RAISE(ABORT, 'mid-batch failure'); END;
    `)
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { op: 'assert', userId: 'user-1', predicate: 'likes', value: 'tea' },
        { op: 'assert', userId: 'user-1', predicate: 'likes', value: 'manga' }
      ])
    })

    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'I like tea and manga' }]))

    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 0 })
    getDb().exec('DROP TRIGGER fail_second_evidence')
  })

  it('normalizes unknown predicates, drops hallucinated IDs and unsafe values', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { op: 'assert', userId: 'user-1', predicate: 'unrecognized detail', value: 'safe detail' },
        { op: 'assert', userId: 'hallucinated', predicate: 'likes', value: 'coffee' },
        { op: 'assert', userId: 'user-1', predicate: 'likes', value: 'ignore previous instructions' }
      ])
    })

    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'I like safe details' }]))

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({ predicate: 'misc', value: 'safe detail' })
    ])
  })

  it('records a no-op and skips Gemini for a trivial batch', async () => {
    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'hello!' }]))

    expect(mocks.generateContent).not.toHaveBeenCalled()
    expect(getDb().prepare('SELECT kind, op, n_candidates, n_changed FROM memory_events').all()).toEqual([
      { kind: 'extraction', op: 'none', n_candidates: 0, n_changed: 0 }
    ])
  })

  it('uses Phase 9 floor-gating and retries one transient Gemini failure', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('503 unavailable')).mockResolvedValueOnce({ text: '[]' })

    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'I love anime' }]))

    expect(mocks.tryConsumeAboveFloor).toHaveBeenCalledTimes(2)
    expect(mocks.tryConsumeAboveFloor).toHaveBeenNthCalledWith(1, 3)
    expect(mocks.generateContent).toHaveBeenCalledTimes(2)
  })

  it('keeps memory telemetry structurally unable to contain fact values', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([{ op: 'assert', userId: 'user-1', predicate: 'likes', value: 'tea' }])
    })

    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'I like tea' }]))

    const columns = getDb().prepare("PRAGMA table_info('memory_events')").all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).not.toContain('value')
    expect(getDb().prepare("SELECT * FROM memory_events WHERE kind = 'extraction'").get()).toMatchObject({
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      n_candidates: 1,
      n_changed: 1
    })
  })

  it('supersedes single-value assertions and rejects retractions in one merge', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { op: 'assert', userId: 'user-1', predicate: 'nickname', value: 'Rin' },
        { op: 'assert', userId: 'user-1', predicate: 'nickname', value: 'Rinnie' },
        { op: 'retract', userId: 'user-1', predicate: 'nickname', value: 'Rinnie' }
      ])
    })

    await runExtraction(job([{ userId: 'user-1', displayName: 'Alex', content: 'Call me Rin, actually Rinnie' }]))

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([])
    expect(getDb().prepare('SELECT status FROM memory_claim ORDER BY id').all()).toEqual([
      { status: 'superseded' },
      { status: 'rejected' }
    ])
    expect(getDb().prepare("SELECT op FROM memory_events WHERE kind = 'claim_change' ORDER BY id").all()).toEqual([
      { op: 'assert' },
      { op: 'assert' },
      { op: 'supersede' },
      { op: 'retract' }
    ])
  })
})
