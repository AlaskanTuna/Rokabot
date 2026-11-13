import type Database from 'better-sqlite3'

function tableExists(database: Database.Database, name: string): boolean {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

export function ensureMemoryItemSchema(database: Database.Database): void {
  const rebuildFts = !tableExists(database, 'memory_item_fts')

  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('fact', 'episode', 'media')),
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('user', 'guild')),
      subject_user_id TEXT,
      predicate TEXT,
      content TEXT NOT NULL,
      label TEXT,
      media_kind TEXT CHECK (media_kind IN ('audio', 'video')),
      content_key TEXT,
      source_job_id INTEGER,
      period TEXT NOT NULL DEFAULT 'current' CHECK (period IN ('current', 'past')),
      object_kind TEXT,
      object_user_id TEXT,
      source_kind TEXT,
      status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'superseded', 'rejected')),
      needs_review INTEGER NOT NULL DEFAULT 0,
      end_reason TEXT,
      ended_at INTEGER,
      superseded_by INTEGER,
      confidence REAL,
      salience REAL,
      pinned INTEGER NOT NULL DEFAULT 0,
      valid_until INTEGER,
      event_date TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_recalled_at INTEGER,
      created_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      legacy_table TEXT,
      legacy_id INTEGER,
      legacy_embedding_text TEXT,
      UNIQUE (legacy_table, legacy_id),
      CHECK ((subject_kind = 'user') = (subject_user_id IS NOT NULL)),
      CHECK (kind = 'fact' OR (subject_kind = 'guild' AND period = 'current' AND pinned = 0 AND needs_review = 0)),
      CHECK (kind != 'fact' OR (predicate IS NOT NULL AND source_kind IS NOT NULL)),
      CHECK (kind != 'media' OR (content_key IS NOT NULL AND label IS NOT NULL AND media_kind IS NOT NULL)),
      CHECK (kind != 'episode' OR source_job_id IS NOT NULL),
      CHECK (kind != 'fact' OR subject_kind != 'guild' OR predicate NOT IN ('upcoming_event', 'plan')
             OR valid_until IS NOT NULL)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_user_fact
      ON memory_item (guild_id, subject_user_id, predicate, content, period)
      WHERE kind = 'fact' AND subject_kind = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_guild_fact
      ON memory_item (guild_id, predicate, content, period)
      WHERE kind = 'fact' AND subject_kind = 'guild';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_episode ON memory_item (source_job_id) WHERE kind = 'episode';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_media ON memory_item (guild_id, content_key) WHERE kind = 'media';
    CREATE INDEX IF NOT EXISTS idx_memory_item_scope
      ON memory_item (guild_id, kind, status, subject_kind, subject_user_id);

    CREATE TABLE IF NOT EXISTS memory_item_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      channel_id TEXT,
      source_kind TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      effective_at INTEGER,
      job_id INTEGER,
      source_message_id TEXT,
      speaker_user_id TEXT,
      legacy_id INTEGER UNIQUE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_evidence_job
      ON memory_item_evidence (item_id, job_id) WHERE job_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS memory_item_occurrence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('upload', 'reply', 'forward', 'link', 'episode')),
      message_id TEXT,
      shared_by_user_id TEXT,
      source_author_id TEXT,
      span_start INTEGER,
      observed_at INTEGER NOT NULL,
      legacy_id INTEGER UNIQUE,
      CHECK ((origin = 'episode') = (message_id IS NULL AND shared_by_user_id IS NULL)),
      CHECK (origin != 'episode' OR span_start IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_occurrence_message
      ON memory_item_occurrence (item_id, message_id) WHERE message_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_item_occurrence_episode
      ON memory_item_occurrence (item_id) WHERE origin = 'episode';

    CREATE TABLE IF NOT EXISTS memory_item_payload (
      item_id INTEGER PRIMARY KEY,
      digest_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_item_embedding (
      item_id INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      model_id TEXT,
      dim INTEGER NOT NULL,
      renderer TEXT NOT NULL CHECK (renderer IN ('fact_sentence', 'summary')),
      renderer_version INTEGER NOT NULL,
      text_hash TEXT,
      vector BLOB NOT NULL,
      created_at INTEGER,
      PRIMARY KEY (item_id, fingerprint)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_item_fts
      USING fts5(content, predicate, content='memory_item', content_rowid='id');
    DROP TRIGGER IF EXISTS memory_item_fts_after_insert;
    DROP TRIGGER IF EXISTS memory_item_fts_after_delete;
    DROP TRIGGER IF EXISTS memory_item_fts_after_update;
    CREATE TRIGGER memory_item_fts_after_insert
    AFTER INSERT ON memory_item WHEN new.status = 'active' AND new.kind = 'fact' BEGIN
      INSERT INTO memory_item_fts(rowid, content, predicate) VALUES (new.id, new.content, new.predicate);
    END;
    CREATE TRIGGER memory_item_fts_after_delete
    AFTER DELETE ON memory_item WHEN old.status = 'active' AND old.kind = 'fact' BEGIN
      INSERT INTO memory_item_fts(memory_item_fts, rowid, content, predicate)
      VALUES ('delete', old.id, old.content, old.predicate);
    END;
    CREATE TRIGGER memory_item_fts_after_update
    AFTER UPDATE ON memory_item WHEN
      (old.status = 'active' AND old.kind = 'fact') OR (new.status = 'active' AND new.kind = 'fact') BEGIN
      INSERT INTO memory_item_fts(memory_item_fts, rowid, content, predicate)
      SELECT 'delete', old.id, old.content, old.predicate WHERE old.status = 'active' AND old.kind = 'fact';
      INSERT INTO memory_item_fts(rowid, content, predicate)
      SELECT new.id, new.content, new.predicate WHERE new.status = 'active' AND new.kind = 'fact';
    END;
  `)

  if (rebuildFts) {
    database.exec(`
      INSERT INTO memory_item_fts (rowid, content, predicate)
      SELECT id, content, predicate FROM memory_item WHERE status = 'active' AND kind = 'fact';
    `)
  }
}
