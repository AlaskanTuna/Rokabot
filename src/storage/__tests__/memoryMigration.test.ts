import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: { maxActiveClaimsPerUser: 20 }
  }
}))

import { getActiveClaims } from '../../agent/memory/memoryClaims.js'
import { closeDb, getDb } from '../database.js'
import { backfillLegacyClaims } from '../memoryMigration.js'

const NOW = 1_000_000

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

function addLegacyFact(userId: string, key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('global', userId, key, value, NOW - 1)
}

function attest(userId: string, guildId: string): void {
  getDb()
    .prepare(
      `INSERT INTO response_events (
        guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
        retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
      ) VALUES (?, 'channel-1', ?, 'mention', 'playful', 'success', 'reply', 1, 1, 1, 0, 0, 1, 1, ?)`
    )
    .run(guildId, userId, NOW)
}

describe('backfillLegacyClaims', () => {
  it('reassigns a uniquely attested legacy fact and is idempotent', () => {
    addLegacyFact('user-1', 'Favorite Anime', 'Frieren')
    attest('user-1', 'guild-1')

    backfillLegacyClaims()
    backfillLegacyClaims()

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({
        predicate: 'favorite_anime',
        value: 'Frieren',
        sourceKind: 'legacy',
        needsReview: false,
        salience: 0.25
      })
    ])
    expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get()).toEqual({ count: 1 })
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM memory_claim WHERE guild_id = 'global'").get()).toEqual({
      count: 0
    })
  })

  it('keeps a multiply attested legacy fact flagged inside only its attested scopes', () => {
    addLegacyFact('user-1', 'likes', 'tea')
    attest('user-1', 'guild-1')
    attest('user-1', 'guild-2')

    backfillLegacyClaims()

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({ sourceKind: 'legacy', needsReview: true, salience: 0.25 })
    ])
    expect(getActiveClaims('guild-2', 'user-1')).toEqual([
      expect.objectContaining({ sourceKind: 'legacy', needsReview: true, salience: 0.25 })
    ])
    expect(getActiveClaims('guild-3', 'user-1')).toEqual([])
  })

  it('imports an existing non-global row directly into its own scope', () => {
    getDb()
      .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('dm:channel-1', 'user-1', 'hobby', 'painting', NOW - 1)

    backfillLegacyClaims()

    expect(getActiveClaims('dm:channel-1', 'user-1')).toEqual([
      expect.objectContaining({ value: 'painting', sourceKind: 'legacy', needsReview: false })
    ])
  })
})
