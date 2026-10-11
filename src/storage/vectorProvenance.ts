import type Database from 'better-sqlite3'

export const UNKNOWN_FINGERPRINT = 'unknown'

export type VectorTable = 'memory_episode' | 'media_digest' | 'memory_claim'

const PROVENANCE_COLUMNS = [
  ['embedding_model_id', 'TEXT'],
  ['embedding_dim', 'INTEGER'],
  ['embedding_fingerprint', 'TEXT']
] as const

/**
 * A vector with no recorded provenance predates these columns, so it is marked unknown rather than guessed; its
 * dimension is still knowable from its bytes. Idempotent, and a no-op for a table that does not exist yet.
 */
export function ensureVectorProvenanceColumns(database: Database.Database, table: VectorTable): void {
  const columns = new Set(
    (database.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)
  )
  if (!columns.has('embedding')) return
  database.transaction(() => {
    for (const [name, type] of PROVENANCE_COLUMNS) {
      if (!columns.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
    database
      .prepare(
        `UPDATE ${table} SET embedding_dim = length(embedding) / 4, embedding_fingerprint = ?
         WHERE embedding IS NOT NULL AND embedding_fingerprint IS NULL`
      )
      .run(UNKNOWN_FINGERPRINT)
  })()
}
