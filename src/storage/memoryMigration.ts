import { assertClaim } from '../agent/memory/memoryClaims.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

type LegacyMemoryRow = {
  guild_id: string
  user_id: string
  fact_key: string
  fact_value: string
  updated_at: number
}

const BACKFILL_MARKER = 'legacy_claims_v1'

function attestedScopes(userId: string): string[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT guild_id AS scope FROM user_memory WHERE user_id = ? AND guild_id != 'global'
       UNION
       SELECT CASE WHEN guild_id = 'global' THEN 'dm:' || channel_id ELSE guild_id END AS scope
       FROM response_events
       WHERE user_id = ?`
    )
    .all(userId, userId) as Array<{ scope: string }>

  return rows.map(({ scope }) => scope).filter((scope) => scope !== 'global')
}

/** Migrate legacy facts to claims once without retaining a runtime global tenant. */
export function backfillLegacyClaims(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_backfill_marker (
      name TEXT PRIMARY KEY,
      completed_at INTEGER NOT NULL
    );
  `)

  const backfill = db.transaction(() => {
    const complete = db.prepare('SELECT 1 FROM memory_backfill_marker WHERE name = ?').get(BACKFILL_MARKER)
    if (complete) return

    const rows = db
      .prepare('SELECT guild_id, user_id, fact_key, fact_value, updated_at FROM user_memory')
      .all() as LegacyMemoryRow[]
    let skippedWithoutScope = 0

    for (const row of rows) {
      const scopes = row.guild_id === 'global' ? attestedScopes(row.user_id) : [row.guild_id]
      if (scopes.length === 0) {
        skippedWithoutScope++
        continue
      }

      const needsReview = row.guild_id === 'global' && scopes.length !== 1
      for (const guildId of scopes) {
        assertClaim(
          {
            guildId,
            subjectUserId: row.user_id,
            predicate: row.fact_key,
            value: row.fact_value,
            sourceKind: 'legacy',
            observedAt: row.updated_at,
            needsReview
          },
          { transaction: true }
        )
      }
    }

    db.prepare('INSERT INTO memory_backfill_marker (name, completed_at) VALUES (?, ?)').run(BACKFILL_MARKER, Date.now())
    if (skippedWithoutScope > 0) {
      logger.warn({ skippedWithoutScope }, 'Legacy memory facts skipped because no legal scope could be inferred')
    }
  })

  backfill()
}
