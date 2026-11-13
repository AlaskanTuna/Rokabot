import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { replayMemoryItems } from '../../../../scripts/replay-memory-items.js'
import { config } from '../../../config.js'
import { closeDb, getDb } from '../../../storage/database.js'
import { migrateMemoryItems } from '../../../storage/memoryItemBackfill.js'
import { decodeMemoryItemEmbedding } from '../../../storage/memoryItemReadStore.js'
import {
  readItemGuildFacts,
  readItemMediaCandidates,
  readItemRecallableEpisodes,
  readItemSubjectSnapshot,
  readItemTurnSnapshot
} from '../../../storage/memoryItemReadStore.js'
import { buildFactsEnvelope } from '../../promptSafety.js'
import { formatRecallUserFacts } from '../../tools/recallUser.js'
import { formatGuildFactsBlock } from '../../turnContext.js'
import {
  formatEpisodeRecallBlock,
  readRecallableEpisodes,
  selectEpisodes,
  selectEpisodesWithinBudget
} from '../episodeRetriever.js'
import { buildMediaRecallBlock, formatMediaRecallBlock, readRecallableMedia, selectMedia } from '../mediaRecall.js'
import {
  readGuildFacts,
  readSubjectSnapshot,
  readTurnSnapshot,
  selectForSubject,
  selectForTurn,
  selectGuildFacts
} from '../retriever.js'

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

describe('memory item readers', () => {
  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
  })

  afterEach(() => {
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
