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
      last_hatch_at INTEGER,
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

    CREATE TABLE IF NOT EXISTS response_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      tone TEXT NOT NULL,
      outcome TEXT NOT NULL,
      kind TEXT NOT NULL,
      e2e_ms INTEGER NOT NULL,
      generate_ms INTEGER NOT NULL,
      llm_ms INTEGER NOT NULL,
      retry_latency_ms INTEGER NOT NULL,
      retries INTEGER NOT NULL,
      tokens_in_est INTEGER NOT NULL,
      tokens_out_est INTEGER NOT NULL,
      tools_used TEXT DEFAULT NULL,
      failure_marker TEXT DEFAULT NULL,
      model TEXT DEFAULT NULL,
      hedged INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_response_events_guild_ts
      ON response_events (guild_id, created_at);

    -- Forensic detail for turns that did not succeed. Holds the triggering message verbatim, so it
    -- carries a shorter retention than response_events (see metrics.diagnosticsRetentionHours).
    CREATE TABLE IF NOT EXISTS failure_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      kind TEXT NOT NULL,
      failure_marker TEXT DEFAULT NULL,
      block_side TEXT DEFAULT NULL,
      finish_reason TEXT DEFAULT NULL,
      safety_ratings TEXT DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      safety_rungs_used INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      tone TEXT DEFAULT NULL,
      image_count INTEGER NOT NULL DEFAULT 0,
      image_mimes TEXT DEFAULT NULL,
      overheard_chars INTEGER NOT NULL DEFAULT 0,
      history_depth INTEGER NOT NULL DEFAULT 0,
      fact_entries INTEGER NOT NULL DEFAULT 0,
      user_message TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_failure_diagnostics_ts
      ON failure_diagnostics (created_at);

    CREATE TABLE IF NOT EXISTS extraction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      facts_extracted INTEGER NOT NULL,
      facts_saved INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_extraction_events_guild_ts
      ON extraction_events (guild_id, created_at);

    CREATE TABLE IF NOT EXISTS jev_events (
      kind TEXT NOT NULL CHECK (kind IN ('turn', 'admission', 'verification')),
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      probability REAL,
      confidence REAL,
      applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
      latency_ms INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      baseline TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jev_events_created_at
      ON jev_events (created_at);
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
export function runMigrations(database: Database.Database): void {
  // session_history: add user_id and username columns
  const shCols = database.prepare("PRAGMA table_info('session_history')").all() as Array<{ name: string }>
  const shColNames = new Set(shCols.map((c) => c.name))
  if (!shColNames.has('user_id')) {
    database.exec('ALTER TABLE session_history ADD COLUMN user_id TEXT DEFAULT NULL')
  }
  if (!shColNames.has('username')) {
    database.exec('ALTER TABLE session_history ADD COLUMN username TEXT DEFAULT NULL')
  }

  // gacha_daily: add streak tracking columns
  const gdCols = database.prepare("PRAGMA table_info('gacha_daily')").all() as Array<{ name: string }>
  const gdColNames = new Set(gdCols.map((c) => c.name))
  if (!gdColNames.has('streak')) {
    database.exec('ALTER TABLE gacha_daily ADD COLUMN streak INTEGER NOT NULL DEFAULT 0')
  }
  if (!gdColNames.has('last_draw_date')) {
    database.exec('ALTER TABLE gacha_daily ADD COLUMN last_draw_date TEXT')
  }
  if (!gdColNames.has('last_hatch_at')) {
    database.exec('ALTER TABLE gacha_daily ADD COLUMN last_hatch_at INTEGER')
  }

  const responseEventCols = database.prepare("PRAGMA table_info('response_events')").all() as Array<{ name: string }>
  if (responseEventCols.length > 0 && !responseEventCols.some((column) => column.name === 'tools_used')) {
    database.exec('ALTER TABLE response_events ADD COLUMN tools_used TEXT DEFAULT NULL')
  }
  if (responseEventCols.length > 0 && !responseEventCols.some((column) => column.name === 'failure_marker')) {
    database.exec('ALTER TABLE response_events ADD COLUMN failure_marker TEXT DEFAULT NULL')
  }
  if (responseEventCols.length > 0 && !responseEventCols.some((column) => column.name === 'model')) {
    database.exec('ALTER TABLE response_events ADD COLUMN model TEXT DEFAULT NULL')
  }
  if (responseEventCols.length > 0 && !responseEventCols.some((column) => column.name === 'hedged')) {
    database.exec('ALTER TABLE response_events ADD COLUMN hedged INTEGER NOT NULL DEFAULT 0')
  }

  const buddyIndexes = database.prepare("PRAGMA index_list('buddy')").all() as Array<{ name: string; unique: number }>
  const hasLegacyBuddyUserUnique = buddyIndexes.some((index) => {
    if (index.unique !== 1) return false
    const indexColumns = database.prepare(`PRAGMA index_info('${index.name.replaceAll("'", "''")}')`).all() as Array<{
      name: string
    }>
    return indexColumns.length === 1 && indexColumns[0].name === 'user_id'
  })
  if (hasLegacyBuddyUserUnique) {
    const buddyColumns = new Set(
      (database.prepare("PRAGMA table_info('buddy')").all() as Array<{ name: string }>).map((column) => column.name)
    )
    const copiedBuddyColumns = [
      'id',
      'user_id',
      'species',
      'rarity',
      'shiny',
      'eyes',
      'hat',
      'name',
      'personality',
      'stats_json',
      'hatched_at'
    ].filter((column) => buddyColumns.has(column))

    database.transaction(() => {
      database.exec(`
        CREATE TABLE buddy_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT '',
          species TEXT NOT NULL DEFAULT '',
          rarity TEXT NOT NULL DEFAULT '',
          shiny INTEGER NOT NULL DEFAULT 0,
          eyes TEXT NOT NULL DEFAULT '',
          hat TEXT NOT NULL DEFAULT '',
          name TEXT,
          personality TEXT,
          stats_json TEXT NOT NULL DEFAULT '{}',
          hatched_at INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO buddy_new (${copiedBuddyColumns.join(', ')})
          SELECT ${copiedBuddyColumns.join(', ')} FROM buddy;
        DROP TABLE buddy;
        ALTER TABLE buddy_new RENAME TO buddy;
        CREATE INDEX idx_buddy_user ON buddy (user_id, hatched_at);
      `)
    })()
    logger.info('Migrated buddy table to allow collection entries per user')
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_claim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      subject_user_id TEXT NOT NULL,
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
      last_recalled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_memory_claim_guild_subject_status
      ON memory_claim (guild_id, subject_user_id, status);

    CREATE INDEX IF NOT EXISTS idx_memory_claim_guild_status_last_seen
      ON memory_claim (guild_id, status, last_seen_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_claim_dedup
      ON memory_claim (guild_id, subject_user_id, predicate, value);

    CREATE TABLE IF NOT EXISTS memory_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      channel_id TEXT,
      source_kind TEXT NOT NULL,
      observed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_evidence_claim
      ON memory_evidence (claim_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_claim_fts
      USING fts5(value, predicate, content='memory_claim', content_rowid='id');

    DROP TRIGGER IF EXISTS memory_claim_fts_after_insert;
    DROP TRIGGER IF EXISTS memory_claim_fts_after_delete;
    DROP TRIGGER IF EXISTS memory_claim_fts_after_update;

    CREATE TRIGGER memory_claim_fts_after_insert
    AFTER INSERT ON memory_claim WHEN new.status = 'active' BEGIN
      INSERT INTO memory_claim_fts(rowid, value, predicate) VALUES (new.id, new.value, new.predicate);
    END;

    CREATE TRIGGER memory_claim_fts_after_delete
    AFTER DELETE ON memory_claim WHEN old.status = 'active' BEGIN
      INSERT INTO memory_claim_fts(memory_claim_fts, rowid, value, predicate)
      VALUES ('delete', old.id, old.value, old.predicate);
    END;

    CREATE TRIGGER memory_claim_fts_after_update
    AFTER UPDATE ON memory_claim WHEN old.status = 'active' OR new.status = 'active' BEGIN
      INSERT INTO memory_claim_fts(memory_claim_fts, rowid, value, predicate)
      SELECT 'delete', old.id, old.value, old.predicate WHERE old.status = 'active';
      INSERT INTO memory_claim_fts(rowid, value, predicate)
      SELECT new.id, new.value, new.predicate WHERE new.status = 'active';
    END;

    CREATE TABLE IF NOT EXISTS extraction_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      enqueued_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_episode_cursor (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      last_message_id TEXT,
      opened_at INTEGER,
      message_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_extraction_queue_guild_status_enqueued
      ON extraction_queue (guild_id, status, enqueued_at);

    CREATE TABLE IF NOT EXISTS memory_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      guild_id TEXT,
      channel_id TEXT,
      subject_user_id TEXT,
      duration_ms INTEGER,
      n_candidates INTEGER,
      n_selected INTEGER,
      n_changed INTEGER,
      tokens_est INTEGER,
      op TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_events_kind_created
      ON memory_events (kind, created_at);

    CREATE INDEX IF NOT EXISTS idx_memory_events_guild_created
      ON memory_events (guild_id, created_at);
  `)

  const extractionQueueCols = database.prepare("PRAGMA table_info('extraction_queue')").all() as Array<{ name: string }>
  const queueRows = database.prepare('SELECT * FROM extraction_queue ORDER BY id').all() as Array<{
    id: number
    guild_id: string
    channel_id: string
    payload: string
    status: string
    attempts: number
    enqueued_at: number
  }>
  const migratedQueueRows = queueRows.map((row) => {
    let payload: unknown
    try {
      payload = JSON.parse(row.payload)
    } catch {
      throw new Error(`Malformed extraction queue payload for job ${row.id}`)
    }

    if (Array.isArray(payload)) {
      payload = {
        messages: payload.map((message: unknown, index) => {
          if (
            typeof message !== 'object' ||
            message === null ||
            typeof (message as Record<string, unknown>).userId !== 'string' ||
            typeof (message as Record<string, unknown>).displayName !== 'string' ||
            typeof (message as Record<string, unknown>).content !== 'string'
          ) {
            throw new Error(`Malformed extraction queue payload for job ${row.id}`)
          }
          const legacyMessage = message as { userId: string; displayName: string; content: string }
          return {
            messageId: `legacy-${row.id}-${index}`,
            userId: legacyMessage.userId,
            displayName: legacyMessage.displayName,
            content: legacyMessage.content,
            timestamp: row.enqueued_at,
            isBot: false
          }
        }),
        context: [],
        startedAt: row.enqueued_at,
        endedAt: row.enqueued_at
      }
    } else if (
      typeof payload !== 'object' ||
      payload === null ||
      !Array.isArray((payload as Record<string, unknown>).messages) ||
      !Array.isArray((payload as Record<string, unknown>).context) ||
      typeof (payload as Record<string, unknown>).startedAt !== 'number' ||
      typeof (payload as Record<string, unknown>).endedAt !== 'number'
    ) {
      throw new Error(`Malformed extraction queue payload for job ${row.id}`)
    }

    return { ...row, payload: JSON.stringify(payload) }
  })
  const queueNeedsRebuild =
    extractionQueueCols.some((column) => column.name === 'admitted_by') ||
    migratedQueueRows.some((row, index) => row.payload !== queueRows[index].payload)

  if (queueNeedsRebuild) {
    database.transaction(() => {
      database.exec(`
        DROP INDEX IF EXISTS idx_extraction_queue_guild_status_enqueued;
        CREATE TABLE extraction_queue_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          enqueued_at INTEGER NOT NULL
        );
      `)
      const insert = database.prepare(
        'INSERT INTO extraction_queue_new (id, guild_id, channel_id, payload, status, attempts, enqueued_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      for (const row of migratedQueueRows) {
        insert.run(row.id, row.guild_id, row.channel_id, row.payload, row.status, row.attempts, row.enqueued_at)
      }
      database.exec('DROP TABLE extraction_queue; ALTER TABLE extraction_queue_new RENAME TO extraction_queue;')
    })()
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_extraction_queue_guild_status_enqueued
      ON extraction_queue (guild_id, status, enqueued_at);
  `)
}

/** Close the database connection. Safe to call multiple times. */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('SQLite database closed')
  }
}
