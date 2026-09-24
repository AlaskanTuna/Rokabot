import { assertClaim, evictOverflowForAllSubjects } from '../src/agent/memory/memoryClaims.js'
import { normalizePredicate } from '../src/agent/memory/predicates.js'
import { getDb } from '../src/storage/database.js'
import { logger } from '../src/utils/logger.js'

type LegacyMemoryRow = {
  guild_id: string
  user_id: string
  fact_key: string
  fact_value: string
  updated_at: number
}

export type ClaimReviewRow = Readonly<{
  guildId: string
  subjectUserId: string
  claimId: number
  predicate: string
  value: string
  salience: number
  status: string
}>

export type MigrationReport = Readonly<{
  legacyRows: number
  unmatchedRows: number
  before: ClaimReviewRow[]
  after: ClaimReviewRow[]
}>

const BACKFILL_MARKER = 'legacy_claims_v1'

function tableExists(table: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function hasBackfillMarker(): boolean {
  return (
    tableExists('memory_backfill_marker') &&
    Boolean(getDb().prepare('SELECT 1 FROM memory_backfill_marker WHERE name = ?').get(BACKFILL_MARKER))
  )
}

function attestedScopes(userId: string): string[] {
  const rows = getDb()
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

function isUnsafeClaimError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Claim value is unsafe'
}

function backfillLegacyRows(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_backfill_marker (
      name TEXT PRIMARY KEY,
      completed_at INTEGER NOT NULL
    );
  `)

  db.transaction(() => {
    if (hasBackfillMarker()) return

    const rows = db
      .prepare('SELECT guild_id, user_id, fact_key, fact_value, updated_at FROM user_memory')
      .all() as LegacyMemoryRow[]
    let skippedWithoutScope = 0
    let skippedUnsafeValues = 0

    for (const row of rows) {
      const scopes = row.guild_id === 'global' ? attestedScopes(row.user_id) : [row.guild_id]
      if (scopes.length === 0) {
        skippedWithoutScope++
        continue
      }

      const needsReview = row.guild_id === 'global' && scopes.length !== 1
      try {
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
      } catch (error) {
        if (!isUnsafeClaimError(error)) throw error
        skippedUnsafeValues++
        logger.warn({ factKey: row.fact_key }, 'Legacy memory fact skipped because claim value is unsafe')
      }
    }

    db.prepare('INSERT INTO memory_backfill_marker (name, completed_at) VALUES (?, ?)').run(BACKFILL_MARKER, Date.now())
    if (skippedWithoutScope > 0) {
      logger.warn({ skippedWithoutScope }, 'Legacy memory facts skipped because no legal scope could be inferred')
    }
    if (skippedUnsafeValues > 0) {
      logger.warn({ skippedUnsafeValues }, 'Legacy memory facts skipped because claim values are unsafe')
    }
  })()
}

function legalScopes(row: LegacyMemoryRow): string[] {
  if (row.guild_id !== 'global') return row.guild_id ? [row.guild_id] : []
  return attestedScopes(row.user_id)
}

function findUnbackfilledRows(): LegacyMemoryRow[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT guild_id, user_id, fact_key, fact_value, updated_at FROM user_memory')
    .all() as LegacyMemoryRow[]
  const hasClaim = db.prepare(
    'SELECT 1 FROM memory_claim WHERE guild_id = ? AND subject_user_id = ? AND predicate = ? AND value = ? LIMIT 1'
  )

  return rows.filter((row) => {
    const scopes = legalScopes(row)
    return (
      scopes.length === 0 ||
      scopes.some(
        (guildId) =>
          guildId === 'global' || !hasClaim.get(guildId, row.user_id, normalizePredicate(row.fact_key), row.fact_value)
      )
    )
  })
}

function topTenActiveClaimsBySubject(): ClaimReviewRow[] {
  return getDb()
    .prepare(
      `WITH ranked_claims AS (
        SELECT guild_id, subject_user_id, id, predicate, value, salience, status,
          ROW_NUMBER() OVER (
            PARTITION BY guild_id, subject_user_id
            ORDER BY salience DESC, last_seen_at DESC, id ASC
          ) AS position
        FROM memory_claim
        WHERE status = 'active'
      )
      SELECT guild_id AS guildId, subject_user_id AS subjectUserId, id AS claimId,
        predicate, value, salience, status
      FROM ranked_claims
      WHERE position <= 10
      ORDER BY guildId, subjectUserId, position`
    )
    .all() as ClaimReviewRow[]
}

export function migrateMemoryV2(): MigrationReport {
  const db = getDb()
  if (!tableExists('user_memory')) return { legacyRows: 0, unmatchedRows: 0, before: [], after: [] }
  if (!hasBackfillMarker()) backfillLegacyRows()

  const unmatchedRows = findUnbackfilledRows()
  if (unmatchedRows.length > 0) {
    throw new Error(`legacy memory backfill is incomplete: ${unmatchedRows.length} rows`)
  }

  const before = topTenActiveClaimsBySubject()
  evictOverflowForAllSubjects()
  const after = topTenActiveClaimsBySubject()
  const legacyRows = (db.prepare('SELECT COUNT(*) AS count FROM user_memory').get() as { count: number }).count
  db.exec('DROP TABLE user_memory')
  return { legacyRows, unmatchedRows: 0, before, after }
}

async function main(): Promise<void> {
  const report = migrateMemoryV2()
  logger.info({ report }, 'Completed explicit memory v2 migration')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    logger.error({ error }, 'Memory v2 migration failed')
    process.exitCode = 1
  })
}
