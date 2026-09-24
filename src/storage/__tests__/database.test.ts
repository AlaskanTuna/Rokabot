import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn() }
}))

import * as database from '../database.js'

type DatabaseModule = {
  runMigrations?: (database: Database.Database) => void
}

let testDb: Database.Database

afterEach(() => {
  testDb?.close()
  database.closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('runMigrations', () => {
  it('does not create the legacy fact table during startup', () => {
    process.env.ROKABOT_DB_PATH = ':memory:'

    const startupDb = database.getDb()

    expect(startupDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_memory'").get()).toBe(
      undefined
    )
  })

  it('creates the memory episode cursor table', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
        timestamp INTEGER NOT NULL, user_id TEXT, username TEXT
      );
      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL, last_draw_date TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
        last_hatch_at INTEGER, PRIMARY KEY (user_id)
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, enqueued_at INTEGER NOT NULL
      );
    `)

    database.runMigrations(testDb)

    const columns = testDb.prepare("PRAGMA table_info('memory_episode_cursor')").all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toEqual([
      'channel_id',
      'guild_id',
      'last_message_id',
      'opened_at',
      'message_count'
    ])
  })

  it('rebuilds the old extraction queue without losing pending, processing, or failed episodes', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );
      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        last_draw_date TEXT NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0,
        last_hatch_at INTEGER,
        PRIMARY KEY (user_id)
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL,
        admitted_by TEXT DEFAULT NULL
      );
    `)
    const insert = testDb.prepare(
      'INSERT INTO extraction_queue (id, guild_id, channel_id, payload, status, attempts, enqueued_at, admitted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const row of [
      { id: 1, status: 'pending', attempts: 0, enqueuedAt: 100 },
      { id: 2, status: 'processing', attempts: 1, enqueuedAt: 200 },
      { id: 3, status: 'failed', attempts: 2, enqueuedAt: 300 }
    ]) {
      insert.run(
        row.id,
        'guild-1',
        'channel-1',
        JSON.stringify([{ userId: `user-${row.id}`, displayName: 'Mio', content: `legacy ${row.id}` }]),
        row.status,
        row.attempts,
        row.enqueuedAt,
        null
      )
    }

    const runMigrations = (database as unknown as DatabaseModule).runMigrations
    runMigrations?.(testDb)
    runMigrations?.(testDb)

    const columns = testDb.prepare("PRAGMA table_info('extraction_queue')").all() as Array<{ name: string }>
    const jobs = testDb
      .prepare('SELECT id, payload, status, attempts, enqueued_at FROM extraction_queue ORDER BY id')
      .all() as Array<{ id: number; payload: string; status: string; attempts: number; enqueued_at: number }>
    expect(columns.map((column) => column.name)).not.toContain('admitted_by')
    expect(jobs.map(({ id, status, attempts, enqueued_at }) => ({ id, status, attempts, enqueued_at }))).toEqual([
      { id: 1, status: 'pending', attempts: 0, enqueued_at: 100 },
      { id: 2, status: 'processing', attempts: 1, enqueued_at: 200 },
      { id: 3, status: 'failed', attempts: 2, enqueued_at: 300 }
    ])
    expect(jobs.map(({ id, payload }) => JSON.parse(payload))).toEqual(
      [1, 2, 3].map((id) => ({
        messages: [
          {
            messageId: `legacy-${id}-0`,
            userId: `user-${id}`,
            displayName: 'Mio',
            content: `legacy ${id}`,
            timestamp: id * 100,
            isBot: false
          }
        ],
        context: [],
        startedAt: id * 100,
        endedAt: id * 100
      }))
    )
  })

  it('keeps an old user_memory table and its rows during startup schema migration', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
        timestamp INTEGER NOT NULL, user_id TEXT DEFAULT NULL, username TEXT DEFAULT NULL
      );
      CREATE TABLE user_memory (
        user_id TEXT NOT NULL, fact_key TEXT NOT NULL, fact_value TEXT NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, fact_key)
      );
      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL, last_draw_date TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
        last_hatch_at INTEGER, PRIMARY KEY (user_id)
      );
    `)
    testDb.prepare('INSERT INTO user_memory VALUES (?, ?, ?, ?)').run('user-1', 'likes', 'tea', 1)

    database.runMigrations(testDb)

    expect(testDb.prepare('SELECT * FROM user_memory').all()).toEqual([
      { user_id: 'user-1', fact_key: 'likes', fact_value: 'tea', updated_at: 1 }
    ])
  })

  it('does not rewrite or discard a malformed legacy queue row', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL,
        timestamp INTEGER NOT NULL, user_id TEXT DEFAULT NULL, username TEXT DEFAULT NULL
      );
      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL, last_draw_date TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0,
        last_hatch_at INTEGER, PRIMARY KEY (user_id)
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL, admitted_by TEXT DEFAULT NULL
      );
      INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at)
        VALUES ('guild-1', 'channel-1', '{broken', 'pending', 100);
    `)

    expect(() => database.runMigrations(testDb)).toThrow('Malformed extraction queue payload for job 1')
    expect(testDb.prepare('SELECT payload, status FROM extraction_queue WHERE id = 1').get()).toEqual({
      payload: '{broken',
      status: 'pending'
    })
    expect(
      (testDb.prepare("PRAGMA table_info('extraction_queue')").all() as Array<{ name: string }>).map(
        (column) => column.name
      )
    ).toContain('admitted_by')
  })

  it('adds daily draw columns to legacy gacha_daily tables without losing existing rows', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );

      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        PRIMARY KEY (user_id)
      );
    `)
    testDb.prepare('INSERT INTO gacha_daily (user_id) VALUES (?)').run('user-1')

    const runMigrations = (database as unknown as DatabaseModule).runMigrations
    expect(runMigrations).toBeTypeOf('function')
    runMigrations?.(testDb)
    runMigrations?.(testDb)

    const columns = testDb.prepare("PRAGMA table_info('gacha_daily')").all() as Array<{ name: string }>
    const row = testDb
      .prepare('SELECT user_id, last_draw_date, streak FROM gacha_daily WHERE user_id = ?')
      .get('user-1')

    expect(columns.map((column) => column.name)).toContain('streak')
    expect(columns.map((column) => column.name)).toContain('last_draw_date')
    expect(row).toEqual({ user_id: 'user-1', last_draw_date: null, streak: 0 })
  })

  it('adds last_hatch_at to existing gacha_daily tables without losing rows', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );

      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        last_draw_date TEXT NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id)
      );
    `)
    testDb
      .prepare('INSERT INTO gacha_daily (user_id, last_draw_date, streak) VALUES (?, ?, ?)')
      .run('user-1', '2026-04-01', 4)

    const runMigrations = (database as unknown as DatabaseModule).runMigrations
    runMigrations?.(testDb)
    runMigrations?.(testDb)

    const columns = testDb.prepare("PRAGMA table_info('gacha_daily')").all() as Array<{ name: string }>
    const row = testDb
      .prepare('SELECT user_id, last_draw_date, streak, last_hatch_at FROM gacha_daily WHERE user_id = ?')
      .get('user-1')

    expect(columns.map((column) => column.name)).toContain('last_hatch_at')
    expect(row).toEqual({ user_id: 'user-1', last_draw_date: '2026-04-01', streak: 4, last_hatch_at: null })
  })

  it('rebuilds the historical buddy schema without an id column and preserves its rows', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );

      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        last_draw_date TEXT NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id)
      );

      CREATE TABLE buddy (
        user_id TEXT PRIMARY KEY,
        species TEXT NOT NULL,
        rarity TEXT NOT NULL,
        shiny INTEGER NOT NULL DEFAULT 0,
        eyes TEXT NOT NULL,
        hat TEXT NOT NULL,
        name TEXT,
        personality TEXT,
        stats_json TEXT NOT NULL,
        hatched_at INTEGER NOT NULL
      );
    `)
    testDb
      .prepare(
        `INSERT INTO buddy (user_id, species, rarity, shiny, eyes, hat, name, personality, stats_json, hatched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('user-1', 'kitsune', 'rare', 0, 'sparkle', 'none', 'Hoshi', 'Clever', '{"wit":8}', 1)

    const runMigrations = (database as unknown as DatabaseModule).runMigrations
    runMigrations?.(testDb)

    expect(testDb.prepare('SELECT * FROM buddy WHERE user_id = ?').get('user-1')).toMatchObject({
      species: 'kitsune',
      rarity: 'rare',
      name: 'Hoshi',
      stats_json: '{"wit":8}'
    })
    expect(() =>
      testDb
        .prepare(
          `INSERT INTO buddy (user_id, species, rarity, shiny, eyes, hat, name, personality, stats_json, hatched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run('user-1', 'tanuki', 'common', 0, 'round', 'none', null, null, '{"luck":2}', 2)
    ).not.toThrow()
    expect(() => runMigrations?.(testDb)).not.toThrow()
  })

  it('rebuilds legacy buddy tables with a unique user_id constraint without losing rows', () => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE session_history (
        channel_id TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        user_id TEXT DEFAULT NULL,
        username TEXT DEFAULT NULL
      );

      CREATE TABLE gacha_daily (
        user_id TEXT NOT NULL,
        last_draw_date TEXT NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id)
      );

      CREATE TABLE buddy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        species TEXT NOT NULL,
        rarity TEXT NOT NULL,
        shiny INTEGER NOT NULL DEFAULT 0,
        eyes TEXT NOT NULL,
        hat TEXT NOT NULL,
        name TEXT,
        personality TEXT,
        stats_json TEXT NOT NULL,
        hatched_at INTEGER NOT NULL
      );
    `)
    testDb
      .prepare(
        `INSERT INTO buddy (user_id, species, rarity, shiny, eyes, hat, name, personality, stats_json, hatched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('user-1', 'kitsune', 'rare', 0, 'sparkle', 'none', 'Hoshi', 'Clever', '{"wit":8}', 1)

    const runMigrations = (database as unknown as DatabaseModule).runMigrations
    runMigrations?.(testDb)
    runMigrations?.(testDb)

    expect(testDb.prepare('SELECT * FROM buddy WHERE user_id = ?').get('user-1')).toMatchObject({
      species: 'kitsune',
      rarity: 'rare',
      name: 'Hoshi',
      stats_json: '{"wit":8}'
    })
    expect(() =>
      testDb
        .prepare(
          `INSERT INTO buddy (user_id, species, rarity, shiny, eyes, hat, name, personality, stats_json, hatched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run('user-1', 'tanuki', 'common', 0, 'sleepy', 'cap', 'Yume', 'Mischievous', '{"luck":4}', 2)
    ).not.toThrow()
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM buddy WHERE user_id = ?').get('user-1')).toEqual({ count: 2 })
  })
})
