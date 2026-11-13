import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTunableEnvVars, setRequiredEnvVars } from '../../__tests__/configOverrides.js'

afterEach(() => {
  vi.unstubAllEnvs()
  process.env.ROKABOT_DB_PATH = undefined
  vi.resetModules()
})

async function openProjectionDb(store: 'legacy' | 'dual' | 'item') {
  vi.resetModules()
  setRequiredEnvVars()
  clearTunableEnvVars()
  vi.stubEnv('MEMORY_STORE', store)
  vi.stubEnv('ROKABOT_DB_PATH', ':memory:')

  const { config } = await import('../../config.js')
  const { closeDb, getDb } = await import('../database.js')
  const { configureMemoryItemProjectionTriggers } = await import('../memoryItemProjection.js')
  const db = getDb()
  configureMemoryItemProjectionTriggers(db, config.memory.store)
  return { db, closeDb }
}

async function expectNoCatchUpWrites(db: Database.Database) {
  const { getMemoryItemDriftCounts, migrateMemoryItems } = await import('../memoryItemBackfill.js')
  expect(getMemoryItemDriftCounts(db)).toEqual({ fact: 0, episode: 0, media: 0 })
  const report = migrateMemoryItems(db)
  expect(report.copied_items).toBe(0)
  expect(report.copied_evidence).toBe(0)
  expect(report.copied_occurrences).toBe(0)
  expect(report.copied_payloads).toBe(0)
  expect(report.copied_embeddings).toBe(0)
}

describe('memory item projection triggers', () => {
  it('installs one insert, update, and delete trigger for every legacy source in dual mode', async () => {
    const { db, closeDb } = await openProjectionDb('dual')
    try {
      const triggers = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'memory_item_projection_%'")
        .all()

      expect(triggers).toHaveLength(15)
    } finally {
      closeDb()
    }
  })

  it('drops projection triggers in item mode so legacy tables stay frozen', async () => {
    const { db, closeDb } = await openProjectionDb('item')
    try {
      const triggers = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'memory_item_projection_%'")
        .all()

      expect(triggers).toHaveLength(0)
    } finally {
      closeDb()
    }
  })

  it('drops projection triggers in legacy mode', async () => {
    const { db, closeDb } = await openProjectionDb('dual')
    try {
      const { configureMemoryItemProjectionTriggers } = await import('../memoryItemProjection.js')
      configureMemoryItemProjectionTriggers(db, 'legacy')

      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'memory_item_projection_%'"
          )
          .get()
      ).toEqual({ count: 0 })
    } finally {
      closeDb()
    }
  })

  it('keeps the Phase 2 projection current after each legacy table write', async () => {
    const { db, closeDb } = await openProjectionDb('dual')
    try {
      const vector = Buffer.from([0, 0, 128, 63])
      const insertClaim = db.prepare(`
        INSERT INTO memory_claim (
          id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence, salience,
          first_seen_at, last_seen_at, embedding, embedding_text, embedding_model_id, embedding_dim,
          embedding_fingerprint, period
        ) VALUES (11, 'guild-fixture', 'user', 'user-fixture', 'hobby', 'chess', 'explicit', 'active', 0.8, 0.7,
                  10, 20, ?, 'A hobby: chess.', 'model', 1, 'unknown', 'current')
      `)
      insertClaim.run(vector)
      await expectNoCatchUpWrites(db)
      expect(
        db
          .prepare(`
          SELECT item.kind, item.content, embedding.text_hash
          FROM memory_item item JOIN memory_item_embedding embedding ON embedding.item_id = item.id
          WHERE item.legacy_table = 'memory_claim' AND item.legacy_id = 11
        `)
          .get()
      ).toEqual({ kind: 'fact', content: 'chess', text_hash: null })
      expect(db.prepare('SELECT rowid FROM memory_item_fts WHERE memory_item_fts MATCH ?').get('chess')).toBeDefined()

      db.prepare(`
        INSERT INTO memory_evidence (
          id, claim_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id
        ) VALUES (21, 11, 'channel-a', 'explicit', 20, 19, 31, 'message-a', 'user-fixture')
      `).run()
      await expectNoCatchUpWrites(db)
      db.prepare("UPDATE memory_evidence SET channel_id = 'channel-b' WHERE id = 21").run()
      await expectNoCatchUpWrites(db)
      db.prepare("UPDATE memory_claim SET value = 'go' WHERE id = 11").run()
      await expectNoCatchUpWrites(db)
      expect(db.prepare('SELECT rowid FROM memory_item_fts WHERE memory_item_fts MATCH ?').get('chess')).toBeUndefined()
      expect(db.prepare('SELECT rowid FROM memory_item_fts WHERE memory_item_fts MATCH ?').get('go')).toBeDefined()
      expect(
        db.prepare("SELECT content FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 11").get()
      ).toEqual({
        content: 'go'
      })
      db.prepare('DELETE FROM memory_evidence WHERE id = 21').run()
      await expectNoCatchUpWrites(db)
      db.prepare('DELETE FROM memory_claim WHERE id = 11').run()
      await expectNoCatchUpWrites(db)
      expect(db.prepare('SELECT rowid FROM memory_item_fts WHERE memory_item_fts MATCH ?').get('go')).toBeUndefined()

      db.prepare(`
        INSERT INTO memory_episode (id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at,
          embedding_model_id, embedding_dim, embedding_fingerprint)
        VALUES (41, 'guild-fixture', 'channel-episode', 30, 40, 'First summary.', ?, 50, 'model', 1, 'unknown')
      `).run(vector)
      await expectNoCatchUpWrites(db)
      db.prepare("UPDATE memory_episode SET summary = 'Second summary.' WHERE id = 41").run()
      await expectNoCatchUpWrites(db)
      expect(
        db
          .prepare("SELECT content, version FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = 41")
          .get()
      ).toEqual({ content: 'Second summary.', version: 2 })
      db.prepare('DELETE FROM memory_episode WHERE id = 41').run()
      await expectNoCatchUpWrites(db)

      db.prepare(`
        INSERT INTO media_digest (id, guild_id, content_key, kind, label, summary, digest_json, embedding, created_at,
          embedding_model_id, embedding_dim, embedding_fingerprint)
        VALUES (51, 'guild-fixture', 'video:key', 'video', 'Label', 'Media summary.', '{}', ?, 60, 'model', 1, 'unknown')
      `).run(vector)
      await expectNoCatchUpWrites(db)
      db.prepare(`
        INSERT INTO media_occurrence (
          id, digest_id, guild_id, channel_id, message_id, shared_by_user_id, source_author_id, origin, observed_at
        ) VALUES (61, 51, 'guild-fixture', 'channel-a', 'message-media', 'user-fixture', NULL, 'upload', 70)
      `).run()
      await expectNoCatchUpWrites(db)
      db.prepare("UPDATE media_occurrence SET channel_id = 'channel-b', observed_at = 80 WHERE id = 61").run()
      await expectNoCatchUpWrites(db)
      db.prepare("UPDATE media_digest SET label = 'New label', summary = 'New summary.' WHERE id = 51").run()
      await expectNoCatchUpWrites(db)
      expect(
        db
          .prepare(
            "SELECT content, label, last_seen_at, version FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = 51"
          )
          .get()
      ).toEqual({ content: 'New summary.', label: 'New label', last_seen_at: 80, version: 2 })
      db.prepare('DELETE FROM media_occurrence WHERE id = 61').run()
      await expectNoCatchUpWrites(db)
      db.prepare('DELETE FROM media_digest WHERE id = 51').run()
      await expectNoCatchUpWrites(db)
    } finally {
      closeDb()
    }
  })
})
