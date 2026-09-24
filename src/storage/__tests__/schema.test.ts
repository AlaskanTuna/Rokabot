import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { info } = vi.hoisted(() => ({ info: vi.fn() }))

vi.mock('../../utils/logger.js', () => ({
  logger: { info }
}))

import { closeDb, getDb } from '../database.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('claims schema', () => {
  it('creates the documented claims, evidence, queue, and telemetry tables with indexes', () => {
    const db = getDb()

    const columns = (table: string) =>
      (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map((column) => column.name)
    const indexes = (table: string) =>
      (db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>).map((index) => index.name)

    expect(columns('memory_claim')).toEqual([
      'id',
      'guild_id',
      'subject_user_id',
      'predicate',
      'value',
      'object_kind',
      'object_user_id',
      'source_kind',
      'status',
      'confidence',
      'salience',
      'pinned',
      'needs_review',
      'superseded_by',
      'first_seen_at',
      'last_seen_at',
      'last_recalled_at'
    ])
    expect(columns('memory_evidence')).toEqual(['id', 'claim_id', 'channel_id', 'source_kind', 'observed_at'])
    expect(columns('extraction_queue')).toEqual([
      'id',
      'guild_id',
      'channel_id',
      'payload',
      'status',
      'attempts',
      'enqueued_at'
    ])
    expect(columns('memory_events')).toEqual([
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
    expect(indexes('memory_claim')).toEqual(
      expect.arrayContaining([
        'idx_memory_claim_guild_subject_status',
        'idx_memory_claim_guild_status_last_seen',
        'idx_memory_claim_dedup'
      ])
    )
    expect(indexes('memory_evidence')).toContain('idx_memory_evidence_claim')
    expect(indexes('extraction_queue')).toContain('idx_extraction_queue_guild_status_enqueued')
    expect(indexes('memory_events')).toEqual(
      expect.arrayContaining(['idx_memory_events_kind_created', 'idx_memory_events_guild_created'])
    )
  })

  it('supports FTS5 and synchronizes claims through triggers', () => {
    const db = getDb()
    db.exec('CREATE VIRTUAL TABLE temp.fts_probe USING fts5(x)')
    db.prepare(
      'INSERT INTO memory_claim (guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'user-1', 'favorite_anime', 'Senren Banka', 'explicit', 'active', 1, 1)

    const result = db
      .prepare(
        'SELECT memory_claim.id FROM memory_claim JOIN memory_claim_fts ON memory_claim.id = memory_claim_fts.rowid WHERE memory_claim_fts MATCH ?'
      )
      .get('Senren')

    expect(result).toEqual({ id: 1 })
  })

  it('keeps non-active claims out of FTS after later updates', () => {
    const db = getDb()
    db.prepare(
      'INSERT INTO memory_claim (guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('guild-1', 'user-1', 'favorite_anime', 'Frieren', 'explicit', 'active', 1, 1)

    db.prepare("UPDATE memory_claim SET status = 'rejected' WHERE id = 1").run()
    db.prepare('UPDATE memory_claim SET confidence = ? WHERE id = 1').run(0.9)

    expect(db.prepare('SELECT rowid FROM memory_claim_fts WHERE memory_claim_fts MATCH ?').all('Frieren')).toEqual([])
  })

  it('is idempotent when getDb is called repeatedly', () => {
    const first = getDb()
    const second = getDb()

    expect(second).toBe(first)
    expect(
      second.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_claim'").get()
    ).toEqual({
      name: 'memory_claim'
    })
  })
})
