import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  admitEpisode: vi.fn(),
  generateContent: vi.fn()
}))

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent }
  }
}))

vi.mock('../../../config.js', () => ({
  config: {
    gemini: {
      apiKey: 'test-key',
      timeout: 15_000,
      extractionModel: 'gemini-extraction-test',
      safetyThreshold: 'OFF'
    },
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20 },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))

vi.mock('../admission.js', () => ({ admitEpisode: mocks.admitEpisode }))

import { closeDb, getDb } from '../../../storage/database.js'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'
import { extractEpisode, runEpisodePipeline } from '../extractor.js'
import { assertClaim, getActiveClaims } from '../memoryClaims.js'

beforeAll(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

beforeEach(() => {
  mocks.admitEpisode.mockReset()
  mocks.admitEpisode.mockResolvedValue({ admitted: true, reason: 'admitted' })
  mocks.generateContent.mockReset()
  getDb().exec('DELETE FROM memory_events; DELETE FROM memory_evidence; DELETE FROM memory_claim;')
})

afterAll(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('runEpisodePipeline', () => {
  const episode: ExtractionEpisode = {
    messages: [
      { messageId: 'm-1', userId: 'user-1', displayName: 'Alice', content: 'I like tea', timestamp: 1, isBot: false },
      { messageId: 'm-2', userId: 'bot-1', displayName: 'Roka', content: 'Nice~', timestamp: 2, isBot: true }
    ],
    context: [],
    startedAt: 1,
    endedAt: 2
  }
  const queueJob = {
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    episode,
    status: 'processing' as const,
    attempts: 0,
    enqueuedAt: 2
  }

  it('drops before Gemini when admission rejects the episode', async () => {
    mocks.admitEpisode.mockResolvedValueOnce({ admitted: false, reason: 'below_threshold' })

    await expect(runEpisodePipeline(queueJob)).resolves.toEqual({
      status: 'dropped',
      summary: null,
      appliedOps: 0,
      duplicateOps: 0
    })
    expect(mocks.generateContent).not.toHaveBeenCalled()
  })

  it('extracts only after admission and returns its summary and write counts', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ops: [{ op: 'noop' }], summary: 'Alice likes tea.' })
    })

    await expect(runEpisodePipeline(queueJob)).resolves.toEqual({
      status: 'completed',
      summary: 'Alice likes tea.',
      appliedOps: 0,
      duplicateOps: 0
    })
    expect(mocks.admitEpisode).toHaveBeenCalledWith({ guildId: 'guild-1', channelId: 'channel-1', episode })
    expect(mocks.generateContent).toHaveBeenCalledOnce()
    expect(mocks.generateContent.mock.calls[0][0].contents).toContain('[bot-1|Roka (bot context only)]')
  })
})

describe('extractEpisode', () => {
  it('uses one typed Gemini request with delta-only subjects, active claims, context, and returns the summary', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'context-user',
      predicate: 'likes',
      value: 'context only claim',
      sourceKind: 'explicit'
    })
    const episode: ExtractionEpisode = {
      messages: [
        {
          messageId: 'm-1',
          userId: 'user-1',
          displayName: 'Alex',
          content: 'I like tea',
          timestamp: 1_000,
          isBot: false
        },
        {
          messageId: 'm-2',
          userId: 'user-2',
          displayName: 'Rin',
          content: 'I play chess',
          timestamp: 2_000,
          isBot: false
        },
        { messageId: 'm-3', userId: 'bot-1', displayName: 'Roka', content: 'Nice!', timestamp: 3_000, isBot: true }
      ],
      context: [
        {
          messageId: 'c-1',
          userId: 'context-user',
          displayName: 'Context User',
          content: 'I like running',
          timestamp: 500,
          isBot: false
        }
      ],
      startedAt: 1_000,
      endedAt: 3_000
    }
    const output = {
      ops: [{ op: 'add', subject: { kind: 'user', userId: 'user-2' }, predicate: 'likes', value: 'chess' }],
      summary: 'Alex enjoys tea, and Rin plays chess.'
    }
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(output) })

    await expect(extractEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })).resolves.toEqual(output)

    expect(mocks.generateContent).toHaveBeenCalledOnce()
    const request = mocks.generateContent.mock.calls[0][0]
    expect(request.model).toBe('gemini-extraction-test')
    expect(request.config).toMatchObject({ responseMimeType: 'application/json', responseSchema: expect.any(Object) })
    expect(request.contents).toContain('Delta messages:')
    expect(request.contents).toContain('[user-1|Alex]: I like tea')
    expect(request.contents).toContain('[bot-1|Roka (bot context only)]: Nice!')
    expect(request.contents).toContain('Context (background only, never a subject):')
    expect(request.contents).toContain('[context-user|Context User]: I like running')
    expect(request.contents).toContain('Allowed human user IDs: user-1, user-2')
    expect(request.contents).toContain('"userId": "user-1"')
    expect(request.contents).toContain('"predicate": "likes"')
    expect(request.contents).toContain(
      'If a member restates a current durable fact, return add with the same subject, predicate, and exact value as its existing claim.'
    )
    expect(request.contents).toContain('Never add a rewording.')
    expect(request.contents).toContain('Return noop only when no durable fact came up.')
    expect(request.contents).not.toContain('context only claim')
    expect(request.contents).toContain('one-to-two sentence third-person summary')
  })
})
