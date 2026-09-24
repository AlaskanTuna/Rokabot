import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../../../storage/database.js'
import { upsertUserName } from '../../../storage/userNames.js'
import { resolveName, resolveReferences } from '../identityResolver.js'
import { assertClaim } from '../memoryClaims.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

function addUser(userId: string, username: string, displayName: string, guildId = 'guild-a'): void {
  upsertUserName(userId, username, displayName)
  getDb()
    .prepare(`
      INSERT INTO response_events (
        guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
        retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
      ) VALUES (?, 'channel-1', ?, 'mention', 'playful', 'ok', 'none', 1, 1, 1, 0, 0, 1, 1, 1)
    `)
    .run(guildId, userId)
}

function addNickname(userId: string, nickname: string, guildId = 'guild-a'): void {
  assertClaim({
    guildId,
    subjectUserId: userId,
    predicate: 'nickname',
    value: nickname,
    sourceKind: 'explicit'
  })
}

describe('resolveName', () => {
  it('does not use a legacy fact table to establish guild presence', () => {
    upsertUserName('legacy-user', 'alice', 'Alice')
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS user_memory (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fact_key TEXT NOT NULL, fact_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO user_memory VALUES ('guild-a', 'legacy-user', 'nickname', 'Ali', 1);
    `)

    expect(resolveName('Alice', 'guild-a')).toEqual([])
  })

  it('returns display name, username, and active nickname matches in priority order', () => {
    addUser('display-match', 'display-user', 'Alias')
    addUser('username-match', 'ALIAS', 'Username User')
    addUser('nickname-match', 'nickname-user', 'Nickname User')
    addNickname('nickname-match', ' alias ')

    expect(resolveName('  aLiAs ', 'guild-a')).toEqual(['display-match', 'username-match', 'nickname-match'])
  })

  it('scopes display and username matches to guild presence and excludes other guild nicknames', () => {
    addUser('other-guild', 'alice', 'Alice', 'guild-b')
    addUser('nickname-other-guild', 'kiki', 'Kiki', 'guild-b')
    addNickname('nickname-other-guild', 'Kiki Alias', 'guild-b')

    expect(resolveName('Alice', 'guild-a')).toEqual([])
    expect(resolveName('Kiki Alias', 'guild-a')).toEqual([])
  })

  it('uses only display names and usernames for the global scope', () => {
    upsertUserName('global-name', 'global', 'Global Name')
    upsertUserName('global-nickname', 'someone', 'Someone')
    addNickname('global-nickname', 'Global Name')

    expect(resolveName('Global Name', 'global')).toEqual(['global-name'])
  })
})

describe('resolveReferences', () => {
  const input = (text: string, overrides: Partial<Parameters<typeof resolveReferences>[0]> = {}) => ({
    guildId: 'guild-a',
    text,
    speakerId: 'speaker',
    mentionedUserIds: [],
    ...overrides
  })

  it('resolves nickname mentions and keeps collisions ambiguous', () => {
    addUser('nickname-user', 'kiki', 'Kiki')
    addNickname('nickname-user', 'Kiki Alias')
    addUser('alice-one', 'alice-one', 'Alice')
    addUser('alice-two', 'alice-two', 'ALICE')

    expect(resolveReferences(input('Ask Kiki Alias, then Alice.'))).toEqual({
      resolved: [
        {
          userId: 'nickname-user',
          alias: 'Kiki Alias',
          displayName: 'Kiki',
          matchedBy: 'nickname'
        }
      ],
      ambiguous: [{ alias: 'Alice', candidateIds: ['alice-one', 'alice-two'] }]
    })
  })

  it('matches case-insensitively and excludes a uniquely matched speaker', () => {
    addUser('speaker', 'sora', 'Sora')
    addUser('other-user', 'mio', 'Mio')

    expect(resolveReferences(input('SORA asked about @MIO.'))).toEqual({
      resolved: [
        {
          userId: 'other-user',
          alias: 'MIO',
          displayName: 'Mio',
          matchedBy: 'display_name'
        }
      ],
      ambiguous: []
    })
  })

  it('labels a username match with its display name', () => {
    addUser('username-user', 'mio_99', 'Mio Person')

    expect(resolveReferences(input('Have you seen @MIO_99?')).resolved).toEqual([
      { userId: 'username-user', alias: 'MIO_99', displayName: 'Mio Person', matchedBy: 'username' }
    ])
  })

  it('does not leak nickname claims from another guild and ignores short aliases', () => {
    addUser('other-guild', 'kiki', 'Kiki', 'guild-b')
    addNickname('other-guild', 'Long Alias', 'guild-b')
    addUser('short-name', 'li', 'Li')

    expect(resolveReferences(input('Long Alias and Li'))).toEqual({ resolved: [], ambiguous: [] })
  })

  it('resolves known mentions directly, skips unknown IDs, and excludes the speaker', () => {
    upsertUserName('speaker', 'speaker', 'Speaker')
    upsertUserName('mentioned', 'mio', 'Mio')

    expect(
      resolveReferences(input('hello', { speakerId: 'speaker', mentionedUserIds: ['speaker', 'unknown', 'mentioned'] }))
    ).toEqual({
      resolved: [{ userId: 'mentioned', alias: 'Mio', displayName: 'Mio', matchedBy: 'mention' }],
      ambiguous: []
    })
  })

  it('escapes regex metacharacters and matches non-ASCII aliases as substrings', () => {
    addUser('metachar', 'dot.user', 'A.B')
    addUser('japanese', 'roka', '馬庭芦花')

    expect(resolveReferences(input('A.B is here, but AXB is not. 今日は馬庭芦花さんと話した。')).resolved).toEqual([
      { userId: 'metachar', alias: 'A.B', displayName: 'A.B', matchedBy: 'display_name' },
      { userId: 'japanese', alias: '馬庭芦花', displayName: '馬庭芦花', matchedBy: 'display_name' }
    ])
  })

  it('keeps first appearance order, deduplicates users, and caps resolved references at five', () => {
    addUser('user-6', 'Six', 'Person 6')
    for (let index = 1; index <= 5; index++) {
      addUser(`user-${index}`, `user-${index}`, `Person ${index}`)
    }

    const result = resolveReferences(input('Six and Person 6, Person 4, Person 3, Person 2, Person 1, Person 5'))

    expect(result.resolved.map(({ userId }) => userId)).toEqual(['user-6', 'user-4', 'user-3', 'user-2', 'user-1'])
    expect(result.resolved[0]).toMatchObject({ alias: 'Six', displayName: 'Person 6', matchedBy: 'username' })
  })

  it('returns no references for the global scope', () => {
    addUser('user', 'someone', 'Someone')

    expect(resolveReferences(input('Someone', { guildId: 'global' }))).toEqual({ resolved: [], ambiguous: [] })
  })
})
