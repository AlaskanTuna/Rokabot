import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../config.js', () => ({
  config: { logging: { level: 'silent' } }
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn }
}))

import { closeDb, getDb } from '../database.js'
import { pruneOldMetrics, recordExtractionEvent, recordResponseEvent } from '../metricsStore.js'

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
  tokensOutEst: 24
} as const

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
    recordExtractionEvent({
      guildId: 'guild-1',
      channelId: 'channel-1',
      durationMs: 75,
      outcome: 'saved',
      factsExtracted: 3,
      factsSaved: 2
    })

    const response = getDb().prepare('SELECT * FROM response_events').get() as Record<string, unknown>
    const extraction = getDb().prepare('SELECT * FROM extraction_events').get() as Record<string, unknown>

    expect(response).toMatchObject({
      guild_id: responseEvent.guildId,
      trigger: responseEvent.trigger,
      e2e_ms: responseEvent.e2eMs,
      tokens_out_est: responseEvent.tokensOutEst,
      created_at: now
    })
    expect(extraction).toMatchObject({
      guild_id: 'guild-1',
      duration_ms: 75,
      facts_extracted: 3,
      facts_saved: 2,
      created_at: now
    })
    vi.restoreAllMocks()
  })

  it('swallows and logs malformed telemetry writes', () => {
    expect(() => recordResponseEvent({} as never)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('prunes expired rows from both event tables and returns their combined count', () => {
    const now = Date.now()
    const db = getDb()
    db.prepare('DELETE FROM response_events').run()
    db.prepare('DELETE FROM extraction_events').run()
    db.prepare(
      'INSERT INTO response_events (guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms, retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'channel-1', 'user-1', 'mention', 'playful', 'ok', 'ok', 1, 1, 1, 0, 0, 1, 1, now - 8 * ONE_DAY)
    db.prepare(
      'INSERT INTO extraction_events (guild_id, channel_id, duration_ms, outcome, facts_extracted, facts_saved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'channel-1', 1, 'saved', 1, 1, now - 8 * ONE_DAY)
    recordResponseEvent(responseEvent)
    recordExtractionEvent({
      guildId: 'guild-1',
      channelId: 'channel-1',
      durationMs: 1,
      outcome: 'saved',
      factsExtracted: 1,
      factsSaved: 1
    })

    expect(pruneOldMetrics(7)).toBe(2)
    expect(db.prepare('SELECT COUNT(*) AS count FROM response_events').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM extraction_events').get()).toEqual({ count: 1 })
  })
})
