import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'
import { getMemoryItemDriftCounts } from './memoryItemBackfill.js'

export type MemoryItemDriftCounts = Readonly<{ fact: number; episode: number; media: number }>

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function countItemNativeIntegrityIssues(database: Database.Database): MemoryItemDriftCounts {
  const counts: { fact: number; episode: number; media: number } = { fact: 0, episode: 0, media: 0 }
  counts.fact += (
    database
      .prepare(`
        SELECT COUNT(*) AS count FROM memory_item item
        WHERE item.kind = 'fact' AND item.superseded_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM memory_item target WHERE target.id = item.superseded_by AND target.kind = 'fact')
      `)
      .get() as { count: number }
  ).count
  counts.episode += (
    database
      .prepare(`
        SELECT COUNT(*) AS count FROM memory_item item
        WHERE item.kind = 'episode' AND (
          SELECT COUNT(*) FROM memory_item_occurrence occurrence
          WHERE occurrence.item_id = item.id AND occurrence.origin = 'episode'
        ) != 1
      `)
      .get() as { count: number }
  ).count
  counts.media += (
    database
      .prepare(`
        SELECT COUNT(*) AS count FROM memory_item item
        WHERE item.kind = 'media' AND NOT EXISTS (
          SELECT 1 FROM memory_item_payload payload WHERE payload.item_id = item.id
        )
      `)
      .get() as { count: number }
  ).count
  counts.fact += (
    database
      .prepare(`
        SELECT COUNT(*) AS count FROM memory_item_evidence evidence
        LEFT JOIN memory_item item ON item.id = evidence.item_id
        WHERE item.id IS NULL OR item.kind != 'fact'
      `)
      .get() as { count: number }
  ).count
  const occurrenceIssues = database
    .prepare(`
      SELECT occurrence.origin, COUNT(*) AS count FROM memory_item_occurrence occurrence
      LEFT JOIN memory_item item ON item.id = occurrence.item_id
      WHERE item.id IS NULL OR
        (occurrence.origin = 'episode' AND item.kind != 'episode') OR
        (occurrence.origin != 'episode' AND item.kind != 'media')
      GROUP BY occurrence.origin
    `)
    .all() as Array<{ origin: string; count: number }>
  for (const issue of occurrenceIssues) {
    if (issue.origin === 'episode') counts.episode += issue.count
    else counts.media += issue.count
  }
  const embeddingIssues = database
    .prepare(`
      SELECT item.kind, embedding.text_hash,
             CASE WHEN item.kind = 'fact' THEN item.legacy_embedding_text ELSE item.content END AS text
      FROM memory_item_embedding embedding
      LEFT JOIN memory_item item ON item.id = embedding.item_id
    `)
    .all() as Array<{ kind: string | null; text_hash: string | null; text: string | null }>
  for (const embedding of embeddingIssues) {
    if (!embedding.kind || !['fact', 'episode', 'media'].includes(embedding.kind)) {
      counts.fact += 1
    } else if (embedding.text !== null && embedding.text_hash !== sha256(embedding.text)) {
      counts[embedding.kind as keyof MemoryItemDriftCounts] += 1
    }
  }
  return counts
}

export function getMemoryItemNativeIntegrityCounts(database: Database.Database = getDb()): MemoryItemDriftCounts {
  return countItemNativeIntegrityIssues(database)
}

/** Record a value-free projection health sample and warn when any kind has drift. */
export function sweepMemoryItemIntegrity(database: Database.Database = getDb()): MemoryItemDriftCounts {
  const counts = database.transaction(() => {
    const drift =
      config.memory.store === 'item' ? countItemNativeIntegrityIssues(database) : getMemoryItemDriftCounts(database)
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
