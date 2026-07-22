/**
 * SQLite database initialization and lifecycle management.
 * Uses better-sqlite3 for synchronous, zero-config persistence.
 * DB file lives at `data/rokabot.db` relative to the project root.
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'

let db: Database.Database | null = null

/** Resolve the database file path relative to the project root. */
function resolveDbPath(): string {
  const override = process.env.ROKABOT_DB_PATH
  if (override) return override

  const root = resolve(import.meta.dirname ?? '.', '..', '..')
  const dataDir = resolve(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  return resolve(dataDir, 'rokabot.db')
}

/** Create all tables and indexes if they don't already exist. */
function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_history (
      channel_id TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_history_channel_ts
      ON session_history (channel_id, timestamp);

    CREATE TABLE IF NOT EXISTS user_memory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, fact_key)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      reminder TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      delivered INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders (delivered, due_at);

    CREATE TABLE IF NOT EXISTS game_scores (
      user_id TEXT NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL,
      played_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_game_scores_user_game
      ON game_scores (user_id, game);

    CREATE TABLE IF NOT EXISTS gacha_collection (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      obtained_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS gacha_daily (
      user_id TEXT NOT NULL,
      last_draw_date TEXT NOT NULL,
      streak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id)
    );

    CREATE TABLE IF NOT EXISTS buddy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_buddy_user ON buddy (user_id, hatched_at);

    CREATE TABLE IF NOT EXISTS user_names (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitored_channels (
      channel_id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `)
}

/**
 * Return the singleton SQLite database instance.
 * Initializes the DB and creates tables on first call.
 */
export function getDb(): Database.Database {
  if (!db) {
    const dbPath = resolveDbPath()
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    createTables(db)
    runMigrations(db)
    logger.info({ path: dbPath }, 'SQLite database initialized')
  }
  return db
}

/** Run forward-only schema migrations */
function runMigrations(database: Database.Database): void {
  // session_history: add user_id and username columns
  const shCols = database.prepare("PRAGMA table_info('session_history')").all() as Array<{ name: string }>
  const shColNames = new Set(shCols.map((c) => c.name))
  if (!shColNames.has('user_id')) {
    database.exec('ALTER TABLE session_history ADD COLUMN user_id TEXT DEFAULT NULL')
  }
  if (!shColNames.has('username')) {
    database.exec('ALTER TABLE session_history ADD COLUMN username TEXT DEFAULT NULL')
  }

  // user_memory: add guild_id to PK (requires table recreation)
  const umCols = database.prepare("PRAGMA table_info('user_memory')").all() as Array<{ name: string }>
  if (!umCols.some((c) => c.name === 'guild_id')) {
    database.exec(`
      CREATE TABLE user_memory_new (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id, fact_key)
      );
      INSERT INTO user_memory_new SELECT 'global', user_id, fact_key, fact_value, updated_at FROM user_memory;
      DROP TABLE user_memory;
      ALTER TABLE user_memory_new RENAME TO user_memory;
    `)
    logger.info('Migrated user_memory table to include guild_id')
  }
}

/** Close the database connection. Safe to call multiple times. */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('SQLite database closed')
  }
}
