import type Database from 'better-sqlite3'

const CREATE_MEMORY_CLAIM = `
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
    CHECK ((subject_kind = 'user' AND subject_user_id IS NOT NULL) OR
           (subject_kind = 'guild' AND subject_user_id IS NULL)),
    CHECK (subject_kind != 'guild' OR predicate NOT IN ('upcoming_event', 'plan') OR expires_at IS NOT NULL)
  )
`

function tableExists(database: Database.Database, name: string): boolean {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function columnsOf(database: Database.Database): Set<string> {
  return new Set(
    (database.prepare("PRAGMA table_info('memory_claim')").all() as Array<{ name: string }>).map(({ name }) => name)
  )
}

function needsSubjectMigration(database: Database.Database): boolean {
  const columns = database.prepare("PRAGMA table_info('memory_claim')").all() as Array<{
    name: string
    notnull: number
  }>
  const names = new Set(columns.map(({ name }) => name))
  return (
    !names.has('subject_kind') ||
    !names.has('expires_at') ||
    columns.find(({ name }) => name === 'subject_user_id')?.notnull === 1
  )
}

function migrateClaimTable(database: Database.Database): void {
  const columns = columnsOf(database)
  const expression = (name: string, fallback: string) => (columns.has(name) ? name : fallback)
  database.transaction(() => {
    database.exec(`
      DROP TRIGGER IF EXISTS memory_claim_fts_after_insert;
      DROP TRIGGER IF EXISTS memory_claim_fts_after_delete;
      DROP TRIGGER IF EXISTS memory_claim_fts_after_update;
      DROP TABLE IF EXISTS memory_claim_fts;
      DROP INDEX IF EXISTS idx_memory_claim_guild_subject_status;
      DROP INDEX IF EXISTS idx_memory_claim_guild_status_last_seen;
      DROP INDEX IF EXISTS idx_memory_claim_dedup;
      DROP INDEX IF EXISTS idx_memory_claim_user_dedup;
      DROP INDEX IF EXISTS idx_memory_claim_guild_dedup;
      ALTER TABLE memory_claim RENAME TO memory_claim_legacy;
      ${CREATE_MEMORY_CLAIM};
    `)
    database.exec(`
      INSERT INTO memory_claim (
        id, guild_id, subject_kind, subject_user_id, predicate, value, object_kind, object_user_id,
        source_kind, status, confidence, salience, pinned, needs_review, superseded_by,
        first_seen_at, last_seen_at, last_recalled_at, expires_at
      )
      SELECT
        ${expression('id', 'NULL')},
        ${expression('guild_id', "''")},
        ${expression('subject_kind', "'user'")},
        ${expression('subject_user_id', 'NULL')},
        ${expression('predicate', "'misc'")},
        ${expression('value', "''")},
        ${expression('object_kind', 'NULL')},
        ${expression('object_user_id', 'NULL')},
        ${expression('source_kind', "'legacy'")},
        ${expression('status', "'active'")},
        ${expression('confidence', '0.5')},
        ${expression('salience', '0.5')},
        ${expression('pinned', '0')},
        ${expression('needs_review', '0')},
        ${expression('superseded_by', 'NULL')},
        ${expression('first_seen_at', '0')},
        ${expression('last_seen_at', '0')},
        ${expression('last_recalled_at', 'NULL')},
        ${expression('expires_at', 'NULL')}
      FROM memory_claim_legacy;
      DROP TABLE memory_claim_legacy;
    `)
  })()
}

function createIndexes(database: Database.Database): void {
  database.exec(`
    DROP INDEX IF EXISTS idx_memory_claim_dedup;
    CREATE INDEX IF NOT EXISTS idx_memory_claim_guild_subject_status
      ON memory_claim (guild_id, subject_kind, subject_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_memory_claim_guild_status_last_seen
      ON memory_claim (guild_id, status, last_seen_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_claim_user_dedup
      ON memory_claim (guild_id, subject_user_id, predicate, value)
      WHERE subject_kind = 'user';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_claim_guild_dedup
      ON memory_claim (guild_id, predicate, value)
      WHERE subject_kind = 'guild';
  `)
}

function createEvidenceTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      channel_id TEXT,
      source_kind TEXT NOT NULL,
      observed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_evidence_claim ON memory_evidence (claim_id);
  `)
}

function migrateClaimLifecycle(database: Database.Database): void {
  const columns = columnsOf(database)
  const migratedAt = Date.now()
  database.transaction(() => {
    if (!columns.has('ended_at')) database.exec('ALTER TABLE memory_claim ADD COLUMN ended_at INTEGER')
    if (!columns.has('end_reason')) database.exec('ALTER TABLE memory_claim ADD COLUMN end_reason TEXT')
    if (!columns.has('event_date')) database.exec('ALTER TABLE memory_claim ADD COLUMN event_date TEXT')
    database
      .prepare("UPDATE memory_claim SET ended_at = ? WHERE status IN ('rejected', 'superseded') AND ended_at IS NULL")
      .run(migratedAt)
    database.exec(`
      UPDATE memory_claim
      SET last_seen_at = MAX(
        last_seen_at,
        COALESCE((SELECT MAX(observed_at) FROM memory_evidence WHERE claim_id = memory_claim.id), last_seen_at)
      )
      WHERE status = 'active';
    `)
  })()
}

function createFts(database: Database.Database, rebuild: boolean): void {
  database.exec(`
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
  `)
  if (rebuild) {
    database.exec(`
      INSERT INTO memory_claim_fts (rowid, value, predicate)
      SELECT id, value, predicate FROM memory_claim WHERE status = 'active';
    `)
  }
}

export function ensureMemoryClaimSchema(database: Database.Database): void {
  const exists = tableExists(database, 'memory_claim')
  let rebuildFts = !tableExists(database, 'memory_claim_fts')

  if (!exists) {
    database.exec(CREATE_MEMORY_CLAIM)
  } else if (needsSubjectMigration(database)) {
    migrateClaimTable(database)
    rebuildFts = true
  }

  createEvidenceTable(database)
  migrateClaimLifecycle(database)
  createIndexes(database)
  createFts(database, rebuildFts)
}
