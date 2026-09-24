import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: {
      maxActiveClaimsPerUser: 20,
      maxClaimsPerTurn: 10,
      retrievalTokenBudget: 350,
      recentParticipantLimit: 3,
      speakerMinShare: 0.5,
      salienceHalfLifeDays: 30,
      recallCooldownMs: 21_600_000
    }
  }
}))

import { closeDb, getDb } from '../../../storage/database.js'
import { recordMemoryEvent } from '../../../storage/metricsStore.js'
import { upsertUserName } from '../../../storage/userNames.js'
import { estimateTokens } from '../../../utils/tokens.js'
import { assertClaim } from '../memoryClaims.js'
import { retrieveForSubject, retrieveForTurn } from '../retriever.js'

const NOW = 1_000_000
const DAY = 24 * 60 * 60 * 1000

function claim(
  userId: string,
  predicate: string,
  value: string,
  options: Partial<Parameters<typeof assertClaim>[0]> = {}
) {
  return assertClaim({
    guildId: 'guild-a',
    subjectUserId: userId,
    predicate,
    value,
    sourceKind: 'explicit',
    observedAt: NOW,
    ...options
  })
}

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  upsertUserName('speaker', 'speaker', 'Speaker')
  upsertUserName('participant-1', 'participant-1', 'Participant One')
  upsertUserName('participant-2', 'participant-2', 'Participant Two')
  upsertUserName('participant-3', 'participant-3', 'Participant Three')
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

describe('retrieveForTurn', () => {
  it('keeps speaker anchors within the claim and token caps when participant FTS matches dominate', () => {
    const speakerClaims = [
      claim('speaker', 'nickname', 'Rin'),
      claim('speaker', 'favorite_game', 'Senren Banka'),
      claim('speaker', 'favorite_anime', 'Frieren'),
      claim('speaker', 'favorite_music', 'jazz'),
      claim('speaker', 'hobby', 'painting'),
      claim('speaker', 'likes', 'tea')
    ]

    for (const participantId of ['participant-1', 'participant-2', 'participant-3']) {
      for (let index = 0; index < 5; index++) {
        claim(participantId, 'likes', `anime game recommendation ${index}`)
      }
    }

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: ['participant-1', 'participant-2', 'participant-3'],
      message: 'Which anime games would you recommend?'
    })

    expect(result.claims).toHaveLength(10)
    expect(result.claims.filter(({ claim: candidate }) => candidate.subjectUserId === 'speaker')).toHaveLength(5)
    expect(estimateTokens(JSON.stringify(result.entries))).toBeLessThanOrEqual(350)
    expect(result.trace.selected).toHaveLength(10)
    expect(result.trace.selected.every(({ id, score }) => id > 0 && Number.isFinite(score))).toBe(true)
    expect(getDb().prepare("SELECT kind, n_selected FROM memory_events WHERE kind = 'retrieval'").all()).toEqual([
      { kind: 'retrieval', n_selected: 10 }
    ])
  })

  it('never returns claims from another guild or a DM scope', () => {
    const inGuild = claim('speaker', 'likes', 'tea')
    assertClaim({
      guildId: 'guild-b',
      subjectUserId: 'participant-1',
      predicate: 'likes',
      value: 'coffee',
      sourceKind: 'explicit'
    })
    assertClaim({
      guildId: 'dm:channel-1',
      subjectUserId: 'participant-2',
      predicate: 'likes',
      value: 'manga',
      sourceKind: 'explicit'
    })

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: ['participant-1', 'participant-2'],
      message: 'What do you like?'
    })

    expect(result.claims.map(({ claim: candidate }) => candidate.id)).toEqual([inGuild.id])
  })

  it('routes game topics and expands a relationship edge to a present participant', () => {
    const favoriteGame = claim('speaker', 'favorite_game', 'Senren Banka')
    const relationship = claim('speaker', 'relationship_to', 'friend', { objectUserId: 'participant-1' })
    const participantClaim = claim('participant-1', 'hobby', 'speedrunning')

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: ['participant-1'],
      message: 'Any good games?'
    })

    expect(result.claims.map(({ claim: candidate }) => candidate.id)).toEqual(
      expect.arrayContaining([favoriteGame.id, relationship.id, participantClaim.id])
    )
  })

  it('excludes a non-speaker needs-review claim from FTS, topic, and relationship expansion', () => {
    const relationship = claim('speaker', 'relationship_to', 'friend', { objectUserId: 'participant-1' })
    const needsReview = claim('participant-1', 'favorite_game', 'Senren Banka', {
      sourceKind: 'legacy',
      needsReview: true
    })

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: ['participant-1'],
      message: 'Any good Senren Banka games?'
    })

    expect(result.claims.map(({ claim: candidate }) => candidate.id)).toContain(relationship.id)
    expect(result.claims.map(({ claim: candidate }) => candidate.id)).not.toContain(needsReview.id)
    expect(result.trace.candidates.map(({ id }) => id)).not.toContain(needsReview.id)
  })

  it('selects a speaker needs-review claim only as an anchor', () => {
    const needsReview = claim('speaker', 'nickname', 'Rin', { sourceKind: 'legacy', needsReview: true })
    claim('participant-1', 'favorite_game', 'Senren Banka')

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: ['participant-1'],
      message: 'Any good games?'
    })

    expect(result.claims.map(({ claim: candidate }) => candidate.id)).toContain(needsReview.id)
    expect(result.trace.candidates.map(({ id }) => id)).not.toContain(needsReview.id)
  })

  it('touches only selected claims without changing their evidence timestamps', () => {
    const claims = Array.from({ length: 12 }, (_, index) => claim('speaker', 'likes', `interest ${index}`))
    const lastSeenById = new Map(
      claims.map(({ id }) => [id, getDb().prepare('SELECT last_seen_at FROM memory_claim WHERE id = ?').get(id)])
    )
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 1)

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: [],
      message: 'Tell me more'
    })
    const selectedIds = new Set(result.trace.selected.map(({ id }) => id))
    const recalled = getDb()
      .prepare('SELECT id, last_seen_at, last_recalled_at FROM memory_claim ORDER BY id')
      .all() as Array<{ id: number; last_seen_at: number; last_recalled_at: number | null }>

    expect(
      recalled
        .filter(({ id }) => id === 1 || selectedIds.has(id))
        .every(({ last_recalled_at }) => last_recalled_at === NOW + 1)
    ).toBe(true)
    expect(
      recalled.filter(({ id }) => !selectedIds.has(id)).every(({ last_recalled_at }) => last_recalled_at === null)
    ).toBe(true)
    expect(recalled.map(({ id, last_seen_at }) => [id, { last_seen_at }])).toEqual([...lastSeenById])
  })

  it('decays salience by its configured half-life without changing stored salience', () => {
    const oldClaim = claim('speaker', 'hobby', 'old hobby')
    getDb()
      .prepare('UPDATE memory_claim SET salience = ?, confidence = ?, last_seen_at = ?, pinned = 0 WHERE id = ?')
      .run(0.8, 0.6, NOW - 30 * DAY, oldClaim.id)

    const result = retrieveForSubject('guild-a', 'speaker', '', 1)

    expect(result[0].score).toBeCloseTo(1.65)
    expect(getDb().prepare('SELECT salience FROM memory_claim WHERE id = ?').get(oldClaim.id)).toEqual({
      salience: 0.8
    })
  })

  it('penalizes recently recalled claims when the message has no matching signal', () => {
    const recalled = claim('speaker', 'hobby', 'playing osu!')
    getDb()
      .prepare('UPDATE memory_claim SET salience = ?, confidence = ?, last_recalled_at = ? WHERE id = ?')
      .run(0.7, 0.8, NOW - 1, recalled.id)

    const damped = retrieveForSubject('guild-a', 'speaker', '', 1)[0].score
    getDb().prepare('UPDATE memory_claim SET last_recalled_at = NULL WHERE id = ?').run(recalled.id)
    const undamped = retrieveForSubject('guild-a', 'speaker', '', 1)[0].score

    expect(undamped - damped).toBeCloseTo(0.75)
  })

  it.each(['osu', 'what hobbies have you mentioned'])('skips the recall penalty for a message match: %s', (message) => {
    const recalled = claim('speaker', 'hobby', 'playing osu!')
    getDb()
      .prepare('UPDATE memory_claim SET salience = ?, confidence = ?, last_recalled_at = ? WHERE id = ?')
      .run(0.7, 0.8, NOW - 1, recalled.id)

    const withCooldown = retrieveForSubject('guild-a', 'speaker', message, 1)[0].score
    getDb().prepare('UPDATE memory_claim SET last_recalled_at = NULL WHERE id = ?').run(recalled.id)
    const withoutCooldown = retrieveForSubject('guild-a', 'speaker', message, 1)[0].score

    expect(withCooldown).toBeCloseTo(withoutCooldown)
  })

  it('uses decayed scores when choosing speaker anchors', () => {
    const stale = claim('speaker', 'hobby', 'old hobby')
    const recent = Array.from({ length: 5 }, (_, index) => claim('speaker', 'likes', `fresh interest ${index}`))
    getDb()
      .prepare('UPDATE memory_claim SET salience = ?, confidence = ?, last_seen_at = ? WHERE id = ?')
      .run(0.95, 0.95, NOW - 35 * DAY, stale.id)
    for (const candidate of recent) {
      getDb()
        .prepare('UPDATE memory_claim SET salience = ?, confidence = ?, last_seen_at = ? WHERE id = ?')
        .run(0.5, 0.6, NOW, candidate.id)
    }

    const result = retrieveForTurn({
      guildId: 'guild-a',
      speakerId: 'speaker',
      participantIds: [],
      message: ''
    })

    expect(result.claims.slice(0, 5).map(({ claim: candidate }) => candidate.id)).not.toContain(stale.id)
  })
})
