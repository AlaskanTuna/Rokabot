import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'
import { getMemoryItemDriftCounts } from './memoryItemBackfill.js'

export type MemoryItemDriftCounts = Readonly<{ fact: number; episode: number; media: number }>

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Record a value-free projection health sample and warn when any kind has drift. */
export function sweepMemoryItemIntegrity(database: Database.Database = getDb()): MemoryItemDriftCounts {
  const counts = database.transaction(() => {
    const drift = getMemoryItemDriftCounts(database)
    database
      .prepare(`
        INSERT INTO memory_events (kind, created_at, detail)
        VALUES ('item_integrity', ?, ?)
      `)
      .run(Date.now(), JSON.stringify(drift))
    return drift
  })()

  if (counts.fact + counts.episode + counts.media > 0) {
    logger.warn({ drift: counts }, 'Memory item projection has drift')
  }
  return counts
}

/** Fill hashes omitted by projection triggers from the text already stored on each item. */
export function fillMemoryItemEmbeddingHashes(database: Database.Database = getDb()): number {
  return database.transaction(() => {
    const rows = database
      .prepare(`
        SELECT embedding.item_id, embedding.fingerprint,
               CASE WHEN item.kind = 'fact' THEN item.legacy_embedding_text ELSE item.content END AS text
        FROM memory_item_embedding AS embedding
        JOIN memory_item AS item ON item.id = embedding.item_id
        WHERE embedding.text_hash IS NULL
      `)
      .all() as Array<{ item_id: number; fingerprint: string; text: string | null }>
    const update = database.prepare(`
      UPDATE memory_item_embedding
      SET text_hash = ?
      WHERE item_id = ? AND fingerprint = ? AND text_hash IS NULL
    `)
    let updated = 0
    for (const row of rows) {
      if (row.text === null) continue
      updated += update.run(sha256(row.text), row.item_id, row.fingerprint).changes
    }
    return updated
  })()
}
