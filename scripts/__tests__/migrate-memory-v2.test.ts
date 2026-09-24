import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({
  config: { memory: { maxActiveClaimsPerUser: 20 } }
}))

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() }
}))

import { assertClaim, getActiveClaims } from '../../src/agent/memory/memoryClaims.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import { migrateMemoryV2 } from '../migrate-memory-v2.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

function seedLegacyRow(input: {
  guildId: string
  userId: string
  key: string
  value: string
  marker?: boolean
}): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_memory (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, fact_key)
    );
    CREATE TABLE IF NOT EXISTS memory_backfill_marker (name TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
  `)
  if (input.marker !== false) {
    db.prepare('INSERT OR IGNORE INTO memory_backfill_marker (name, completed_at) VALUES (?, ?)').run(
      'legacy_claims_v1',
      1
    )
  }
  db.prepare('INSERT INTO user_memory VALUES (?, ?, ?, ?, ?)').run(
    input.guildId,
    input.userId,
    input.key,
    input.value,
    1
  )
}

function tableExists(name: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function claimCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get() as { count: number }).count
}

describe('migrateMemoryV2', () => {
  it('preserves legacy rows and existing claims when backfill is incomplete', () => {
    seedLegacyRow({ guildId: 'guild-1', userId: 'u-1', key: 'likes', value: 'tea' })
    const existing = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'u-2',
      predicate: 'likes',
      value: 'gardening',
      sourceKind: 'explicit'
    })

    expect(() => migrateMemoryV2()).toThrow('legacy memory backfill is incomplete: 1 rows')
    expect(tableExists('user_memory')).toBe(true)
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM user_memory').get()).toEqual({ count: 1 })
    expect(claimCount()).toBe(1)
    expect(getActiveClaims('guild-1', 'u-2')).toEqual([expect.objectContaining({ id: existing.id, status: 'active' })])
  })

  it('reports claim summaries, drops a fully backfilled table, and is idempotent', () => {
    seedLegacyRow({ guildId: 'guild-1', userId: 'u-1', key: 'likes', value: 'tea' })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'u-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'legacy',
      observedAt: 1
    })

    const report = migrateMemoryV2()

    expect(report).toMatchObject({
      legacyRows: 1,
      unmatchedRows: 0,
      before: [expect.objectContaining({ guildId: 'guild-1', subjectUserId: 'u-1', value: 'tea', status: 'active' })],
      after: [expect.objectContaining({ guildId: 'guild-1', subjectUserId: 'u-1', value: 'tea', status: 'active' })]
    })
    expect(tableExists('user_memory')).toBe(false)
    expect(migrateMemoryV2()).toEqual({ legacyRows: 0, unmatchedRows: 0, before: [], after: [] })
    expect(claimCount()).toBe(1)
  })

  it('backfills legacy rows before validating and dropping them when no marker exists', () => {
    seedLegacyRow({ guildId: 'guild-1', userId: 'u-1', key: 'favorite anime', value: 'Frieren', marker: false })

    const report = migrateMemoryV2()

    expect(report.legacyRows).toBe(1)
    expect(report.unmatchedRows).toBe(0)
    expect(tableExists('user_memory')).toBe(false)
    expect(getActiveClaims('guild-1', 'u-1')).toEqual([
      expect.objectContaining({ predicate: 'favorite_anime', value: 'Frieren', sourceKind: 'legacy' })
    ])
  })
})
