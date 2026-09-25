import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../database.js'

function legacyClaimDatabase(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE session_history (
      channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
      timestamp INTEGER NOT NULL, user_id TEXT, username TEXT
    );
    CREATE TABLE gacha_daily (
      user_id TEXT NOT NULL, last_draw_date TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
      last_hatch_at INTEGER, PRIMARY KEY (user_id)
    );
  `)
  db.exec(
    [
      'CREATE TABLE memory_claim (',
      '  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, subject_user_id TEXT NOT NULL,',
      '  predicate TEXT NOT NULL, value TEXT NOT NULL, object_kind TEXT, object_user_id TEXT,',
      '  source_kind TEXT NOT NULL, status TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0.5,',
      '  salience REAL NOT NULL DEFAULT 0.5, pinned INTEGER NOT NULL DEFAULT 0, needs_review INTEGER NOT NULL DEFAULT 0,',
      '  superseded_by INTEGER, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, last_recalled_at INTEGER',
      ');',
      'CREATE TABLE memory_evidence (',
      '  id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id INTEGER NOT NULL, channel_id TEXT,',
      '  source_kind TEXT NOT NULL, observed_at INTEGER NOT NULL',
      ');',
      "CREATE VIRTUAL TABLE memory_claim_fts USING fts5(value, predicate, content='memory_claim', content_rowid='id')"
    ].join('\n')
  )
  db.prepare(
    'INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(7, 'g-1', 'u-1', 'likes', 'tea', 'passive', 'active', 100, 200)
  db.prepare(
    'INSERT INTO memory_evidence (id, claim_id, channel_id, source_kind, observed_at) VALUES (?, ?, ?, ?, ?)'
  ).run(4, 7, 'c-1', 'passive', 200)
  db.prepare('INSERT INTO memory_claim_fts (rowid, value, predicate) VALUES (?, ?, ?)').run(7, 'tea', 'likes')
  return db
}

describe('ensureMemoryClaimSchema', () => {
  it('migrates legacy user claims without changing IDs, evidence, status, or FTS lookup', () => {
    const db = legacyClaimDatabase()
    runMigrations(db)

    expect(db.prepare('SELECT id, subject_kind, subject_user_id, expires_at, status FROM memory_claim').get()).toEqual({
      id: 7,
      subject_kind: 'user',
      subject_user_id: 'u-1',
      expires_at: null,
      status: 'active'
    })
    expect(db.prepare('SELECT id, claim_id FROM memory_evidence').get()).toEqual({ id: 4, claim_id: 7 })
    expect(db.prepare("SELECT rowid FROM memory_claim_fts WHERE memory_claim_fts MATCH 'tea'").get()).toEqual({
      rowid: 7
    })
    const columns = db.prepare("PRAGMA table_info('memory_claim')").all() as Array<{
      name: string
      notnull: number
    }>
    expect(columns.map(({ name }) => name)).toContain('subject_kind')
    expect(columns.find(({ name }) => name === 'subject_user_id')?.notnull).toBe(0)
    if (!columns.some(({ name }) => name === 'subject_kind')) {
      db.close()
      return
    }
    db.prepare(
      "INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at, expires_at) VALUES (?, 'guild', NULL, 'plan', 'Game night', 'passive', 'active', 300, 300, 900)"
    ).run('g-1')
    expect(db.prepare("SELECT subject_kind, subject_user_id FROM memory_claim WHERE predicate = 'plan'").get()).toEqual(
      {
        subject_kind: 'guild',
        subject_user_id: null
      }
    )
    db.close()
  })

  it('adds lifecycle columns, backfills dead claims and repairs active sightings idempotently', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL, last_draw_date TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
        last_hatch_at INTEGER, PRIMARY KEY (user_id)
      );
      CREATE TABLE memory_claim (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL,
        subject_kind TEXT NOT NULL DEFAULT 'user' CHECK (subject_kind IN ('user', 'guild')),
        subject_user_id TEXT, predicate TEXT NOT NULL, value TEXT NOT NULL, object_kind TEXT, object_user_id TEXT,
        source_kind TEXT NOT NULL, status TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0.5,
        salience REAL NOT NULL DEFAULT 0.5, pinned INTEGER NOT NULL DEFAULT 0, needs_review INTEGER NOT NULL DEFAULT 0,
        superseded_by INTEGER, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
        last_recalled_at INTEGER, expires_at INTEGER
      );
      CREATE TABLE memory_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id INTEGER NOT NULL, channel_id TEXT,
        source_kind TEXT NOT NULL, observed_at INTEGER NOT NULL
      );
      INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
        VALUES (1, 'g-1', 'u-1', 'likes', 'tea', 'passive', 'active', 10, 100);
      INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
        VALUES (2, 'g-1', 'u-1', 'likes', 'coffee', 'passive', 'rejected', 10, 20);
      INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
        VALUES (3, 'g-1', 'u-1', 'nickname', 'Rin', 'passive', 'superseded', 10, 30);
      INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
        VALUES (4, 'g-1', 'u-1', 'hobby', 'tea', 'passive', 'candidate', 10, 40);
      INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (1, 'c-1', 'passive', 200);
    `)
    vi.spyOn(Date, 'now').mockReturnValue(500)

    runMigrations(db)

    expect(db.prepare('SELECT id, last_seen_at, ended_at, end_reason FROM memory_claim ORDER BY id').all()).toEqual([
      { id: 1, last_seen_at: 200, ended_at: null, end_reason: null },
      { id: 2, last_seen_at: 20, ended_at: 500, end_reason: null },
      { id: 3, last_seen_at: 30, ended_at: 500, end_reason: null },
      { id: 4, last_seen_at: 40, ended_at: null, end_reason: null }
    ])

    vi.spyOn(Date, 'now').mockReturnValue(900)
    runMigrations(db)

    expect(db.prepare('SELECT ended_at FROM memory_claim WHERE id = 2').get()).toEqual({ ended_at: 500 })
    expect(db.prepare('SELECT last_seen_at FROM memory_claim WHERE id = 1').get()).toEqual({ last_seen_at: 200 })
    db.close()
  })
})
