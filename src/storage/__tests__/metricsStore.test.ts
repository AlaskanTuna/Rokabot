import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../config.js', () => ({
  config: { logging: { level: 'silent' } }
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn }
}))

import { closeDb, getDb } from '../database.js'
import {
  type MemoryEventInput,
  countMemoryEvents,
  pruneOldMetrics,
  recordExtractionEvent,
  recordMemoryEvent,
  recordResponseEvent
} from '../metricsStore.js'

const ONE_DAY = 24 * 60 * 60 * 1000

const responseEvent = {
  guildId: 'guild-1',
  channelId: 'channel-1',
  userId: 'user-1',
  trigger: 'mention',
  tone: 'playful',
  outcome: 'ok',
  kind: 'ok',
  e2eMs: 120,
  generateMs: 100,
  llmMs: 80,
  retryLatencyMs: 0,
  retries: 0,
  tokensInEst: 42,
  tokensOutEst: 24,
  toolsUsed: ['roll_dice']
} as const

const memoryEvent: MemoryEventInput = {
  kind: 'retrieval',
  guildId: 'guild-1',
  channelId: 'channel-1',
  subjectUserId: 'user-1',
  durationMs: 12,
  nCandidates: 4,
  nSelected: 2,
  nChanged: 0,
  tokensEst: 36,
  op: 'none'
}

beforeAll(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterAll(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('metricsStore', () => {
  it('creates the documented event tables and guild timestamp indexes', () => {
    const db = getDb()
    const responseColumns = db.prepare("PRAGMA table_info('response_events')").all() as Array<{ name: string }>
    const extractionColumns = db.prepare("PRAGMA table_info('extraction_events')").all() as Array<{ name: string }>
    const responseIndexes = db.prepare("PRAGMA index_list('response_events')").all() as Array<{ name: string }>
    const extractionIndexes = db.prepare("PRAGMA index_list('extraction_events')").all() as Array<{ name: string }>

    expect(responseColumns.map((column) => column.name)).toEqual([
      'id',
      'guild_id',
      'channel_id',
      'user_id',
      'trigger',
      'tone',
      'outcome',
      'kind',
      'e2e_ms',
      'generate_ms',
      'llm_ms',
      'retry_latency_ms',
      'retries',
      'tokens_in_est',
      'tokens_out_est',
      'tools_used',
      'created_at'
    ])
    expect(extractionColumns.map((column) => column.name)).toEqual([
      'id',
      'guild_id',
      'channel_id',
      'duration_ms',
      'outcome',
      'facts_extracted',
      'facts_saved',
      'created_at'
    ])
    expect(responseIndexes.map((index) => index.name)).toContain('idx_response_events_guild_ts')
    expect(extractionIndexes.map((index) => index.name)).toContain('idx_extraction_events_guild_ts')
  })

  it('records response and extraction events with timestamps', () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    recordResponseEvent(responseEvent)
    recordResponseEvent({ ...responseEvent, toolsUsed: [] })
    recordExtractionEvent({
      guildId: 'guild-1',
      channelId: 'channel-1',
      durationMs: 75,
      outcome: 'saved',
      factsExtracted: 3,
      factsSaved: 2
    })

    const responses = getDb().prepare('SELECT * FROM response_events ORDER BY id').all() as Array<
      Record<string, unknown>
    >
    const extraction = getDb().prepare('SELECT * FROM extraction_events').get() as Record<string, unknown>

    expect(responses[0]).toMatchObject({
      guild_id: responseEvent.guildId,
      trigger: responseEvent.trigger,
      e2e_ms: responseEvent.e2eMs,
      tokens_out_est: responseEvent.tokensOutEst,
      tools_used: JSON.stringify(responseEvent.toolsUsed),
      created_at: now
    })
    expect(JSON.parse(responses[0].tools_used as string)).toEqual(responseEvent.toolsUsed)
    expect(responses[1].tools_used).toBe('[]')
    expect(JSON.parse(responses[1].tools_used as string)).toEqual([])
    expect(extraction).toMatchObject({
      guild_id: 'guild-1',
      duration_ms: 75,
      facts_extracted: 3,
      facts_saved: 2,
      created_at: now
    })
    vi.restoreAllMocks()
  })

  it('records value-free memory events with timestamps', () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = getDb()
    db.prepare('DELETE FROM memory_events').run()

    recordMemoryEvent(memoryEvent)

    const memory = db.prepare('SELECT * FROM memory_events').get() as Record<string, unknown>

    expect(countMemoryEvents()).toBe(1)
    expect(countMemoryEvents('retrieval')).toBe(1)
    expect(memory).toMatchObject({
      kind: memoryEvent.kind,
      guild_id: memoryEvent.guildId,
      channel_id: memoryEvent.channelId,
      subject_user_id: memoryEvent.subjectUserId,
      duration_ms: memoryEvent.durationMs,
      n_candidates: memoryEvent.nCandidates,
      n_selected: memoryEvent.nSelected,
      n_changed: memoryEvent.nChanged,
      tokens_est: memoryEvent.tokensEst,
      op: memoryEvent.op,
      created_at: now
    })
    expect(Object.keys(memory)).toEqual([
      'id',
      'kind',
      'guild_id',
      'channel_id',
      'subject_user_id',
      'duration_ms',
      'n_candidates',
      'n_selected',
      'n_changed',
      'tokens_est',
      'op',
      'created_at'
    ])
    expect(memory).not.toHaveProperty('value')
    expect(memory).not.toHaveProperty('key')
    vi.restoreAllMocks()
  })

  it('swallows and logs malformed telemetry writes', () => {
    expect(() => recordResponseEvent({} as never)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('swallows and logs malformed memory telemetry writes', () => {
    warn.mockClear()

    expect(() => recordMemoryEvent({} as never)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('prunes expired rows from all event tables and returns their combined count', () => {
    const now = Date.now()
    const db = getDb()
    db.prepare('DELETE FROM response_events').run()
    db.prepare('DELETE FROM extraction_events').run()
    db.prepare('DELETE FROM memory_events').run()
    db.prepare(
      'INSERT INTO response_events (guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms, retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'channel-1', 'user-1', 'mention', 'playful', 'ok', 'ok', 1, 1, 1, 0, 0, 1, 1, now - 8 * ONE_DAY)
    db.prepare(
      'INSERT INTO extraction_events (guild_id, channel_id, duration_ms, outcome, facts_extracted, facts_saved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'channel-1', 1, 'saved', 1, 1, now - 8 * ONE_DAY)
    db.prepare('INSERT INTO memory_events (kind, guild_id, n_selected, created_at) VALUES (?, ?, ?, ?)').run(
      'retrieval',
      'guild-1',
      1,
      now - 8 * ONE_DAY
    )
    recordResponseEvent(responseEvent)
    recordExtractionEvent({
      guildId: 'guild-1',
      channelId: 'channel-1',
      durationMs: 1,
      outcome: 'saved',
      factsExtracted: 1,
      factsSaved: 1
    })
    recordMemoryEvent(memoryEvent)

    expect(pruneOldMetrics(7)).toBe(3)
    expect(db.prepare('SELECT COUNT(*) AS count FROM response_events').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM extraction_events').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_events').get()).toEqual({ count: 1 })
  })
})
