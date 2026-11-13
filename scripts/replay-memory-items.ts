import { createHash } from 'node:crypto'
import {
  formatEpisodeRecallBlock,
  readRecallableEpisodes,
  selectEpisodes,
  selectEpisodesWithinBudget
} from '../src/agent/memory/episodeRetriever.js'
import { formatMediaRecallBlock, readRecallableMedia, selectMedia } from '../src/agent/memory/mediaRecall.js'
import {
  readItemGuildFacts,
  readItemMediaCandidates,
  readItemRecallableEpisodes,
  readItemSubjectSnapshot,
  readItemTurnSnapshot
} from '../src/agent/memory/memoryItems.js'
import type { RecallScope } from '../src/agent/memory/privacy.js'
import {
  readGuildFacts,
  readSubjectSnapshot,
  readTurnSnapshot,
  selectForSubject,
  selectForTurn,
  selectGuildFacts
} from '../src/agent/memory/retriever.js'
import { buildFactsEnvelope } from '../src/agent/promptSafety.js'
import { formatRecallUserFacts } from '../src/agent/tools/recallUser.js'
import { formatGuildFactsBlock } from '../src/agent/turnContext.js'
import { config } from '../src/config.js'
import { closeDb, getDb } from '../src/storage/database.js'
import { listMediaRecallCandidates } from '../src/storage/mediaDigestStore.js'
import type { EpisodeEmbedding } from '../src/storage/memoryEpisodeStore.js'
import { listEpisodesForGuild } from '../src/storage/memoryEpisodeStore.js'
import { getClaimEmbeddings } from '../src/storage/memoryRecallStore.js'
import { logger } from '../src/utils/logger.js'

const MAX_TURNS = 150
const FIXED_NOW = Date.UTC(2026, 10, 13)
const BLOCK_NAMES = ['people', 'guild', 'episodes', 'media', 'recall_user'] as const
type BlockName = (typeof BLOCK_NAMES)[number]

type ReplayTurn = Readonly<{
  guildId: string
  channelId: string
  userId: string
  message: string
  timestamp: number
  rowId: number
}>

type BlockStats = { non_empty_blocks: number; hash: ReturnType<typeof createHash> }
type StoreStats = Record<BlockName, BlockStats>

function createStoreStats(): StoreStats {
  return Object.fromEntries(
    BLOCK_NAMES.map((name) => [name, { non_empty_blocks: 0, hash: createHash('sha256') }])
  ) as StoreStats
}

function recordBlock(stats: StoreStats, name: BlockName, text: string): void {
  if (text.length === 0) return
  stats[name].non_empty_blocks += 1
  stats[name].hash.update(text)
}

function serializedStats(stats: StoreStats) {
  return Object.fromEntries(
    BLOCK_NAMES.map((name) => [
      name,
      { non_empty_blocks: stats[name].non_empty_blocks, sha256: stats[name].hash.digest('hex') }
    ])
  )
}

function recentGuildTurns(): ReplayTurn[] {
  const database = getDb()
  const rows = database
    .prepare(`
      WITH channel_guild AS (
        SELECT channel_id, guild_id
        FROM (
          SELECT channel_id, guild_id,
                 ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC, id DESC) AS position
          FROM response_events
          WHERE guild_id != 'global' AND guild_id NOT LIKE 'dm:%'
        )
        WHERE position = 1
      )
      SELECT history.rowid AS row_id, history.channel_id, history.user_id, history.content, history.timestamp,
             channel_guild.guild_id
      FROM session_history history
      JOIN channel_guild ON channel_guild.channel_id = history.channel_id
      WHERE history.role = 'user' AND history.user_id IS NOT NULL
      ORDER BY history.timestamp DESC, history.rowid DESC
      LIMIT ?
    `)
    .all(MAX_TURNS) as Array<{
    row_id: number
    channel_id: string
    user_id: string
    content: string
    timestamp: number
    guild_id: string
  }>
  return rows.reverse().map((row) => ({
    guildId: row.guild_id,
    channelId: row.channel_id,
    userId: row.user_id,
    message: row.content,
    timestamp: row.timestamp,
    rowId: row.row_id
  }))
}

function recentUnmappedTurnCount(): number {
  return Number(
    (
      getDb()
        .prepare(`
          WITH recent AS (
            SELECT channel_id
            FROM session_history
            WHERE role = 'user' AND user_id IS NOT NULL
            ORDER BY timestamp DESC, rowid DESC
            LIMIT ?
          ), known_channels AS (SELECT DISTINCT channel_id FROM response_events)
          SELECT COUNT(*) AS count FROM recent
          LEFT JOIN known_channels USING (channel_id)
          WHERE known_channels.channel_id IS NULL
        `)
        .get(MAX_TURNS) as { count: number }
    ).count
  )
}

function participantsAtTurn(turn: ReplayTurn): string[] {
  const rows = getDb()
    .prepare(`
      SELECT user_id FROM session_history
      WHERE channel_id = ? AND role = 'user' AND user_id IS NOT NULL AND timestamp <= ?
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `)
    .all(turn.channelId, turn.timestamp, config.session.windowSize) as Array<{ user_id: string }>
  return [...new Set(rows.map(({ user_id }) => user_id).filter((id) => id !== turn.userId))].slice(
    0,
    config.memory.recentParticipantLimit
  )
}

function queryVectorForGuild(guildId: string): EpisodeEmbedding | null {
  const episode = listEpisodesForGuild(guildId).find((row) => row.embedding !== null)
  if (episode?.embedding) return episode.embedding

  const media = listMediaRecallCandidates(guildId).find((row) => row.embedding.length === config.embeddings.dim)
  if (media) return media.embedding

  const claim = getDb()
    .prepare('SELECT id FROM memory_claim WHERE guild_id = ? AND embedding IS NOT NULL ORDER BY id DESC LIMIT 1')
    .get(guildId) as { id: number } | undefined
  if (!claim) return null
  return getClaimEmbeddings([claim.id]).get(claim.id) ?? null
}

function blockTexts(turn: ReplayTurn, itemStore: boolean, query: EpisodeEmbedding | null) {
  const database = getDb()
  const scope: RecallScope = { guildId: turn.guildId, channelId: turn.channelId }
  const participantIds = participantsAtTurn(turn)
  const input = {
    guildId: turn.guildId,
    speakerId: turn.userId,
    participantIds,
    message: turn.message,
    scope
  }
  const userIds = [turn.userId, ...participantIds]
  const turnSnapshot = itemStore ? readItemTurnSnapshot(database, input, userIds) : readTurnSnapshot(input, userIds)
  const retrieval = selectForTurn(turnSnapshot, input, FIXED_NOW)
  const envelope = buildFactsEnvelope(retrieval.entries)
  const people = envelope ? `\n\n## What You Remember About People In This Channel\n${envelope}` : ''

  const guildFacts = selectGuildFacts(
    itemStore
      ? readItemGuildFacts(database, turn.guildId, FIXED_NOW, scope)
      : readGuildFacts(turn.guildId, FIXED_NOW, scope),
    FIXED_NOW
  )
  const guild = formatGuildFactsBlock(guildFacts.facts)

  const queryEmbedding = query ?? []
  const episodes = selectEpisodes(
    itemStore ? readItemRecallableEpisodes(database, turn.guildId, scope) : readRecallableEpisodes(turn.guildId, scope),
    queryEmbedding
  )
  const episodeBlock = formatEpisodeRecallBlock(
    selectEpisodesWithinBudget(episodes, config.memory.episodeRecallK, config.memory.episodeTokenBudget)
  )
  const media = selectMedia(
    itemStore ? readItemMediaCandidates(database, turn.guildId, scope) : readRecallableMedia(turn.guildId, scope),
    queryEmbedding
  )
  const mediaBlock = formatMediaRecallBlock(media)

  const subjectSnapshot = itemStore
    ? readItemSubjectSnapshot(database, turn.guildId, turn.userId, turn.message, scope)
    : readSubjectSnapshot(turn.guildId, turn.userId, turn.message, scope)
  const subjectFacts = selectForSubject(subjectSnapshot, turn.message, 15, FIXED_NOW)
  const recallUser = formatRecallUserFacts(subjectFacts).facts

  return { people, guild, episodes: episodeBlock, media: mediaBlock, recall_user: recallUser }
}

function lastRecalledSnapshotMismatches(): number {
  return Number(
    (
      getDb()
        .prepare(`
          SELECT COUNT(*) AS count
          FROM memory_claim claim
          JOIN memory_item item ON item.legacy_table = 'memory_claim' AND item.legacy_id = claim.id
          WHERE claim.last_recalled_at IS NOT item.last_recalled_at
        `)
        .get() as { count: number }
    ).count
  )
}

export function replayMemoryItems() {
  const turns = recentGuildTurns()
  const legacy = createStoreStats()
  const item = createStoreStats()
  const queryVectors = new Map<string, EpisodeEmbedding | null>()
  let mismatches = lastRecalledSnapshotMismatches()
  let queryVectorUses = 0
  let vectorBlocksSkipped = 0

  for (const turn of turns) {
    if (!queryVectors.has(turn.guildId)) queryVectors.set(turn.guildId, queryVectorForGuild(turn.guildId))
    const query = queryVectors.get(turn.guildId) ?? null
    if (query) queryVectorUses += 1
    else vectorBlocksSkipped += 2

    const legacyBlocks = blockTexts(turn, false, query)
    const itemBlocks = blockTexts(turn, true, query)
    for (const name of BLOCK_NAMES) {
      recordBlock(legacy, name, legacyBlocks[name])
      recordBlock(item, name, itemBlocks[name])
      if (legacyBlocks[name] !== itemBlocks[name]) mismatches += 1
    }
  }

  return {
    status: turns.length === 0 ? 'no_turns' : mismatches === 0 ? 'ok' : 'mismatch',
    turns_replayed: turns.length,
    unmapped_recent_user_turns: recentUnmappedTurnCount(),
    fixed_now: FIXED_NOW,
    vector_query_method: 'stored episode, media, or claim vector stand-ins',
    turns_with_query_vector: queryVectorUses,
    vector_blocks_skipped: vectorBlocksSkipped,
    last_recalled_snapshot_mismatches: lastRecalledSnapshotMismatches(),
    mismatch_count: mismatches,
    block_hashes: { legacy: serializedStats(legacy), item: serializedStats(item) }
  }
}

async function main(): Promise<void> {
  const databasePath = process.argv[2]
  if (!databasePath || process.argv.length > 3) {
    console.error(JSON.stringify({ status: 'failed', usage_error: 1 }))
    process.exitCode = 1
    return
  }

  logger.level = 'fatal'
  process.env.ROKABOT_DB_PATH = databasePath
  try {
    const report = replayMemoryItems()
    console.log(JSON.stringify(report))
    if (report.status !== 'ok') process.exitCode = 1
  } catch {
    console.error(JSON.stringify({ status: 'failed', replay_errors: 1 }))
    process.exitCode = 1
  } finally {
    closeDb()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main()
