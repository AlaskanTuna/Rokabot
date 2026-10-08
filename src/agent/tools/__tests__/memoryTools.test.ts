import type { ToolContext } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

const embeddings = vi.hoisted(() => ({ embedEpisodeText: vi.fn(), embedPendingFacts: vi.fn() }))
vi.mock('../../memory/episodeEmbeddings.js', () => ({ embedEpisodeText: embeddings.embedEpisodeText }))
vi.mock('../../memory/factEmbeddings.js', () => ({ embedPendingFacts: embeddings.embedPendingFacts }))

import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import {
  findMediaDigest,
  listMediaDigestsForGuild,
  recordMediaOccurrence,
  saveMediaDigest
} from '../../../storage/mediaDigestStore.js'
import { getClaimSourceChannels, setClaimEmbedding } from '../../../storage/memoryRecallStore.js'
import { recordResponseEvent } from '../../../storage/metricsStore.js'
import { upsertUserName } from '../../../storage/userNames.js'
import { logger } from '../../../utils/logger.js'

/** A deliberately partial `ToolContext`. The tools under test read only `state.get`, and ADK does not export
 * `State` from its public surface, so a Map stands in for it. Cast once here rather than at each call site,
 * so the double is named in one place instead of asserted away in thirteen. */
const toolContextWith = (entries: Record<string, unknown>) =>
  ({ state: new Map(Object.entries(entries)) }) as unknown as ToolContext
const runForget = (
  query: string,
  userId = 'user-1',
  guildId = 'guild-1'
): Promise<{ success: boolean; message: string }> =>
  forgetUserTool.runAsync({
    args: { query },
    toolContext: toolContextWith({ _userId: userId, _guildId: guildId })
  }) as Promise<{ success: boolean; message: string }>
import { resolveName } from '../../memory/identityResolver.js'
import { assertClaim, assertGuildClaim, getActiveClaims, getActiveGuildClaims } from '../../memory/memoryClaims.js'
import { forgetUserTool, recallUserTool, rememberUserTool } from '../index.js'
import { recallUser } from '../recallUser.js'
import { rememberUser } from '../rememberUser.js'

// config.memory is typed read-only, so per-test overrides go through Object.assign and are restored after each test.
const memoryConfig = config.memory
const originalMemory = {
  privacy: memoryConfig.privacy,
  recall: memoryConfig.recall,
  embeddingTimeoutMs: memoryConfig.embeddingTimeoutMs
}
const setMemory = (patch: Partial<typeof originalMemory>): void => {
  Object.assign(memoryConfig, patch)
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.clearAllMocks()
  setMemory({ privacy: 'relaxed', recall: 'shadow' })
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  setMemory(originalMemory)
})

const unitVector = (index: number): number[] =>
  Array.from({ length: 768 }, (_, position) => (position === index ? 1 : 0))

function seedMedia(input: {
  guildId?: string
  contentKey: string
  label?: string
  summary: string
  sharedBy: string[]
}) {
  const guildId = input.guildId ?? 'guild-1'
  const digest = saveMediaDigest({
    guildId,
    contentKey: input.contentKey,
    kind: 'video',
    label: input.label ?? 'Cat video',
    summary: input.summary,
    digestJson: '{}'
  })
  if (!digest) throw new Error('Expected a digest')
  for (const [index, sharedByUserId] of input.sharedBy.entries()) {
    recordMediaOccurrence({
      digestId: digest.id,
      guildId,
      channelId: 'channel-1',
      messageId: `${input.contentKey}-${index}`,
      sharedByUserId,
      sourceAuthorId: null,
      origin: 'link'
    })
  }
  return digest
}

describe('memory tools', () => {
  it('forgets only the speaker’s user claim and leaves guild facts intact', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit'
    })
    const guildFact = assertGuildClaim({
      guildId: 'guild-1',
      predicate: 'place',
      value: 'The group meets in voice chat',
      expiresAt: null,
      sourceKind: 'passive'
    })

    await expect(runForget('tea')).resolves.toMatchObject({ success: true })

    expect(getActiveClaims('guild-1', 'user-1')).toEqual([])
    expect(getActiveGuildClaims('guild-1')).toEqual([expect.objectContaining({ id: guildFact.id })])
  })

  it('forgets all keyword matches only from the current speaker in the current guild', async () => {
    const shortMatch = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'osu!',
      sourceKind: 'explicit'
    })
    const longMatch = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'playing osu!',
      sourceKind: 'explicit'
    })
    const otherMemberClaim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-2',
      predicate: 'hobby',
      value: 'playing osu!',
      sourceKind: 'explicit'
    })
    const otherGuildClaim = assertClaim({
      guildId: 'guild-2',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'playing osu!',
      sourceKind: 'explicit'
    })

    const result = await runForget('osu')

    expect(result).toEqual({
      success: true,
      message: expect.stringContaining('hobby "osu!"')
    })
    expect(result.message).toContain('hobby "playing osu!"')
    expect(getActiveClaims('guild-1', 'user-1')).toEqual([])
    expect(getActiveClaims('guild-1', 'user-2').map(({ id }) => id)).toContain(otherMemberClaim.id)
    expect(getActiveClaims('guild-2', 'user-1').map(({ id }) => id)).toContain(otherGuildClaim.id)
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_claim WHERE id = ?').get(shortMatch.id)).toEqual({
      status: 'rejected',
      superseded_by: null
    })
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_claim WHERE id = ?').get(longMatch.id)).toEqual({
      status: 'rejected',
      superseded_by: null
    })
  })

  it('requires every query keyword to match and preserves claims on no match', async () => {
    const activeClaim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'playing osu!',
      sourceKind: 'explicit'
    })

    await expect(runForget('osu piano')).resolves.toEqual({
      success: false,
      message: "I couldn't find a matching note to forget."
    })
    expect(getActiveClaims('guild-1', 'user-1').map(({ id }) => id)).toContain(activeClaim.id)
  })

  it('returns four matching values for clarification without rejecting any claims', async () => {
    const claims = ['guitar lessons', 'guitar practice', 'guitar collection', 'guitar covers'].map((value) =>
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'likes',
        value,
        sourceKind: 'explicit'
      })
    )

    const result = await runForget('guitar')

    expect(result.success).toBe(false)
    expect(result.message).toContain('Which one did you mean?')
    for (const { value } of claims) expect(result.message).toContain(value)
    expect(
      getActiveClaims('guild-1', 'user-1')
        .map(({ id }) => id)
        .sort()
    ).toEqual(claims.map(({ id }) => id).sort())
  })

  it('does not repeat a privacy-sensitive value in its confirmation', async () => {
    const sensitiveClaim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'misc',
      value: 'old contact note',
      sourceKind: 'legacy'
    })
    getDb().prepare('UPDATE memory_claim SET value = ? WHERE id = ?').run('alice@example.com', sensitiveClaim.id)

    const result = await runForget('alice@example.com')

    expect(result).toEqual({ success: true, message: 'I forgot these notes: misc "a sensitive note".' })
    expect(result.message).not.toContain('alice@example.com')
    expect(getDb().prepare('SELECT status FROM memory_claim WHERE id = ?').get(sensitiveClaim.id)).toEqual({
      status: 'rejected'
    })
  })

  it('fails closed when it cannot identify a guild member', async () => {
    const activeClaim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'playing osu!',
      sourceKind: 'explicit'
    })

    await expect(runForget('osu', 'user-1', 'global')).resolves.toEqual({
      success: false,
      message: "I couldn't identify the current member or server, so I didn't forget anything."
    })
    expect(getActiveClaims('guild-1', 'user-1').map(({ id }) => id)).toContain(activeClaim.id)
  })

  it('forgets a remembered media item the speaker shared', async () => {
    seedMedia({ contentKey: 'youtube:cat', summary: 'A cat explores a night garden.', sharedBy: ['user-1'] })

    await expect(runForget('cat video')).resolves.toEqual({
      success: true,
      message: 'I forgot these notes: media "Cat video: A cat explores a night garden.".'
    })
    expect(findMediaDigest('guild-1', 'youtube:cat')).toBeNull()
  })

  it('keeps a remembered media item that another member still shares', async () => {
    seedMedia({ contentKey: 'youtube:cat', summary: 'A cat explores a night garden.', sharedBy: ['user-1', 'user-2'] })

    await expect(runForget('cat video')).resolves.toMatchObject({ success: true })

    expect(getDb().prepare('SELECT shared_by_user_id FROM media_occurrence').all()).toEqual([
      { shared_by_user_id: 'user-2' }
    ])
    expect(findMediaDigest('guild-1', 'youtube:cat')).not.toBeNull()
  })

  it('never forgets media shared by another member or in another guild', async () => {
    seedMedia({ contentKey: 'youtube:cat', summary: 'A cat explores a night garden.', sharedBy: ['user-2'] })
    seedMedia({
      guildId: 'guild-2',
      contentKey: 'youtube:cat',
      summary: 'A cat explores a night garden.',
      sharedBy: ['user-1']
    })

    await expect(runForget('cat video')).resolves.toEqual({
      success: false,
      message: "I couldn't find a matching note to forget."
    })
    expect(findMediaDigest('guild-1', 'youtube:cat')).not.toBeNull()
    expect(findMediaDigest('guild-2', 'youtube:cat')).not.toBeNull()
  })

  it('forgets a claim and a media item together when they total three or fewer', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'cat food',
      sourceKind: 'explicit'
    })
    seedMedia({ contentKey: 'youtube:cat', summary: 'A cat explores a night garden.', sharedBy: ['user-1'] })

    await expect(runForget('cat')).resolves.toEqual({
      success: true,
      message: 'I forgot these notes: likes "cat food", media "Cat video: A cat explores a night garden.".'
    })
    expect(getActiveClaims('guild-1', 'user-1')).toEqual([])
    expect(findMediaDigest('guild-1', 'youtube:cat')).toBeNull()
  })

  it('asks which to forget when claims and media together exceed three, forgetting nothing', async () => {
    const claims = ['cat food', 'cat toys'].map((value) =>
      assertClaim({ guildId: 'guild-1', subjectUserId: 'user-1', predicate: 'likes', value, sourceKind: 'explicit' })
    )
    seedMedia({ contentKey: 'youtube:video', summary: 'A cat explores a night garden.', sharedBy: ['user-1'] })
    seedMedia({
      contentKey: 'youtube:stream',
      label: 'Cat stream',
      summary: 'A cat sleeps on a keyboard.',
      sharedBy: ['user-1']
    })

    const result = await runForget('cat')

    expect(result.success).toBe(false)
    expect(result.message).toContain('Which one did you mean?')
    expect(result.message).toContain('likes "cat food"')
    expect(result.message).toContain('media "Cat stream: A cat sleeps on a keyboard."')
    expect(
      getActiveClaims('guild-1', 'user-1')
        .map(({ id }) => id)
        .sort()
    ).toEqual(claims.map(({ id }) => id).sort())
    expect(listMediaDigestsForGuild('guild-1')).toHaveLength(2)
  })

  it('does not search media when the query has no keyword terms', async () => {
    seedMedia({ contentKey: 'youtube:cat', summary: 'A cat explores a night garden.', sharedBy: ['user-1'] })

    await expect(runForget('?!')).resolves.toEqual({
      success: false,
      message: "I couldn't find a matching note to forget."
    })
    expect(findMediaDigest('guild-1', 'youtube:cat')).not.toBeNull()
  })

  it('matches CJK keywords in a claim value', async () => {
    const claim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: '桜餅が好き',
      sourceKind: 'explicit'
    })

    await expect(runForget('桜餅が好き')).resolves.toEqual({
      success: true,
      message: 'I forgot these notes: likes "桜餅が好き".'
    })
    expect(getActiveClaims('guild-1', 'user-1').map(({ id }) => id)).not.toContain(claim.id)
  })

  it('caps the keyword query at six terms', async () => {
    const claim = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'alpha bravo charlie delta echo foxtrot',
      sourceKind: 'explicit'
    })

    await expect(runForget('alpha bravo charlie delta echo foxtrot golf')).resolves.toEqual({
      success: true,
      message: 'I forgot these notes: likes "alpha bravo charlie delta echo foxtrot".'
    })
    expect(getActiveClaims('guild-1', 'user-1').map(({ id }) => id)).not.toContain(claim.id)
  })

  it('recalls and deduplicates active claims for a guild member', async () => {
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

    const result = await recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '' })

    expect(result.factCount).toBe(2)
    expect(result.facts).toContain('favorite_anime: frieren')
    expect(result.facts).toContain('likes: manga')
    expect(result.facts).not.toContain('tea ceremonies')
    expect(getDb().prepare('SELECT last_recalled_at FROM memory_claim WHERE id = ?').get(claim.id)).toEqual({
      last_recalled_at: expect.any(Number)
    })
  })

  it('recalls freshest claims first and caps the list at 15', async () => {
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
    const result = await recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '' })

    expect(result.factCount).toBe(15)
    expect(result.facts.startsWith('likes: thing-15')).toBe(true)
    expect(result.facts).not.toContain('ancient_fact')

    const recalled = getDb()
      .prepare("SELECT value FROM memory_claim WHERE last_recalled_at IS NOT NULL AND subject_user_id = 'user-1'")
      .all() as Array<{ value: string }>
    expect(recalled).toHaveLength(15)
    expect(recalled.map(({ value }) => value)).not.toContain('thing-0')
  })

  it('keeps an explicitly remembered claim in the window against fresher passive trivia', async () => {
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

    const result = await recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '' })

    expect(result.factCount).toBe(15)
    expect(result.facts).toContain('general_occupation: shrine caretaker')
  })

  it('recalls a resolved user_name through the FunctionTool', async () => {
    upsertUserName('user-2', 'mio', 'Mio')
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-2',
      predicate: 'favorite_anime',
      value: 'Frieren',
      sourceKind: 'explicit'
    })

    await expect(
      recallUserTool.runAsync({
        args: { user_name: 'mIo' },
        toolContext: toolContextWith({ _userId: 'speaker', _guildId: 'guild-1' })
      })
    ).resolves.toEqual({ facts: 'favorite_anime: Frieren', factCount: 1 })
  })

  it('recalls a user by an active nickname claim', async () => {
    upsertUserName('user-2', 'mio', 'Mio')
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-2',
      predicate: 'nickname',
      value: 'Kiki',
      sourceKind: 'explicit'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-2',
      predicate: 'favorite_anime',
      value: 'Frieren',
      sourceKind: 'explicit'
    })

    const result = (await recallUserTool.runAsync({
      args: { user_name: 'kIKI' },
      toolContext: toolContextWith({ _userId: 'speaker', _guildId: 'guild-1' })
    })) as { facts: string; factCount: number }

    expect(result.facts).toContain('favorite_anime: Frieren')
    expect(result.factCount).toBeGreaterThan(0)
  })

  it('asks which person when a name resolves to multiple members', async () => {
    upsertUserName('user-1', 'mio', 'Mio')
    upsertUserName('user-2', 'rin', 'Rin')
    for (const userId of ['user-1', 'user-2']) {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: userId,
        predicate: 'nickname',
        value: 'Kiki',
        sourceKind: 'explicit'
      })
    }

    await expect(
      recallUserTool.runAsync({
        args: { user_name: 'Kiki' },
        toolContext: toolContextWith({ _userId: 'speaker', _guildId: 'guild-1' })
      })
    ).resolves.toEqual({
      facts: 'Several people here go by "Kiki": Mio, Rin. Ask which one they mean.',
      factCount: 0
    })
  })

  it('threads _userMessage from toolContext.state into ranking, surfacing a fact buried by recency', async () => {
    const now = Date.now()
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'misc',
      value: 'volunteers at the animal shelter on weekends',
      sourceKind: 'explicit',
      observedAt: now - 40 * 24 * 60 * 60 * 1000
    })
    for (let index = 0; index < 19; index++) {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'misc',
        value: `noise item ${index}`,
        sourceKind: 'explicit',
        observedAt: now - (19 - index) * 24 * 60 * 60 * 1000
      })
    }

    const withoutMessage = await recallUserTool.runAsync({
      args: {},
      toolContext: toolContextWith({ _userId: 'user-1', _guildId: 'guild-1' })
    })
    const withMessage = await recallUserTool.runAsync({
      args: {},
      toolContext: toolContextWith({
        _userId: 'user-1',
        _guildId: 'guild-1',
        _userMessage: 'what does she do at the shelter?'
      })
    })

    expect((withoutMessage as { facts: string }).facts).not.toContain('volunteers at the animal shelter')
    expect((withMessage as { facts: string }).facts).toContain('volunteers at the animal shelter')
  })

  it('returns the graceful result when user_name is unknown', async () => {
    await expect(
      recallUserTool.runAsync({
        args: { user_name: 'nobody' },
        toolContext: toolContextWith({ _userId: 'speaker', _guildId: 'guild-1' })
      })
    ).resolves.toEqual({ facts: "I don't know anyone by that name here yet.", factCount: 0 })
  })

  it('writes only active claims and refuses the unsupported global tenant', () => {
    expect(
      rememberUser({ guild_id: 'guild-1', user_id: 'user-1', fact_key: 'favorite_anime', fact_value: 'Frieren' })
    ).toEqual({ success: true, message: 'Remembered favorite_anime for user-1.', totalFacts: 1 })
    expect(getActiveClaims('guild-1', 'user-1')).toEqual([
      expect.objectContaining({ predicate: 'favorite_anime', value: 'Frieren', sourceKind: 'explicit' })
    ])
    expect(rememberUser({ guild_id: 'global', user_id: 'user-2', fact_key: 'hobby', fact_value: 'gardening' })).toEqual(
      expect.objectContaining({ success: false })
    )
    expect(getActiveClaims('global', 'user-2')).toEqual([])
  })

  it('keeps a DM fact scoped to its own channel tenant, invisible from a different DM', async () => {
    rememberUser({ guild_id: 'dm:channel-A', user_id: 'user-A', fact_key: 'favorite_anime', fact_value: 'Frieren' })

    expect((await recallUser({ guild_id: 'dm:channel-B', user_id: 'user-A', message: '' })).factCount).toBe(0)
    expect((await recallUser({ guild_id: 'dm:channel-A', user_id: 'user-A', message: '' })).factCount).toBe(1)
  })

  it('fails closed instead of writing to the shared global tenant when the FunctionTool has no usable _guildId', async () => {
    await expect(
      rememberUserTool.runAsync({
        args: { fact_key: 'favorite_anime', fact_value: 'Frieren' },
        toolContext: toolContextWith({ _userId: 'user-x' })
      })
    ).resolves.toEqual({
      success: false,
      message: "I couldn't tell where we are right now, so I didn't save that.",
      totalFacts: 0
    })
    await expect(
      rememberUserTool.runAsync({
        args: { fact_key: 'favorite_anime', fact_value: 'Frieren' },
        toolContext: toolContextWith({ _userId: 'user-x', _guildId: 'global' })
      })
    ).resolves.toEqual({
      success: false,
      message: "I couldn't tell where we are right now, so I didn't save that.",
      totalFacts: 0
    })
  })

  it('fails closed instead of reading the shared global tenant when the FunctionTool has no usable _guildId', async () => {
    await expect(
      recallUserTool.runAsync({ args: {}, toolContext: toolContextWith({ _userId: 'user-x' }) })
    ).resolves.toEqual({ facts: "I don't have any notes about this person yet.", factCount: 0 })
    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: toolContextWith({ _userId: 'user-x', _guildId: 'global' })
      })
    ).resolves.toEqual({ facts: "I don't have any notes about this person yet.", factCount: 0 })
  })

  it('warns with the tool name and tenant state on every fail-closed path', async () => {
    const noTenant = toolContextWith({ _userId: 'user-x' })
    const globalTenant = toolContextWith({ _userId: 'user-x', _guildId: 'global' })
    const fact = { fact_key: 'favorite_anime', fact_value: 'Frieren' }

    await rememberUserTool.runAsync({ args: fact, toolContext: noTenant })
    await rememberUserTool.runAsync({ args: fact, toolContext: globalTenant })
    await recallUserTool.runAsync({ args: { user_name: 'Mio' }, toolContext: noTenant })
    await recallUserTool.runAsync({ args: { user_name: 'Mio' }, toolContext: globalTenant })

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

describe('memory tools across privacy levels and recall modes', () => {
  const seedShelterFacts = () => {
    const now = Date.now()
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'misc',
      value: 'volunteers at the animal shelter on weekends',
      sourceKind: 'explicit',
      observedAt: now - 40 * 24 * 60 * 60 * 1000
    })
    for (let index = 0; index < 19; index++) {
      assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'misc',
        value: `noise item ${index}`,
        sourceKind: 'explicit',
        observedAt: now - (19 - index) * 24 * 60 * 60 * 1000
      })
    }
  }

  it('records the channel a remembered fact came from and queues it for embedding', () => {
    expect(
      rememberUser({
        guild_id: 'guild-1',
        user_id: 'user-1',
        fact_key: 'hobby',
        fact_value: 'gardening',
        channel_id: 'c1'
      })
    ).toEqual(expect.objectContaining({ success: true }))

    const [claim] = getActiveClaims('guild-1', 'user-1')
    expect(getClaimSourceChannels([claim.id]).get(claim.id)).toEqual(['c1'])
    expect(embeddings.embedPendingFacts).toHaveBeenCalledTimes(1)
    expect(embeddings.embedPendingFacts).toHaveBeenCalledWith({ limit: 5 })
  })

  it('neither saves nor queues a fact at privacy off', () => {
    setMemory({ privacy: 'off' })

    expect(
      rememberUser({ guild_id: 'guild-1', user_id: 'user-1', fact_key: 'hobby', fact_value: 'gardening' })
    ).toEqual(expect.objectContaining({ success: false }))
    expect(getActiveClaims('guild-1', 'user-1')).toEqual([])
    expect(embeddings.embedPendingFacts).not.toHaveBeenCalled()
  })

  it('omits a fact learned only in another channel under strict and recalls it at relaxed', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'gardening',
      sourceKind: 'explicit',
      channelId: 'other'
    })
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'likes',
      value: 'tea',
      sourceKind: 'explicit',
      channelId: 'here'
    })

    setMemory({ privacy: 'strict' })
    await expect(
      recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '', channel_id: 'here' })
    ).resolves.toEqual({ facts: 'likes: tea', factCount: 1 })

    setMemory({ privacy: 'relaxed' })
    await expect(
      recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '', channel_id: 'here' })
    ).resolves.toMatchObject({ factCount: 2 })
  })

  it('recalls nothing at privacy off', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'gardening',
      sourceKind: 'explicit',
      channelId: 'here'
    })
    setMemory({ privacy: 'off' })

    await expect(
      recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '', channel_id: 'here' })
    ).resolves.toEqual({ facts: "I don't have any notes about this person yet.", factCount: 0 })
  })

  it('recalls nothing under strict when the channel is unknown', async () => {
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'gardening',
      sourceKind: 'explicit',
      channelId: 'here'
    })
    setMemory({ privacy: 'strict' })

    await expect(recallUser({ guild_id: 'guild-1', user_id: 'user-1', message: '' })).resolves.toMatchObject({
      factCount: 0
    })
  })

  it('ranks by similarity in unified mode and never returns more than 15 facts', async () => {
    setMemory({ recall: 'unified' })
    for (let index = 0; index < 20; index++) {
      const claim = assertClaim({
        guildId: 'guild-1',
        subjectUserId: 'user-1',
        predicate: 'likes',
        value: `thing-${index}`,
        sourceKind: 'explicit'
      })
      setClaimEmbedding({ id: claim.id, embeddingText: `thing-${index}`, embedding: unitVector(0) })
    }
    const unrelated = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'unrelated',
      sourceKind: 'explicit'
    })
    setClaimEmbedding({ id: unrelated.id, embeddingText: 'unrelated', embedding: unitVector(1) })
    embeddings.embedEpisodeText.mockResolvedValue(unitVector(0))

    const result = await recallUser({
      guild_id: 'guild-1',
      user_id: 'user-1',
      message: 'tell me about things'
    })

    expect(embeddings.embedEpisodeText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'tell me about things', role: 'RETRIEVAL_QUERY' })
    )
    expect(result.factCount).toBe(15)
    expect(result.facts).not.toContain('unrelated')
  })

  it('falls back to keyword ranking in unified mode when the query embedding rejects', async () => {
    setMemory({ recall: 'unified' })
    seedShelterFacts()
    embeddings.embedEpisodeText.mockRejectedValue(new Error('offline'))

    const result = await recallUser({
      guild_id: 'guild-1',
      user_id: 'user-1',
      message: 'what does she do at the shelter?'
    })

    expect(result.facts).toContain('volunteers at the animal shelter')
  })

  it('falls back to keyword ranking in unified mode when the query embedding times out', async () => {
    setMemory({ recall: 'unified' })
    setMemory({ embeddingTimeoutMs: 1 })
    seedShelterFacts()
    embeddings.embedEpisodeText.mockReturnValue(new Promise(() => {}))

    const result = await recallUser({
      guild_id: 'guild-1',
      user_id: 'user-1',
      message: 'what does she do at the shelter?'
    })

    expect(result.facts).toContain('volunteers at the animal shelter')
  })

  it('passes the channel from tool state into remember_user and recall_user', async () => {
    setMemory({ privacy: 'strict' })
    await rememberUserTool.runAsync({
      args: { fact_key: 'hobby', fact_value: 'gardening' },
      toolContext: toolContextWith({ _userId: 'user-1', _guildId: 'guild-1', _channelId: 'here' })
    })

    const [claim] = getActiveClaims('guild-1', 'user-1')
    expect(getClaimSourceChannels([claim.id]).get(claim.id)).toEqual(['here'])
    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: toolContextWith({ _userId: 'user-1', _guildId: 'guild-1', _channelId: 'here' })
      })
    ).resolves.toMatchObject({ factCount: 1 })
    await expect(
      recallUserTool.runAsync({
        args: {},
        toolContext: toolContextWith({ _userId: 'user-1', _guildId: 'guild-1', _channelId: 'other' })
      })
    ).resolves.toMatchObject({ factCount: 0 })
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
    toolsUsed: [],
    hedged: 0
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

    expect(resolveName('Alice', 'dm:channel-B')).toEqual([])
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

    expect(resolveName('Alice', 'guild-1')).toEqual(['user-1'])
  })

  it('resolves a name backed only by an explicit claim in the current tenant', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'nickname',
      value: 'Ali',
      sourceKind: 'explicit'
    })

    expect(resolveName('Alice', 'guild-1')).toEqual(['user-1'])
  })

  it('resolves a name backed only by response activity in the current tenant', () => {
    upsertUserName('user-1', 'alice', 'Alice')
    recordResponseEvent(activityIn('guild-1', 'user-1'))

    expect(resolveName('Alice', 'guild-1')).toEqual(['user-1'])
  })
})
