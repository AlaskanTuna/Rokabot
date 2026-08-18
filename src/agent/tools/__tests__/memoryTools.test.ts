import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { recordResponseEvent } from '../../../storage/metricsStore.js'
import { getFacts, saveFact } from '../../../storage/userMemory.js'
import { findUserByName, upsertUserName } from '../../../storage/userNames.js'
import { logger } from '../../../utils/logger.js'
import { assertClaim, getActiveClaims } from '../../memory/memoryClaims.js'
import { recallUserTool, rememberUserTool } from '../index.js'
import { recallUser } from '../recallUser.js'
import { rememberUser } from '../rememberUser.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.clearAllMocks()
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

  it('keeps an explicitly remembered claim in the window against fresher passive trivia', () => {
    const now = Date.now()
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'general_occupation',
      value: 'shrine caretaker',
      sourceKind: 'explicit',
      observedAt: now - 90 * 60_000
    })
    for (let index = 0; index < 15; index++) {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'likes',
        value: `thing-${index}`,
        sourceKind: 'passive',
        observedAt: now - (15 - index) * 60_000
      })
    }

    const result = recallUser({ guild_id: 'guild-1', user_id: 'user-1' })

    expect(result.factCount).toBe(15)
    expect(result.facts).toContain('general_occupation: shrine caretaker')
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

  it('keeps a DM fact scoped to its own channel tenant, invisible from a different DM', () => {
    rememberUser({ guild_id: 'dm:channel-A', user_id: 'user-A', fact_key: 'favorite_anime', fact_value: 'Frieren' })

    expect(recallUser({ guild_id: 'dm:channel-B', user_id: 'user-A' }).factCount).toBe(0)
    expect(recallUser({ guild_id: 'dm:channel-A', user_id: 'user-A' }).factCount).toBe(1)
  })

  it('fails closed instead of writing to the shared global tenant when the FunctionTool has no usable _guildId', async () => {
    await expect(
      rememberUserTool.runAsync({
        args: { fact_key: 'favorite_anime', fact_value: 'Frieren' },
        toolContext: { state: new Map([['_userId', 'user-x']]) }
      })
    ).resolves.toEqual({
      success: false,
      message: "I couldn't tell where we are right now, so I didn't save that.",
      totalFacts: 0
    })
    await expect(
      rememberUserTool.runAsync({
        args: { fact_key: 'favorite_anime', fact_value: 'Frieren' },
        toolContext: {
          state: new Map([
            ['_userId', 'user-x'],
            ['_guildId', 'global']
          ])
        }
      })
    ).resolves.toEqual({
      success: false,
      message: "I couldn't tell where we are right now, so I didn't save that.",
      totalFacts: 0
    })
    expect(getFacts('global', 'user-x')).toEqual([])
  })

  it('fails closed instead of reading the shared global tenant when the FunctionTool has no usable _guildId', async () => {
    saveFact('global', 'user-x', 'favorite_anime', 'Frieren')

    await expect(
      recallUserTool.runAsync({ args: {}, toolContext: { state: new Map([['_userId', 'user-x']]) } })
    ).resolves.toEqual({ facts: "I don't have any notes about this person yet.", factCount: 0 })
    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: {
          state: new Map([
            ['_userId', 'user-x'],
            ['_guildId', 'global']
          ])
        }
      })
    ).resolves.toEqual({ facts: "I don't have any notes about this person yet.", factCount: 0 })
  })

  it('warns with the tool name and tenant state on every fail-closed path', async () => {
    const noTenant = new Map([['_userId', 'user-x']])
    const globalTenant = new Map([
      ['_userId', 'user-x'],
      ['_guildId', 'global']
    ])
    const fact = { fact_key: 'favorite_anime', fact_value: 'Frieren' }

    await rememberUserTool.runAsync({ args: fact, toolContext: { state: noTenant } })
    await rememberUserTool.runAsync({ args: fact, toolContext: { state: globalTenant } })
    await recallUserTool.runAsync({ args: { user_name: 'Mio' }, toolContext: { state: noTenant } })
    await recallUserTool.runAsync({ args: { user_name: 'Mio' }, toolContext: { state: globalTenant } })

    // Equality over every call, not toHaveBeenCalledWith: an exact payload is what proves no fact
    // value, argument, or user identifier rode along, and that absent stays distinguishable from 'global'.
    expect(vi.mocked(logger.warn).mock.calls).toEqual([
      [{ tool: 'remember_user', tenantState: 'missing' }, 'Memory tool failed closed on unusable tenant state'],
      [{ tool: 'remember_user', tenantState: 'global' }, 'Memory tool failed closed on unusable tenant state'],
      [{ tool: 'recall_user', tenantState: 'missing' }, 'Memory tool failed closed on unusable tenant state'],
      [{ tool: 'recall_user', tenantState: 'global' }, 'Memory tool failed closed on unusable tenant state']
    ])
  })
})

describe('tenant-scoped name resolution', () => {
  const activityIn = (guildId: string, userId: string) => ({
    guildId,
    channelId: 'channel-1',
    userId,
    trigger: 'mention' as const,
    tone: 'playful',
    outcome: 'ok',
    kind: 'none',
    e2eMs: 1,
    generateMs: 1,
    llmMs: 1,
    retryLatencyMs: 0,
    retries: 0,
    tokensInEst: 1,
    tokensOutEst: 1,
    toolsUsed: []
  })

  it('does not resolve a globally known name from a tenant the user has no presence in', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive'
    })

    expect(findUserByName('Alice', 'dm:channel-B')).toBeNull()
  })

  it('resolves a name backed by a claim in the current tenant', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'passive'
    })

    expect(findUserByName('Alice', 'guild-1')).toEqual({ userId: 'user-1', username: 'alice', displayName: 'Alice' })
  })

  it('resolves a name backed only by a legacy fact in the current tenant', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    saveFact('guild-1', 'user-1', 'nickname', 'Ali')

    expect(findUserByName('Alice', 'guild-1')).toEqual({ userId: 'user-1', username: 'alice', displayName: 'Alice' })
  })

  it('resolves a name backed only by response activity in the current tenant', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    recordResponseEvent(activityIn('guild-1', 'user-1'))

    expect(findUserByName('Alice', 'guild-1')).toEqual({ userId: 'user-1', username: 'alice', displayName: 'Alice' })
  })
})
