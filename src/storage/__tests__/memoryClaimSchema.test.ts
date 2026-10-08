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

function prePeriodClaimDatabase(): Database.Database {
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
    CREATE TABLE memory_claim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL DEFAULT 'user' CHECK (subject_kind IN ('user', 'guild')),
      subject_user_id TEXT,
      predicate TEXT NOT NULL,
      value TEXT NOT NULL,
      object_kind TEXT,
      object_user_id TEXT,
      source_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      salience REAL NOT NULL DEFAULT 0.5,
      pinned INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      superseded_by INTEGER,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_recalled_at INTEGER,
      ended_at INTEGER,
      end_reason TEXT,
      expires_at INTEGER,
      event_date TEXT,
      embedding BLOB,
      embedding_text TEXT,
      CHECK ((subject_kind = 'user' AND subject_user_id IS NOT NULL) OR
             (subject_kind = 'guild' AND subject_user_id IS NULL)),
      CHECK (subject_kind != 'guild' OR predicate NOT IN ('upcoming_event', 'plan') OR expires_at IS NOT NULL)
    );
    CREATE TABLE memory_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id INTEGER NOT NULL, channel_id TEXT,
      source_kind TEXT NOT NULL, observed_at INTEGER NOT NULL
    );
    CREATE INDEX idx_memory_evidence_claim ON memory_evidence (claim_id);
    CREATE INDEX idx_memory_claim_guild_subject_status
      ON memory_claim (guild_id, subject_kind, subject_user_id, status);
    CREATE INDEX idx_memory_claim_guild_status_last_seen ON memory_claim (guild_id, status, last_seen_at);
    CREATE UNIQUE INDEX idx_memory_claim_user_dedup
      ON memory_claim (guild_id, subject_user_id, predicate, value)
      WHERE subject_kind = 'user';
    CREATE UNIQUE INDEX idx_memory_claim_guild_dedup
      ON memory_claim (guild_id, predicate, value)
      WHERE subject_kind = 'guild';
    INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, pinned, first_seen_at, last_seen_at)
      VALUES (1, 'g-1', 'u-1', 'hobby', 'chess', 'passive', 'active', 0, 10, 100);
    INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, pinned, first_seen_at, last_seen_at)
      VALUES (2, 'g-1', 'u-1', 'misc', 'owns a bike', 'explicit', 'active', 1, 20, 120);
    INSERT INTO memory_claim (id, guild_id, subject_user_id, predicate, value, source_kind, status, ended_at, end_reason, first_seen_at, last_seen_at)
      VALUES (3, 'g-1', 'u-1', 'hobby', 'go', 'passive', 'rejected', 300, 'removed', 30, 130);
    INSERT INTO memory_claim (id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
      VALUES (4, 'g-1', 'guild', NULL, 'misc', 'Game night is on Fridays', 'passive', 'active', 40, 140);
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (1, 'c-1', 'passive', 100);
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (2, 'c-1', 'explicit', 120);
  `)
  return db
}

const columnNames = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)

const schemaSnapshot = (db: Database.Database): Array<{ name: string; sql: string }> =>
  db.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE 'memory_%' ORDER BY name").all() as Array<{
    name: string
    sql: string
  }>

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
  it('adds event_date to existing tables without disturbing rows, idempotently', () => {
    const db = legacyClaimDatabase()
    runMigrations(db)

    const column = () =>
      (db.prepare("PRAGMA table_info('memory_claim')").all() as Array<{ name: string }>).find(
        ({ name }) => name === 'event_date'
      )
    expect(column()).toBeDefined()
    expect(db.prepare('SELECT event_date FROM memory_claim WHERE id = 7').get()).toEqual({ event_date: null })

    runMigrations(db)

    expect(column()).toBeDefined()
    expect(db.prepare('SELECT id, event_date, status FROM memory_claim').get()).toEqual({
      id: 7,
      event_date: null,
      status: 'active'
    })
    db.close()
  })

  it('adds period and effective_at, rebuilds the dedupe indexes with period, and is a no-op on a second run', () => {
    const db = prePeriodClaimDatabase()
    const before = db.prepare('SELECT * FROM memory_claim ORDER BY id').all() as Array<Record<string, unknown>>
    const beforeIndex = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_memory_claim_user_dedup'")
      .get() as { sql: string }
    expect(beforeIndex.sql).not.toContain('period')

    runMigrations(db)
    const afterFirstRun = schemaSnapshot(db)
    runMigrations(db)

    expect(schemaSnapshot(db)).toEqual(afterFirstRun)
    expect(columnNames(db, 'memory_claim')).toContain('period')
    expect(columnNames(db, 'memory_evidence')).toContain('effective_at')
    const indexSql = (name: string) =>
      (db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as { sql: string }).sql
    expect(indexSql('idx_memory_claim_user_dedup')).toContain('guild_id, subject_user_id, predicate, value, period')
    expect(indexSql('idx_memory_claim_guild_dedup')).toContain('guild_id, predicate, value, period')
    expect(db.prepare('SELECT DISTINCT period FROM memory_claim').all()).toEqual([{ period: 'current' }])
    const after = db.prepare('SELECT * FROM memory_claim ORDER BY id').all() as Array<Record<string, unknown>>
    expect(after.map(({ period: _period, ...row }) => row)).toEqual(before)
    expect(db.prepare('SELECT claim_id, effective_at FROM memory_evidence ORDER BY id').all()).toEqual([
      { claim_id: 1, effective_at: null },
      { claim_id: 2, effective_at: null }
    ])
    db.close()
  })

  it('lets a past and a current claim share a value but still rejects an exact duplicate', () => {
    const db = prePeriodClaimDatabase()
    runMigrations(db)
    const insert = db.prepare(
      "INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at, period) VALUES ('g-1', ?, ?, 'misc', ?, 'passive', 'active', 1, 1, ?)"
    )

    insert.run('user', 'u-1', 'owns a bike', 'past')
    expect(() => insert.run('user', 'u-1', 'owns a bike', 'past')).toThrow(/UNIQUE/)
    insert.run('guild', null, 'Game night is on Fridays', 'past')
    expect(() => insert.run('guild', null, 'Game night is on Fridays', 'past')).toThrow(/UNIQUE/)
    expect(() => insert.run('user', 'u-1', 'plays piano', 'sometime')).toThrow(/CHECK/)
    expect(db.prepare("SELECT period FROM memory_claim WHERE value = 'owns a bike' ORDER BY period").all()).toEqual([
      { period: 'current' },
      { period: 'past' }
    ])
    db.close()
  })

  it('adds period to a legacy table that is rebuilt for subject columns, keeping every row current', () => {
    const db = legacyClaimDatabase()

    runMigrations(db)
    runMigrations(db)

    expect(columnNames(db, 'memory_claim')).toContain('period')
    expect(columnNames(db, 'memory_evidence')).toContain('effective_at')
    expect(db.prepare('SELECT id, period FROM memory_claim').all()).toEqual([{ id: 7, period: 'current' }])
    expect(
      (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_memory_claim_user_dedup'").get() as { sql: string })
        .sql
    ).toContain('period')
    db.close()
  })
})
