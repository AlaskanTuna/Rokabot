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
})

describe('runMigrations', () => {
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

      CREATE TABLE user_memory (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, fact_key)
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

      CREATE TABLE user_memory (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, fact_key)
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

      CREATE TABLE user_memory (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, fact_key)
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
