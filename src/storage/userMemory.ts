/** Per-user relationship memory — persistent fact storage scoped by guild */

import { MAX_FACT_KEY_LEN, MAX_FACT_VALUE_LEN, isSafeFactScalar } from '../agent/promptSafety.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

const MAX_FACTS_PER_USER = config.memory.maxFactsPerUser

/** Upsert a fact about a user within a guild. Evicts oldest fact if at capacity. */
export function saveFact(guildId: string, userId: string, key: string, value: string): boolean {
  if (!isSafeFactScalar(key, MAX_FACT_KEY_LEN) || !isSafeFactScalar(value, MAX_FACT_VALUE_LEN)) {
    logger.debug({ guildId, userId, reason: 'unsafe_fact_scalar' }, 'Rejected unsafe user memory fact')
    return false
  }

  const db = getDb()

  const existing = db
    .prepare('SELECT 1 FROM user_memory WHERE guild_id = ? AND user_id = ? AND fact_key = ?')
    .get(guildId, userId, key) as { 1: number } | undefined

  if (!existing) {
    const count = db
      .prepare('SELECT COUNT(*) AS cnt FROM user_memory WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as { cnt: number }

    if (count.cnt >= MAX_FACTS_PER_USER) {
      db.prepare(
        `DELETE FROM user_memory WHERE guild_id = ? AND user_id = ? AND fact_key = (
          SELECT fact_key FROM user_memory WHERE guild_id = ? AND user_id = ? ORDER BY updated_at ASC LIMIT 1
        )`
      ).run(guildId, userId, guildId, userId)
    }
  }

  db.prepare(
    'INSERT OR REPLACE INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(guildId, userId, key, value, Date.now())

  return true
}

/** Get all stored facts for a user in a guild (falls back to 'global' for pre-migration facts) */
export function getFacts(guildId: string, userId: string): Array<{ key: string; value: string }> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT fact_key, fact_value FROM user_memory
       WHERE guild_id IN (?, 'global') AND user_id = ?
       ORDER BY updated_at DESC`
    )
    .all(guildId, userId) as Array<{ fact_key: string; fact_value: string }>

  return rows.map((row) => ({ key: row.fact_key, value: row.fact_value }))
}

/** Delete a specific fact for a user in a guild */
export function deleteFact(guildId: string, userId: string, key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM user_memory WHERE guild_id = ? AND user_id = ? AND fact_key = ?').run(guildId, userId, key)
}

/** Format all facts for a user in a guild as a prompt-ready string */
export function getAllFactsForPrompt(guildId: string, userId: string): string {
  const facts = getFacts(guildId, userId)
  if (facts.length === 0) return ''
  return facts.map((f) => `${f.key}: ${f.value}`).join(', ')
}

/** Count the number of stored facts for a user in a guild */
export function countFacts(guildId: string, userId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM user_memory WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { cnt: number }
  return row.cnt
}

/** Touch updated_at for all facts of a user in a guild and global (refresh-on-access) */
export function refreshFactTimestamps(guildId: string, userId: string): void {
  const db = getDb()
  db.prepare("UPDATE user_memory SET updated_at = ? WHERE guild_id IN (?, 'global') AND user_id = ?").run(
    Date.now(),
    guildId,
    userId
  )
}

/** Delete facts older than the specified number of days (all guilds) */
export function pruneOldFacts(maxAgeDays: number = 90): number {
  const db = getDb()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const result = db.prepare('DELETE FROM user_memory WHERE updated_at < ?').run(cutoff)
  if (result.changes > 0) {
    logger.info({ pruned: result.changes, maxAgeDays }, 'Pruned stale user memory facts')
  }
  return result.changes
}
