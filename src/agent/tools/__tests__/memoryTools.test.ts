import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../../../storage/database.js'
import { getFacts, saveFact } from '../../../storage/userMemory.js'
import { findUserByName, upsertUserName } from '../../../storage/userNames.js'
import { assertClaim, getActiveClaims } from '../../memory/memoryClaims.js'
import { recallUserTool } from '../index.js'
import { recallUser } from '../recallUser.js'
import { rememberUser } from '../rememberUser.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('memory tools', () => {
  it('merges and deduplicates active claims with legacy facts when recalling a guild member', () => {
    saveFact('guild-1', 'user-1', 'favorite_anime', 'Frieren')
    saveFact('guild-1', 'user-1', 'hobby', 'tea ceremonies')
    const claim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'favorite_anime',
      value: 'frieren',
      sourceKind: 'passive'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'manga',
      sourceKind: 'passive'
    })

    const result = recallUser({ guild_id: 'guild-1', user_id: 'user-1' })

    expect(result.factCount).toBe(3)
    expect(result.facts).toContain('favorite_anime: frieren')
    expect(result.facts).toContain('likes: manga')
    expect(result.facts).toContain('hobby: tea ceremonies')
    expect(getDb().prepare('SELECT last_recalled_at FROM memory_claim WHERE id = ?').get(claim.id)).toEqual({
      last_recalled_at: expect.any(Number)
    })
  })

  it('recalls freshest claims first and caps the merged list at 15 with legacy facts at the tail', () => {
    const now = Date.now()
    for (let index = 0; index < 16; index++) {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'likes',
        value: `thing-${index}`,
        sourceKind: 'passive',
        observedAt: now - (16 - index) * 60_000
      })
    }
    saveFact('guild-1', 'user-1', 'ancient_fact', 'from the archive')

    const result = recallUser({ guild_id: 'guild-1', user_id: 'user-1' })

    expect(result.factCount).toBe(15)
    expect(result.facts.startsWith('likes: thing-15')).toBe(true)
    expect(result.facts).not.toContain('ancient_fact')

    const recalled = getDb()
      .prepare("SELECT value FROM memory_claim WHERE last_recalled_at IS NOT NULL AND subject_user_id = 'user-1'")
      .all() as Array<{ value: string }>
    expect(recalled).toHaveLength(15)
    expect(recalled.map(({ value }) => value)).not.toContain('thing-0')
  })

  it('finds a known user by trimmed, case-insensitive display name before username', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    upsertUserName('user-2', 'ALICE', 'Mio')

    expect(findUserByName('  aLiCe  ')).toEqual({ userId: 'user-1', username: 'alice', displayName: 'Alice' })
    expect(findUserByName('mio')).toEqual({ userId: 'user-2', username: 'ALICE', displayName: 'Mio' })
  })

  it('recalls a resolved user_name through the FunctionTool', async () => {
    upsertUserName('user-2', 'mio', 'Mio')
    saveFact('guild-1', 'user-2', 'favorite_anime', 'Frieren')

    await expect(
      recallUserTool.runAsync({
        args: { user_name: 'mIo' },
        toolContext: {
          state: new Map([
            ['_userId', 'speaker'],
            ['_guildId', 'guild-1']
          ])
        }
      })
    ).resolves.toEqual({ facts: 'favorite_anime: Frieren', factCount: 1 })
  })

  it('returns the graceful result when user_name is unknown', async () => {
    await expect(
      recallUserTool.runAsync({
        args: { user_name: 'nobody' },
        toolContext: {
          state: new Map([
            ['_userId', 'speaker'],
            ['_guildId', 'guild-1']
          ])
        }
      })
    ).resolves.toEqual({ facts: "I don't know anyone by that name here yet.", factCount: 0 })
  })

  it('writes remember_user facts to both stores in a guild and only legacy storage globally', () => {
    rememberUser({ guild_id: 'guild-1', user_id: 'user-1', fact_key: 'favorite_anime', fact_value: 'Frieren' })
    rememberUser({ guild_id: 'global', user_id: 'user-2', fact_key: 'hobby', fact_value: 'gardening' })

    expect(getFacts('guild-1', 'user-1')).toEqual([{ key: 'favorite_anime', value: 'Frieren' }])
    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({ predicate: 'favorite_anime', value: 'Frieren', sourceKind: 'explicit' })
    ])
    expect(getFacts('global', 'user-2')).toEqual([{ key: 'hobby', value: 'gardening' }])
    expect(getActiveClaims('global', 'user-2')).toEqual([])
  })
})
