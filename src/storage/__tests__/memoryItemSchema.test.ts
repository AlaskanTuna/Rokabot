import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../database.js'
import { ensureMemoryItemSchema } from '../memoryItemSchema.js'

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('memory item schema', () => {
  it('creates the typed tables, indexes, and FTS triggers at database startup', () => {
    process.env.ROKABOT_DB_PATH = ':memory:'

    const db = getDb()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as Array<{
      name: string
    }>
    const indexes = (table: string) =>
      (db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)
    const columns = (table: string) =>
      (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'memory_item',
        'memory_item_evidence',
        'memory_item_occurrence',
        'memory_item_payload',
        'memory_item_embedding',
        'memory_item_fts'
      ])
    )
    expect(columns('memory_item')).toEqual([
      'id',
      'guild_id',
      'kind',
      'subject_kind',
      'subject_user_id',
      'predicate',
      'content',
      'label',
      'media_kind',
      'content_key',
      'source_job_id',
      'period',
      'object_kind',
      'object_user_id',
      'source_kind',
      'status',
      'needs_review',
      'end_reason',
      'ended_at',
      'superseded_by',
      'confidence',
      'salience',
      'pinned',
      'valid_until',
      'event_date',
      'first_seen_at',
      'last_seen_at',
      'last_recalled_at',
      'created_at',
      'version',
      'legacy_table',
      'legacy_id',
      'legacy_embedding_text'
    ])
    expect(columns('memory_item_embedding')).toEqual([
      'item_id',
      'fingerprint',
      'model_id',
      'dim',
      'renderer',
      'renderer_version',
      'text_hash',
      'vector',
      'created_at'
    ])
    expect(indexes('memory_item')).toEqual(
      expect.arrayContaining([
        'idx_memory_item_user_fact',
        'idx_memory_item_guild_fact',
        'idx_memory_item_episode',
        'idx_memory_item_media',
        'idx_memory_item_scope'
      ])
    )
    expect(indexes('memory_item_evidence')).toContain('idx_memory_item_evidence_job')
    expect(indexes('memory_item_occurrence')).toEqual(
      expect.arrayContaining(['idx_memory_item_occurrence_message', 'idx_memory_item_occurrence_episode'])
    )
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'memory_item_fts_%'").all()
    ).toHaveLength(3)
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_item').get()).toEqual({ count: 0 })

    expect(() => ensureMemoryItemSchema(db)).not.toThrow()
  })
})
