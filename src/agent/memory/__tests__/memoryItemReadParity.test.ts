import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replayMemoryItems } from '../../../../scripts/replay-memory-items.js'
import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import { migrateMemoryItems } from '../../../storage/memoryItemBackfill.js'
import { configureMemoryItemProjectionTriggers } from '../../../storage/memoryItemProjection.js'
import { decodeMemoryItemEmbedding } from '../../../storage/memoryItemStore.js'
import { buildFactsEnvelope } from '../../promptSafety.js'
import { formatRecallUserFacts, recallUser } from '../../tools/recallUser.js'
import { formatGuildFactsBlock } from '../../turnContext.js'
import { registerChannelVisibility, resetChannelVisibilityForTest } from '../channelVisibility.js'
import {
  buildEpisodeRecallBlock,
  formatEpisodeRecallBlock,
  readRecallableEpisodes,
  selectEpisodes,
  selectEpisodesWithinBudget
} from '../episodeRetriever.js'
import { buildMediaRecallBlock, formatMediaRecallBlock, readRecallableMedia, selectMedia } from '../mediaRecall.js'
import {
  readItemGuildFacts,
  readItemMediaCandidates,
  readItemRecallableEpisodes,
  readItemSubjectSnapshot,
  readItemTurnSnapshot
} from '../memoryItems.js'
import {
  readGuildFacts,
  readSubjectSnapshot,
  readTurnSnapshot,
  retrieveForTurn,
  retrieveGuildFacts,
  selectForSubject,
  selectForTurn,
  selectGuildFacts
} from '../retriever.js'

const memory = config.memory as { store: string; privacy: string }
let previousStore = ''
let previousPrivacy = ''

const FIXED_NOW = Date.UTC(2026, 10, 13)
const SCOPE = { guildId: 'guild-fixture', channelId: 'channel-fixture' }

function vector(value = 0.25): Buffer {
  const bytes = Buffer.alloc(config.embeddings.dim * 4)
  for (let index = 0; index < config.embeddings.dim; index += 1) bytes.writeFloatLE(value, index * 4)
  return bytes
}

function seedRows(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
      salience, pinned, needs_review, first_seen_at, last_seen_at, last_recalled_at, period, embedding_text
    ) VALUES (1, 'guild-fixture', 'user', 'user-fixture', 'hobby', 'tea', 'explicit', 'active', 0.9,
      0.8, 0, 0, 100, 200, ?, 'current', ?)
  `).run(FIXED_NOW, "This person's hobby: tea.")
  db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at)
    VALUES (1, 'channel-fixture', 'explicit', 200)
  `).run()
  db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
      salience, pinned, needs_review, first_seen_at, last_seen_at, period
    ) VALUES (3, 'guild-fixture', 'user', 'user-fixture', 'hobby', 'writing', 'explicit', 'active', 0.8,
      0.4, 1, 0, 50, 100, 'current')
  `).run()
  db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at)
    VALUES (3, 'channel-fixture', 'explicit', 100)
  `).run()
  db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
      salience, pinned, needs_review, first_seen_at, last_seen_at, period
    ) VALUES (4, 'guild-fixture', 'user', 'user-fixture', 'hobby', 'gardening', 'explicit', 'active', 0.9,
      0.8, 0, 0, 80, 200, 'current')
  `).run()
  db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at)
    VALUES (4, 'channel-fixture', 'explicit', 200)
  `).run()
  db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, predicate, value, source_kind, status, confidence, salience, pinned,
      needs_review, expires_at, event_date, first_seen_at, last_seen_at, period
    ) VALUES (2, 'guild-fixture', 'guild', 'upcoming_event', 'picnic', 'human', 'active', 0.9, 0.8, 0,
      0, 1800000000000, '2026-11', 100, 200, 'current')
  `).run()
  db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at)
    VALUES (2, 'channel-fixture', 'human', 200)
  `).run()
  db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, predicate, value, source_kind, status, confidence, salience, pinned,
      needs_review, first_seen_at, last_seen_at, period
    ) VALUES (5, 'guild-fixture', 'guild', 'place', 'game room', 'human', 'active', 0.9, 0.7, 0,
      0, 50, 150, 'current')
  `).run()
  db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at)
    VALUES (5, 'channel-fixture', 'human', 150)
  `).run()

  db.prepare(`
    INSERT INTO memory_episode (
      id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (10, 'guild-fixture', 'channel-fixture', 100, 200, 'A short conversation.', ?, 300, ?, ?, ?)
  `).run(vector(), config.embeddings.model, config.embeddings.dim, config.embeddings.fingerprint)
  db.prepare(`
    INSERT INTO media_digest (
      id, guild_id, content_key, kind, label, summary, digest_json, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (11, 'guild-fixture', 'fixture-key', 'video', 'A fixture clip', 'A short media summary.', '{}', ?, 300,
      ?, ?, ?)
  `).run(vector(), config.embeddings.model, config.embeddings.dim, config.embeddings.fingerprint)
  db.prepare(`
    INSERT INTO media_occurrence (
      digest_id, guild_id, channel_id, message_id, shared_by_user_id, origin, observed_at
    ) VALUES (11, 'guild-fixture', 'channel-fixture', 'message-fixture', 'user-fixture', 'link', 300)
  `).run()
}

function seedReplayTurn(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id)
    VALUES ('channel-fixture', 'user', 'Fixture User', 'tea and picnic', ?, 'user-fixture')
  `).run(FIXED_NOW)
  db.prepare(`
    INSERT INTO response_events (
      guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
      retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
    ) VALUES ('guild-fixture', 'channel-fixture', 'user-fixture', 'message', 'playful', 'ok', 'reply',
      0, 0, 0, 0, 0, 0, 0, ?)
  `).run(FIXED_NOW)
}

const PRIVACY_CHANNELS = [
  ['zhere', SCOPE.channelId],
  ['zpublic', 'channel-public'],
  ['zprivate', 'channel-private']
] as const

/** One row of every kind per channel, plus a fact with no evidence and a digest with no share. */
function seedPrivacyRows(): void {
  const db = getDb()
  const fact = db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
      salience, pinned, needs_review, first_seen_at, last_seen_at, period
    ) VALUES (?, 'guild-fixture', ?, ?, ?, ?, 'explicit', 'active', 0.9, 0.5, 0, 0, 100, 200, 'current')
  `)
  const evidence = db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (?, ?, 'explicit', 200)
  `)
  const episode = db.prepare(`
    INSERT INTO memory_episode (
      id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, 'guild-fixture', ?, 100, ?, ?, ?, 300, ?, ?, ?)
  `)
  const digest = db.prepare(`
    INSERT INTO media_digest (
      id, guild_id, content_key, kind, label, summary, digest_json, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, 'guild-fixture', ?, 'video', ?, ?, '{}', ?, 300, ?, ?, ?)
  `)
  const share = db.prepare(`
    INSERT INTO media_occurrence (digest_id, guild_id, channel_id, message_id, shared_by_user_id, origin, observed_at)
    VALUES (?, 'guild-fixture', ?, ?, 'user-fixture', 'link', 300)
  `)
  const { model, dim, fingerprint } = config.embeddings
  PRIVACY_CHANNELS.forEach(([label, channelId], index) => {
    fact.run(100 + index, 'user', 'user-fixture', 'hobby', `${label} tea`)
    evidence.run(100 + index, channelId)
    fact.run(200 + index, 'guild', null, 'place', `${label} room`)
    evidence.run(200 + index, channelId)
    episode.run(300 + index, channelId, 200 + index, `${label} episode.`, vector(), model, dim, fingerprint)
    digest.run(400 + index, `${label}-key`, `${label} clip`, `${label} media.`, vector(), model, dim, fingerprint)
    share.run(400 + index, channelId, `message-${label}`)
  })
  fact.run(110, 'user', 'user-fixture', 'hobby', 'zunknown tea')
  digest.run(410, 'zunshared-key', 'zunshared clip', 'zunshared media.', vector(), model, dim, fingerprint)
}

async function renderAllBlocks(message: string) {
  const query = Array.from({ length: config.embeddings.dim }, () => 0.25)
  const people = retrieveForTurn({
    guildId: SCOPE.guildId,
    speakerId: 'user-fixture',
    participantIds: [],
    message,
    scope: SCOPE
  })
  const peopleEnvelope = buildFactsEnvelope(people.entries)
  return {
    people: peopleEnvelope ? `## What You Remember About People In This Channel\n${peopleEnvelope}` : '',
    guild: formatGuildFactsBlock(retrieveGuildFacts(SCOPE.guildId, FIXED_NOW, SCOPE).facts),
    episodes: buildEpisodeRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
    media: buildMediaRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
    recallUser: await recallUser({
      guild_id: SCOPE.guildId,
      user_id: 'user-fixture',
      message,
      channel_id: SCOPE.channelId
    })
  }
}

describe('memory item readers', () => {
  beforeEach(() => {
    previousStore = memory.store
    previousPrivacy = memory.privacy
    process.env.ROKABOT_DB_PATH = ':memory:'
  })

  afterEach(() => {
    memory.store = previousStore
    memory.privacy = previousPrivacy
    vi.useRealTimers()
    resetChannelVisibilityForTest()
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('renders every recall block and recall_user byte-identically from either store', () => {
    seedRows()
    const db = getDb()
    migrateMemoryItems(db)
    expect(
      db
        .prepare(`
        SELECT claim.last_recalled_at AS legacy, item.last_recalled_at AS item
        FROM memory_claim claim JOIN memory_item item
          ON item.legacy_table = 'memory_claim' AND item.legacy_id = claim.id
      `)
        .get()
    ).toEqual({ legacy: FIXED_NOW, item: FIXED_NOW })
    const message = 'tea and picnic'
    const userIds = ['user-fixture']

    const legacyTurn = selectForTurn(
      readTurnSnapshot(
        { guildId: SCOPE.guildId, speakerId: 'user-fixture', participantIds: [], message, scope: SCOPE },
        userIds
      ),
      { speakerId: 'user-fixture', participantIds: [], message },
      FIXED_NOW
    )
    const itemTurn = selectForTurn(
      readItemTurnSnapshot(
        db,
        { guildId: SCOPE.guildId, speakerId: 'user-fixture', participantIds: [], message, scope: SCOPE },
        userIds
      ),
      { speakerId: 'user-fixture', participantIds: [], message },
      FIXED_NOW
    )
    const peopleBlock = (entries: typeof legacyTurn.entries) => {
      const envelope = buildFactsEnvelope(entries)
      return envelope ? `## What You Remember About People In This Channel\n${envelope}` : ''
    }
    expect(peopleBlock(itemTurn.entries)).toBe(peopleBlock(legacyTurn.entries))

    const legacyGuild = selectGuildFacts(readGuildFacts(SCOPE.guildId, FIXED_NOW, SCOPE), FIXED_NOW)
    const itemGuild = selectGuildFacts(readItemGuildFacts(db, SCOPE.guildId, FIXED_NOW, SCOPE), FIXED_NOW)
    expect(formatGuildFactsBlock(itemGuild.facts)).toBe(formatGuildFactsBlock(legacyGuild.facts))

    const query = Array.from({ length: config.embeddings.dim }, () => 0.25)
    const legacyEpisodes = selectEpisodes(readRecallableEpisodes(SCOPE.guildId, SCOPE), query)
    const itemEpisodes = selectEpisodes(readItemRecallableEpisodes(db, SCOPE.guildId, SCOPE), query)
    const legacyEpisodeBlock = formatEpisodeRecallBlock(
      selectEpisodesWithinBudget(legacyEpisodes, config.memory.episodeRecallK, config.memory.episodeTokenBudget)
    )
    const itemEpisodeBlock = formatEpisodeRecallBlock(
      selectEpisodesWithinBudget(itemEpisodes, config.memory.episodeRecallK, config.memory.episodeTokenBudget)
    )
    expect(itemEpisodeBlock).toBe(legacyEpisodeBlock)

    const legacyMedia = selectMedia(readRecallableMedia(SCOPE.guildId, SCOPE), query)
    const itemMedia = selectMedia(readItemMediaCandidates(db, SCOPE.guildId, SCOPE), query)
    expect(formatMediaRecallBlock(itemMedia)).toBe(formatMediaRecallBlock(legacyMedia))

    const legacySubject = selectForSubject(
      readSubjectSnapshot(SCOPE.guildId, 'user-fixture', message, SCOPE),
      message,
      15,
      FIXED_NOW
    )
    const itemSubject = selectForSubject(
      readItemSubjectSnapshot(db, SCOPE.guildId, 'user-fixture', message, SCOPE),
      message,
      15,
      FIXED_NOW
    )
    expect(formatRecallUserFacts(itemSubject)).toEqual(formatRecallUserFacts(legacySubject))
    expect(formatMediaRecallBlock(legacyMedia)).toBe(
      buildMediaRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE })
    )
  })

  it('routes all four builders and recall_user through items when memory.store is item', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    seedRows()
    const db = getDb()
    migrateMemoryItems(db)
    configureMemoryItemProjectionTriggers(db, 'dual')
    const query = Array.from({ length: config.embeddings.dim }, () => 0.25)
    const message = 'tea and picnic'
    const render = async () => {
      const people = retrieveForTurn({
        guildId: SCOPE.guildId,
        speakerId: 'user-fixture',
        participantIds: [],
        message,
        scope: SCOPE
      })
      const peopleEnvelope = buildFactsEnvelope(people.entries)
      return {
        people: peopleEnvelope ? `## What You Remember About People In This Channel\n${peopleEnvelope}` : '',
        guild: formatGuildFactsBlock(retrieveGuildFacts(SCOPE.guildId, FIXED_NOW, SCOPE).facts),
        episodes: buildEpisodeRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
        media: buildMediaRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
        recallUser: await recallUser({
          guild_id: SCOPE.guildId,
          user_id: 'user-fixture',
          message,
          channel_id: SCOPE.channelId
        })
      }
    }

    memory.store = 'dual'
    const legacy = await render()
    configureMemoryItemProjectionTriggers(db, 'legacy')
    db.prepare("UPDATE memory_claim SET value = 'changed legacy value' WHERE id = 1").run()
    db.prepare("UPDATE memory_claim SET value = 'changed guild value' WHERE id = 2").run()
    db.prepare("UPDATE memory_episode SET summary = 'changed episode value' WHERE id = 10").run()
    db.prepare("UPDATE media_digest SET summary = 'changed media value' WHERE id = 11").run()

    memory.store = 'item'
    const item = await render()

    expect(item).toEqual(legacy)
    expect(JSON.stringify(item)).not.toContain('changed legacy value')
    expect(JSON.stringify(item)).not.toContain('changed guild value')
    expect(JSON.stringify(item)).not.toContain('changed episode value')
    expect(JSON.stringify(item)).not.toContain('changed media value')
  })

  it('serves no memory from the item readers when privacy is off', async () => {
    seedRows()
    migrateMemoryItems(getDb())
    memory.privacy = 'off'
    const query = Array.from({ length: config.embeddings.dim }, () => 0.25)
    const render = async () => {
      const people = retrieveForTurn({
        guildId: SCOPE.guildId,
        speakerId: 'user-fixture',
        participantIds: [],
        message: 'tea and picnic',
        scope: SCOPE
      })
      return {
        people: people.entries,
        guild: retrieveGuildFacts(SCOPE.guildId, FIXED_NOW, SCOPE).facts,
        episodes: buildEpisodeRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
        media: buildMediaRecallBlock({ guildId: SCOPE.guildId, queryEmbedding: query, scope: SCOPE }),
        recallUser: await recallUser({
          guild_id: SCOPE.guildId,
          user_id: 'user-fixture',
          message: 'tea and picnic',
          channel_id: SCOPE.channelId
        })
      }
    }

    memory.store = 'dual'
    const legacy = await render()
    memory.store = 'item'
    const item = await render()

    expect(item).toEqual(legacy)
    expect(item).toEqual({
      people: [],
      guild: [],
      episodes: '',
      media: '',
      recallUser: { facts: "I don't have any notes about this person yet.", factCount: 0 }
    })
  })

  it.each(['balanced', 'strict'] as const)(
    'withholds the same memory from every builder and recall_user on both stores under %s',
    async (privacy) => {
      vi.useFakeTimers()
      vi.setSystemTime(FIXED_NOW)
      registerChannelVisibility({
        visibility: (channelId) => (channelId === 'channel-public' ? 'public' : 'private'),
        parentOf: () => null
      })
      seedPrivacyRows()
      migrateMemoryItems(getDb())
      memory.privacy = privacy

      memory.store = 'dual'
      const legacy = await renderAllBlocks('tea')
      memory.store = 'item'
      const item = await renderAllBlocks('tea')

      expect(item).toEqual(legacy)
      const text = JSON.stringify(item)
      for (const value of ['zhere tea', 'zhere room', 'zhere episode.', 'zhere clip']) expect(text).toContain(value)
      expect(text).not.toContain('zprivate')
      expect(text).not.toContain('zunshared')
      if (privacy === 'balanced') {
        for (const value of ['zpublic tea', 'zpublic room', 'zpublic episode.', 'zpublic clip', 'zunknown tea']) {
          expect(text).toContain(value)
        }
      } else {
        expect(text).not.toContain('zpublic')
        expect(text).not.toContain('zunknown')
      }
    }
  )

  it('limits the keyword boost set before the privacy filter, as the legacy search does', () => {
    const db = getDb()
    const insert = db.prepare(`
      INSERT INTO memory_claim (
        id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
        salience, pinned, needs_review, first_seen_at, last_seen_at, period
      ) VALUES (?, 'guild-fixture', 'user', ?, 'hobby', ?, 'explicit', 'active', 0.9, ?, 0, 0, 100, 200, 'current')
    `)
    for (let id = 1; id <= 45; id += 1)
      insert.run(id, `user-${id % 3}`, `tea ${'blend '.repeat(id % 4)}${id}`, id / 100)
    migrateMemoryItems(db)
    const userIds = ['user-0', 'user-1', 'user-2']
    const input = {
      guildId: SCOPE.guildId,
      speakerId: 'user-0',
      participantIds: [],
      message: 'tea blend',
      scope: SCOPE
    }
    memory.store = 'dual'

    const legacy = [...readTurnSnapshot(input, userIds).ftsIds].sort((left, right) => left - right)
    const item = [...readItemTurnSnapshot(db, input, userIds).ftsIds].sort((left, right) => left - right)

    expect(legacy).toHaveLength(config.memory.maxClaimsPerTurn * 3)
    expect(item).toEqual(legacy)
  })

  it('does not expose vectors with a wrong space, size, norm, finite values, or text hash', () => {
    const text = 'A rendered summary.'
    const textHash = createHash('sha256').update(text).digest('hex')
    const valid = {
      fingerprint: config.embeddings.fingerprint,
      model_id: config.embeddings.model,
      dim: config.embeddings.dim,
      renderer: 'summary' as const,
      renderer_version: 1,
      text_hash: textHash,
      vector: vector()
    }
    expect(decodeMemoryItemEmbedding(valid, text, 'summary')).toHaveLength(config.embeddings.dim)
    expect(decodeMemoryItemEmbedding({ ...valid, fingerprint: 'wrong:space' }, text, 'summary')).toBeNull()
    expect(
      decodeMemoryItemEmbedding({ ...valid, vector: Buffer.alloc(config.embeddings.dim * 4 - 1) }, text, 'summary')
    ).toBeNull()
    expect(
      decodeMemoryItemEmbedding({ ...valid, vector: Buffer.alloc(config.embeddings.dim * 4) }, text, 'summary')
    ).toBeNull()
    const nonFinite = Buffer.alloc(config.embeddings.dim * 4)
    nonFinite.writeFloatLE(Number.NaN)
    expect(decodeMemoryItemEmbedding({ ...valid, vector: nonFinite }, text, 'summary')).toBeNull()
    expect(decodeMemoryItemEmbedding({ ...valid, text_hash: 'f'.repeat(64) }, text, 'summary')).toBeNull()
  })

  it('replays mapped guild turns with counts and hashes, then fails when blocks differ', () => {
    seedRows()
    const db = getDb()
    migrateMemoryItems(db)
    seedReplayTurn()

    const first = replayMemoryItems()

    expect(first).toMatchObject({
      status: 'ok',
      turns_replayed: 1,
      unmapped_recent_user_turns: 0,
      turns_with_query_vector: 1,
      vector_blocks_skipped: 0,
      mismatch_count: 0
    })
    expect(first.block_hashes.item.people.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first)).not.toContain('tea')

    db.prepare(
      "UPDATE memory_item SET content = 'different summary' WHERE legacy_table = 'memory_claim' AND legacy_id = 1"
    ).run()

    const second = replayMemoryItems()

    expect(second.status).toBe('mismatch')
    expect(second.mismatch_count).toBeGreaterThan(0)
  })
})
