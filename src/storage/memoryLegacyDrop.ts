import { existsSync, realpathSync } from 'node:fs'
import type Database from 'better-sqlite3'
import DatabaseCtor from 'better-sqlite3'

export const MEMORY_LEGACY_DROP_MARKER = 'memory_legacy_drop'

/** Every legacy table the Phase 7 drop removes. The FTS5 shadow tables of `memory_claim_fts` are found by prefix. */
export const LEGACY_MEMORY_TABLES = [
  'memory_claim',
  'memory_evidence',
  'memory_claim_fts',
  'memory_episode',
  'media_digest',
  'media_occurrence'
] as const

/** A value-free refusal: the drop, or a legacy-only step on a dropped schema, did not run and wrote nothing. */
export class LegacyMemoryDropRefusal extends Error {}

export type LegacyMemoryDropReport = Readonly<{
  dropped_tables: string[]
  row_counts: Record<string, number>
  marker: typeof MEMORY_LEGACY_DROP_MARKER
  dropped_at: number
}>

export function tableExists(database: Database.Database, name: string): boolean {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

/** True once the explicit Phase 7 drop has run: startup must not recreate the legacy tables. */
export function isLegacyMemoryDropped(database: Database.Database): boolean {
  if (!tableExists(database, MEMORY_LEGACY_DROP_MARKER)) return false
  return database.prepare(`SELECT 1 AS found FROM ${MEMORY_LEGACY_DROP_MARKER} LIMIT 1`).get() !== undefined
}

/**
 * Under a dropped legacy schema only `item` is accepted. Legacy and dual reads would hit tables
 * that no longer exist, so startup and the migration script refuse instead of running half-blind.
 */
export function assertStoreAllowedForDroppedSchema(database: Database.Database, store: string): void {
  if (isLegacyMemoryDropped(database) && store !== 'item') {
    throw new LegacyMemoryDropRefusal(
      `memory.store must be item once the legacy memory tables are dropped, got: ${store}`
    )
  }
}

function projectionTriggerCount(database: Database.Database): number {
  return (
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'memory_item_projection_%'"
      )
      .get() as { count: number }
  ).count
}

function backupLegacyTables(backupPath: string): string[] {
  let backup: Database.Database
  try {
    backup = new DatabaseCtor(backupPath, { readonly: true, fileMustExist: true })
  } catch {
    throw new LegacyMemoryDropRefusal(`Memory item legacy drop requires a readable SQLite backup at ${backupPath}`)
  }
  try {
    return LEGACY_MEMORY_TABLES.filter((table) => tableExists(backup, table))
  } catch {
    throw new LegacyMemoryDropRefusal(`Memory item legacy drop requires a readable SQLite backup at ${backupPath}`)
  } finally {
    backup.close()
  }
}

/**
 * Explicit, offline Phase 7 step. Refuses unless the store is `item`, no projection trigger
 * remains, and the `--backup` path exists and opens as SQLite holding the legacy tables. Then, in
 * one transaction, it drops the six legacy tables (plus FTS shadow tables), records the drop in
 * `memory_legacy_drop`, and reports per-table row counts. Startup never calls this.
 */
export function dropLegacyMemoryTables(
  database: Database.Database,
  options: { store: string; backupPath: string | undefined }
): LegacyMemoryDropReport {
  if (options.store !== 'item') {
    throw new LegacyMemoryDropRefusal(`Memory item legacy drop requires memory.store item, got: ${options.store}`)
  }
  if (projectionTriggerCount(database) !== 0) {
    throw new LegacyMemoryDropRefusal('Memory item legacy drop requires projection triggers to be dropped')
  }
  if (options.backupPath === undefined || !existsSync(options.backupPath)) {
    throw new LegacyMemoryDropRefusal('Memory item legacy drop requires --backup <path> to an existing database backup')
  }
  if (existsSync(database.name) && realpathSync(options.backupPath) === realpathSync(database.name)) {
    throw new LegacyMemoryDropRefusal('Memory item legacy drop backup must be a separate file from the live database')
  }
  const present = backupLegacyTables(options.backupPath)
  const missing = LEGACY_MEMORY_TABLES.filter((table) => !present.includes(table))
  if (missing.length > 0) {
    throw new LegacyMemoryDropRefusal(`Memory item legacy drop backup is missing legacy tables: ${missing.join(', ')}`)
  }
  if (isLegacyMemoryDropped(database)) {
    throw new LegacyMemoryDropRefusal('Memory item legacy tables were already dropped')
  }
  const absent = LEGACY_MEMORY_TABLES.filter((table) => !tableExists(database, table))
  if (absent.length > 0) {
    throw new LegacyMemoryDropRefusal(`Memory item legacy tables are not present: ${absent.join(', ')}`)
  }

  return database.transaction(() => {
    const rowCounts: Record<string, number> = {}
    for (const table of LEGACY_MEMORY_TABLES) {
      rowCounts[table] = (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
    }
    const ftsShadows = (
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'memory_claim_fts\\_%' ESCAPE '\\'")
        .all() as Array<{ name: string }>
    ).map(({ name }) => name)

    for (const table of LEGACY_MEMORY_TABLES) database.exec(`DROP TABLE IF EXISTS ${table}`)
    for (const shadow of ftsShadows) database.exec(`DROP TABLE IF EXISTS "${shadow.replaceAll('"', '""')}"`)

    const droppedAt = Date.now()
    database.exec(`
      CREATE TABLE IF NOT EXISTS ${MEMORY_LEGACY_DROP_MARKER} (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        dropped_at INTEGER NOT NULL,
        detail TEXT NOT NULL
      )
    `)
    database
      .prepare(`INSERT INTO ${MEMORY_LEGACY_DROP_MARKER} (id, dropped_at, detail) VALUES (1, ?, ?)`)
      .run(droppedAt, JSON.stringify({ row_counts: rowCounts }))
    const report: LegacyMemoryDropReport = {
      dropped_tables: [...LEGACY_MEMORY_TABLES],
      row_counts: rowCounts,
      marker: MEMORY_LEGACY_DROP_MARKER,
      dropped_at: droppedAt
    }
    return report
  })()
}
