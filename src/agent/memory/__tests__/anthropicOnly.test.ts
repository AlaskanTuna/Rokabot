import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type SentParams = { model?: string; temperature?: unknown; tools?: Array<{ name: string; input_schema: unknown }> }

const mocks = vi.hoisted(() => {
  vi.stubEnv('GEMINI_API_KEY', '')
  vi.stubEnv('EMBEDDINGS_PROVIDER', 'local')
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  vi.stubEnv('TYPESAFE_API_KEY', '')
  vi.stubEnv('LLM_MAIN', '')
  vi.stubEnv('LLM_FALLBACK', '')
  vi.stubEnv('MEDIA_WATCHER', '')
  const requests: SentParams[] = []
  const replies: unknown[] = []
  const create = vi.fn(async (params: SentParams) => {
    requests.push(params)
    if (replies.length === 0) throw new Error('No fixture reply queued')
    return {
      id: `msg_fixture_${requests.length}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      container: null,
      diagnostics: null,
      content: [
        {
          type: 'tool_use',
          id: `toolu_fixture_${requests.length}`,
          name: params.tools?.[0]?.name,
          input: replies.shift(),
          caller: { type: 'direct' }
        }
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 150,
        output_tokens: 25,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: null,
        inference_geo: 'global',
        output_tokens_details: { thinking_tokens: 0 },
        server_tool_use: null,
        service_tier: 'standard'
      }
    }
  })
  return { requests, replies, create }
})

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FixtureAnthropic {
    messages = { create: mocks.create }
  }
  return { ...actual, default: FixtureAnthropic }
})

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GoogleGenAI: class {
    constructor() {
      throw new Error('An Anthropic-only config must not reach Gemini')
    }
  }
}))

vi.mock('js-yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-yaml')>()
  return {
    ...actual,
    load: (raw: string) => {
      const parsed = actual.load(raw) as Record<string, Record<string, unknown>>
      return {
        ...parsed,
        llm: {
          main: 'haiku',
          fallback: null,
          models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' } }
        },
        media: { ...parsed.media, watcher: 'off' }
      }
    }
  }
})

import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import type { ExtractionQueueJob } from '../../../storage/extractionQueue.js'
import { startRunTrace } from '../extractionRun.js'
import { runEpisodePipeline } from '../extractor.js'
import { assertClaim, getActiveClaims } from '../memoryClaims.js'
import { reclassifyClaims } from '../reclassify.js'

function job(content: string, id: number): ExtractionQueueJob {
  return {
    id,
    guildId: 'guild-1',
    channelId: 'channel-1',
    status: 'processing',
    attempts: 0,
    transientRetries: 0,
    enqueuedAt: 2,
    episode: {
      messages: [{ messageId: `m-${id}`, userId: 'u-1', displayName: 'Mio', content, timestamp: 1_000, isBot: false }],
      context: [],
      startedAt: 1_000,
      endedAt: 1_000
    }
  }
}

beforeAll(() => {
  getDb()
})

beforeEach(() => {
  mocks.requests.length = 0
  mocks.replies.length = 0
  mocks.create.mockClear()
  getDb().exec(
    'DELETE FROM memory_events; DELETE FROM memory_evidence; DELETE FROM memory_claim; DELETE FROM jev_events;'
  )
})

afterAll(() => {
  closeDb()
  vi.unstubAllEnvs()
})

describe('an Anthropic-only config', () => {
  it('routes background jobs to Claude and judges memory with it', () => {
    expect(config.llm.main).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    expect(config.llm.fallback).toBeNull()
    expect(config.memory.judge).toBe('model')
    expect(config.gemini.apiKey).toBe('')
  })

  it('admits, extracts and verifies a fact on Claude alone', async () => {
    mocks.replies.push(
      { answers: { lasting_fact: 0.93 } },
      {
        ops: [
          {
            op: 'add',
            subject: { kind: 'user', userId: 'u-1' },
            predicate: 'likes',
            value: 'green tea',
            tense: 'current'
          }
        ],
        summary: 'Mio loves green tea.'
      },
      { answers: { durable_0: 0.92, attributed_0: 0.9, current_0: 0.91, past_0: 0.05 } }
    )
    const queued = job('I really love green tea, I drink a pot of it every morning', 1)

    await expect(runEpisodePipeline(queued, startRunTrace(queued, 1))).resolves.toMatchObject({
      status: 'completed',
      summary: 'Mio loves green tea.',
      appliedOps: 1
    })

    expect(getActiveClaims('guild-1', 'u-1')).toEqual([
      expect.objectContaining({ predicate: 'likes', value: 'green tea', needsReview: false })
    ])
    expect(mocks.create).toHaveBeenCalledTimes(3)
    for (const params of mocks.requests) {
      expect(params.model).toBe('claude-haiku-5-5')
      expect(params.temperature).toBeUndefined()
      expect(JSON.stringify(params.tools)).not.toMatch(/"(minimum|maximum|minLength)"/)
    }
    expect(getDb().prepare('SELECT DISTINCT kind, judge FROM jev_events ORDER BY kind').all()).toEqual([
      { kind: 'admission', judge: 'anthropic:claude-haiku-5-5' },
      { kind: 'verification', judge: 'anthropic:claude-haiku-5-5' }
    ])
  })

  it("drops an episode the model scores below its own threshold, even above Jev's", async () => {
    mocks.replies.push({ answers: { lasting_fact: 0.6 } })
    const queued = job('I might start drinking tea at some point, not sure yet', 2)
    const trace = startRunTrace(queued, 1)

    await expect(runEpisodePipeline(queued, trace)).resolves.toMatchObject({ status: 'dropped' })
    expect(trace.admission).toEqual({ probability: 0.6, threshold: 0.7 })
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('reclassifies a misfiled fact on Claude alone', async () => {
    const misc = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'u-1',
      predicate: 'misc',
      value: 'draws on weekends',
      sourceKind: 'passive',
      channelId: 'channel-1'
    })
    mocks.replies.push({ moves: [{ id: misc.id, predicate: 'hobby' }] }, { answers: { [`fits_${misc.id}`]: 0.92 } })

    await expect(reclassifyClaims()).resolves.toBe(1)
    expect(getActiveClaims('guild-1', 'u-1')).toEqual([
      expect.objectContaining({ predicate: 'hobby', value: 'draws on weekends' })
    ])
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
})
