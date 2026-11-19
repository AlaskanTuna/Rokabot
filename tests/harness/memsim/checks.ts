import type Database from 'better-sqlite3'
import { embedEpisodeText } from '../../../src/agent/memory/episodeEmbeddings.js'
import {
  formatEpisodeRecallBlock,
  readRecallableEpisodes,
  selectEpisodes,
  selectEpisodesWithinBudget
} from '../../../src/agent/memory/episodeRetriever.js'
import { formatMediaRecallBlock, readRecallableMedia, selectMedia } from '../../../src/agent/memory/mediaRecall.js'
import {
  readItemGuildFacts,
  readItemMediaCandidates,
  readItemRecallableEpisodes,
  readItemSubjectSnapshot,
  readItemTurnSnapshot
} from '../../../src/agent/memory/memoryItems.js'
import {
  readGuildFacts,
  readSubjectSnapshot,
  readTurnSnapshot,
  selectForSubject,
  selectForTurn,
  selectGuildFacts
} from '../../../src/agent/memory/retriever.js'
import { buildFactsEnvelope } from '../../../src/agent/promptSafety.js'
import { MAX_RECALLED_FACTS, formatRecallUserFacts } from '../../../src/agent/tools/recallUser.js'
import { formatGuildFactsBlock } from '../../../src/agent/turnContext.js'
import { config } from '../../../src/config.js'
import { getMemoryItemDriftCounts } from '../../../src/storage/memoryItemBackfill.js'
import { getMemoryItemNativeIntegrityCounts } from '../../../src/storage/memoryItemIntegrity.js'
import type { BuilderTimingStats, GroundTruthFile, GroundTruthLabel, LabelQualityMetrics } from './types.js'

export const EXPECTED_TRIGGER_WRITERS: readonly string[] = [
  'memoryClaims.appendEvidence',
  'memoryClaims.evictOverflowForAllSubjects',
  'memoryClaims.pruneActiveClaimOverflow',
  'memoryClaims.assertClaim',
  'memoryClaims.activateClaim',
  'memoryClaims.retractClaim',
  'memoryClaims.retireClaim',
  'memoryClaims.pinClaim',
  'memoryClaims.unpinClaim',
  'memoryClaims.replaceActiveClaim',
  'memoryClaims.rejectActiveClaimById',
  'memoryClaims.rejectClaimIdsForSpeaker',
  'memoryClaims.assertGuildClaim',
  'memoryClaims.replaceActiveGuildClaim',
  'memoryClaims.rejectActiveGuildClaimById',
  'memoryClaims.touchRecalled',
  'memoryClaims.pruneStaleClaims',
  'reclassify.moveClaim',
  'reclassify.undoReclassify',
  'reclassify.reclassifyClaims',
  'memoryEpisodeStore.saveMemoryEpisode',
  'memoryEpisodeStore.setEpisodeEmbedding',
  'memoryEpisodeStore.pruneExpiredEpisodes',
  'memoryEpisodeStore.recordOpenEpisodeMessage',
  'memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor',
  'memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts',
  'memoryEpisodeStore.clearSavedOpenEpisodes',
  'mediaDigestStore.saveMediaDigest',
  'mediaDigestStore.recordMediaOccurrence',
  'mediaDigestStore.setMediaDigestEmbedding',
  'mediaDigestStore.pruneExpiredMediaDigests',
  'mediaDigestStore.forgetMediaForUser',
  'memoryRecallStore.setClaimEmbedding'
]

export class WriterTracker {
  private readonly pipeline = new Set<string>()
  private readonly scripted = new Set<string>()

  recordPipeline(name: string): void {
    this.pipeline.add(name)
  }

  recordScripted(name: string): void {
    this.scripted.add(name)
  }

  summary(): {
    expectedWriters: string[]
    firedPipeline: string[]
    firedScripted: string[]
    firedAll: string[]
    missing: string[]
    passed: boolean
  } {
    const firedAll = new Set([...this.pipeline, ...this.scripted])
    const missing = EXPECTED_TRIGGER_WRITERS.filter((writer) => !firedAll.has(writer))
    return {
      expectedWriters: [...EXPECTED_TRIGGER_WRITERS],
      firedPipeline: [...this.pipeline].sort(),
      firedScripted: [...this.scripted].sort(),
      firedAll: [...firedAll].sort(),
      missing,
      passed: missing.length === 0
    }
  }
}

export function installDbAuditTriggers(db: Database.Database, storeMode: 'legacy' | 'dual' | 'item' = 'dual'): void {
  if (storeMode === 'item') {
    installItemDbAuditTriggers(db)
    return
  }

  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS memsim_writer_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      writer TEXT NOT NULL
    );

    DROP TRIGGER IF EXISTS temp.memsim_tr_claim_insert;
    CREATE TEMP TRIGGER memsim_tr_claim_insert AFTER INSERT ON memory_claim BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES (
        CASE WHEN new.subject_kind = 'guild' THEN 'memoryClaims.assertGuildClaim' ELSE 'memoryClaims.assertClaim' END
      );
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_claim_evidence;
    CREATE TEMP TRIGGER memsim_tr_claim_evidence AFTER INSERT ON memory_evidence BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryClaims.appendEvidence');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_claim_update;
    CREATE TEMP TRIGGER memsim_tr_claim_update AFTER UPDATE ON memory_claim BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.activateClaim' WHERE old.status = 'candidate' AND new.status = 'active';

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.pinClaim' WHERE old.pinned = 0 AND new.pinned = 1;

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.unpinClaim' WHERE old.pinned = 1 AND new.pinned = 0;

      INSERT INTO memsim_writer_events(writer)
      SELECT CASE
        WHEN old.status = 'active' AND new.status IN ('rejected', 'superseded') AND new.end_reason = 'superseded' AND new.subject_kind = 'user'
          THEN 'memoryClaims.replaceActiveClaim'
        WHEN old.status = 'active' AND new.status IN ('rejected', 'superseded') AND new.end_reason = 'superseded' AND new.subject_kind = 'guild'
          THEN 'memoryClaims.replaceActiveGuildClaim'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'removed' AND new.subject_kind = 'guild'
          THEN 'memoryClaims.rejectActiveGuildClaimById'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'removed' AND new.subject_kind = 'user'
          THEN 'memoryClaims.rejectActiveClaimById'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'forgotten'
          THEN 'memoryClaims.rejectClaimIdsForSpeaker'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'evicted'
          THEN 'memoryClaims.evictOverflowForAllSubjects'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'retracted'
          THEN 'memoryClaims.retireClaim'
        WHEN old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'reclassified'
          THEN 'reclassify.moveClaim'
      END
      WHERE old.status = 'active' AND new.status IN ('rejected', 'superseded')
        AND new.end_reason IN ('superseded', 'removed', 'forgotten', 'evicted', 'retracted', 'reclassified');

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.pruneStaleClaims'
      WHERE old.status IN ('candidate', 'active') AND new.status = 'rejected' AND new.end_reason IN ('expired', 'self');

      INSERT INTO memsim_writer_events(writer)
      SELECT 'reclassify.undoReclassify'
      WHERE old.status = 'rejected' AND old.end_reason = 'reclassified' AND new.status = 'active' AND new.end_reason IS NULL;

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.retireClaim'
      WHERE old.status = 'active' AND new.status = 'rejected' AND new.end_reason = 'reclassified';

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.touchRecalled'
      WHERE new.last_recalled_at IS NOT old.last_recalled_at AND new.last_recalled_at IS NOT NULL;

      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryRecallStore.setClaimEmbedding'
      WHERE new.embedding IS NOT NULL AND new.embedding IS NOT old.embedding;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_claim_delete;
    CREATE TEMP TRIGGER memsim_tr_claim_delete AFTER DELETE ON memory_claim BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('__internal.claim_deleted');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_ep_insert;
    CREATE TEMP TRIGGER memsim_tr_ep_insert AFTER INSERT ON memory_episode BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.saveMemoryEpisode');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_ep_update;
    CREATE TEMP TRIGGER memsim_tr_ep_update AFTER UPDATE ON memory_episode BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryEpisodeStore.setEpisodeEmbedding'
      WHERE new.embedding IS NOT NULL AND new.embedding IS NOT old.embedding;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_ep_delete;
    CREATE TEMP TRIGGER memsim_tr_ep_delete AFTER DELETE ON memory_episode BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.pruneExpiredEpisodes');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_line;
    CREATE TEMP TRIGGER memsim_tr_open_ep_line AFTER INSERT ON memory_episode_line BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.recordOpenEpisodeMessage');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_queue;
    CREATE TEMP TRIGGER memsim_tr_open_ep_queue AFTER INSERT ON extraction_queue BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_delete;
    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_line_del;
    CREATE TEMP TRIGGER memsim_tr_open_ep_line_del AFTER DELETE ON memory_episode_line BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('__internal.open_ep_line_deleted');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_cursor_upd;
    CREATE TEMP TRIGGER memsim_tr_open_ep_cursor_upd AFTER UPDATE ON memory_episode_cursor BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE
        WHEN old.opened_at IS NOT NULL AND new.opened_at IS NULL THEN '__internal.open_ep_cursor_cleared'
        WHEN new.opened_at IS NOT NULL THEN '__internal.open_ep_cursor_synced'
      END
      WHERE (old.opened_at IS NOT NULL AND new.opened_at IS NULL) OR new.opened_at IS NOT NULL;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_media_insert;
    CREATE TEMP TRIGGER memsim_tr_media_insert AFTER INSERT ON media_digest BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('mediaDigestStore.saveMediaDigest');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_media_occ;
    CREATE TEMP TRIGGER memsim_tr_media_occ AFTER INSERT ON media_occurrence BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('mediaDigestStore.recordMediaOccurrence');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_media_occ_del;
    CREATE TEMP TRIGGER memsim_tr_media_occ_del AFTER DELETE ON media_occurrence BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('mediaDigestStore.forgetMediaForUser');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_media_update;
    CREATE TEMP TRIGGER memsim_tr_media_update AFTER UPDATE ON media_digest BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'mediaDigestStore.setMediaDigestEmbedding'
      WHERE new.embedding IS NOT NULL AND new.embedding IS NOT old.embedding;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_media_delete;
    CREATE TEMP TRIGGER memsim_tr_media_delete AFTER DELETE ON media_digest BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('mediaDigestStore.pruneExpiredMediaDigests');
    END;
  `)
}

function installItemDbAuditTriggers(db: Database.Database): void {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS memsim_writer_events (id INTEGER PRIMARY KEY AUTOINCREMENT, writer TEXT NOT NULL);

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_insert;
    CREATE TEMP TRIGGER memsim_tr_item_insert AFTER INSERT ON memory_item BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES (
        CASE
          WHEN new.kind = 'fact' AND new.subject_kind = 'guild' THEN 'memoryClaims.assertGuildClaim'
          WHEN new.kind = 'fact' THEN 'memoryClaims.assertClaim'
          WHEN new.kind = 'episode' THEN 'memoryEpisodeStore.saveMemoryEpisode'
          WHEN new.kind = 'media' THEN 'mediaDigestStore.saveMediaDigest'
        END
      );
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_update;
    CREATE TEMP TRIGGER memsim_tr_item_update AFTER UPDATE ON memory_item BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.activateClaim' WHERE new.kind = 'fact' AND old.status = 'candidate' AND new.status = 'active';
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.pinClaim' WHERE new.kind = 'fact' AND old.pinned = 0 AND new.pinned = 1;
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.unpinClaim' WHERE new.kind = 'fact' AND old.pinned = 1 AND new.pinned = 0;
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE
        WHEN new.kind = 'fact' AND new.end_reason = 'superseded' AND new.subject_kind = 'user' THEN 'memoryClaims.replaceActiveClaim'
        WHEN new.kind = 'fact' AND new.end_reason = 'superseded' AND new.subject_kind = 'guild' THEN 'memoryClaims.replaceActiveGuildClaim'
        WHEN new.kind = 'fact' AND new.end_reason = 'removed' AND new.subject_kind = 'user' THEN 'memoryClaims.rejectActiveClaimById'
        WHEN new.kind = 'fact' AND new.end_reason = 'removed' AND new.subject_kind = 'guild' THEN 'memoryClaims.rejectActiveGuildClaimById'
        WHEN new.kind = 'fact' AND new.end_reason = 'forgotten' THEN 'memoryClaims.rejectClaimIdsForSpeaker'
        WHEN new.kind = 'fact' AND new.end_reason = 'evicted' THEN 'memoryClaims.evictOverflowForAllSubjects'
        WHEN new.kind = 'fact' AND new.end_reason IN ('retracted', 'reclassified') THEN 'memoryClaims.retireClaim'
      END
      WHERE old.status = 'active' AND new.status IN ('rejected', 'superseded')
        AND new.end_reason IN ('superseded', 'removed', 'forgotten', 'evicted', 'retracted', 'reclassified');
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.pruneStaleClaims'
      WHERE new.kind = 'fact' AND old.status IN ('candidate', 'active') AND new.status = 'rejected'
        AND new.end_reason IN ('expired', 'self');
      INSERT INTO memsim_writer_events(writer)
      SELECT 'reclassify.undoReclassify'
      WHERE new.kind = 'fact' AND old.status = 'rejected' AND old.end_reason = 'reclassified'
        AND new.status = 'active' AND new.end_reason IS NULL;
      INSERT INTO memsim_writer_events(writer)
      SELECT 'reclassify.moveClaim'
      WHERE new.kind = 'fact' AND old.status = 'active' AND new.status IN ('rejected', 'superseded')
        AND new.end_reason = 'reclassified';
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.touchRecalled'
      WHERE new.kind = 'fact' AND new.last_recalled_at IS NOT old.last_recalled_at AND new.last_recalled_at IS NOT NULL;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_evidence;
    CREATE TEMP TRIGGER memsim_tr_item_evidence AFTER INSERT ON memory_item_evidence BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'memoryClaims.appendEvidence'
      WHERE EXISTS (SELECT 1 FROM memory_item WHERE id = new.item_id AND kind = 'fact');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_occurrence;
    CREATE TEMP TRIGGER memsim_tr_item_occurrence AFTER INSERT ON memory_item_occurrence BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'mediaDigestStore.recordMediaOccurrence'
      WHERE new.origin != 'episode' AND EXISTS (SELECT 1 FROM memory_item WHERE id = new.item_id AND kind = 'media');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_occurrence_delete;
    CREATE TEMP TRIGGER memsim_tr_item_occurrence_delete AFTER DELETE ON memory_item_occurrence BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT 'mediaDigestStore.forgetMediaForUser'
      WHERE old.origin != 'episode' AND EXISTS (SELECT 1 FROM memory_item WHERE id = old.item_id AND kind = 'media');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_delete;
    CREATE TEMP TRIGGER memsim_tr_item_delete AFTER DELETE ON memory_item BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE WHEN old.kind = 'episode' THEN 'memoryEpisodeStore.pruneExpiredEpisodes'
                  WHEN old.kind = 'media' THEN 'mediaDigestStore.pruneExpiredMediaDigests' END
      WHERE old.kind IN ('episode', 'media');
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_item_embedding;
    CREATE TEMP TRIGGER memsim_tr_item_embedding AFTER INSERT ON memory_item_embedding BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE item.kind WHEN 'fact' THEN 'memoryRecallStore.setClaimEmbedding'
                            WHEN 'episode' THEN 'memoryEpisodeStore.setEpisodeEmbedding'
                            WHEN 'media' THEN 'mediaDigestStore.setMediaDigestEmbedding' END
      FROM memory_item item WHERE item.id = new.item_id;
    END;
    DROP TRIGGER IF EXISTS temp.memsim_tr_item_embedding_update;
    CREATE TEMP TRIGGER memsim_tr_item_embedding_update AFTER UPDATE ON memory_item_embedding BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE item.kind WHEN 'fact' THEN 'memoryRecallStore.setClaimEmbedding'
                            WHEN 'episode' THEN 'memoryEpisodeStore.setEpisodeEmbedding'
                            WHEN 'media' THEN 'mediaDigestStore.setMediaDigestEmbedding' END
      FROM memory_item item WHERE item.id = new.item_id;
    END;

    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_line;
    CREATE TEMP TRIGGER memsim_tr_open_ep_line AFTER INSERT ON memory_episode_line BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.recordOpenEpisodeMessage');
    END;
    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_queue;
    CREATE TEMP TRIGGER memsim_tr_open_ep_queue AFTER INSERT ON extraction_queue BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor');
    END;
    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_line_del;
    CREATE TEMP TRIGGER memsim_tr_open_ep_line_del AFTER DELETE ON memory_episode_line BEGIN
      INSERT INTO memsim_writer_events(writer) VALUES ('__internal.open_ep_line_deleted');
    END;
    DROP TRIGGER IF EXISTS temp.memsim_tr_open_ep_cursor_upd;
    CREATE TEMP TRIGGER memsim_tr_open_ep_cursor_upd AFTER UPDATE ON memory_episode_cursor BEGIN
      INSERT INTO memsim_writer_events(writer)
      SELECT CASE
        WHEN old.opened_at IS NOT NULL AND new.opened_at IS NULL THEN '__internal.open_ep_cursor_cleared'
        WHEN new.opened_at IS NOT NULL THEN '__internal.open_ep_cursor_synced'
      END
      WHERE (old.opened_at IS NOT NULL AND new.opened_at IS NULL) OR new.opened_at IS NOT NULL;
    END;
  `)
}

export function collectDbAuditWriters(
  db: Database.Database,
  tracker: WriterTracker,
  source: 'pipeline' | 'scripted' = 'pipeline'
): Set<string> {
  const rows = db.prepare('SELECT DISTINCT writer FROM memsim_writer_events WHERE writer IS NOT NULL').all() as Array<{
    writer: string
  }>
  const seen = new Set<string>()
  for (const row of rows) {
    seen.add(row.writer)
    if (!row.writer.startsWith('__internal.')) {
      if (source === 'pipeline') {
        tracker.recordPipeline(row.writer)
      } else {
        tracker.recordScripted(row.writer)
      }
    }
  }
  db.exec('DELETE FROM memsim_writer_events')
  return seen
}

export const MEMORY_BLOCK_HEADINGS = [
  '## What You Remember About People In This Channel',
  '## Things You Remember About This Server',
  '## Things you remember happening here',
  '## Media You Watched Here Before'
] as const

export function extractMemoryBlocksFromSystemPrompt(systemPrompt: string): {
  memoryBlocksText: string
  headingsFound: string[]
} {
  const headingsSet = new Set<string>(MEMORY_BLOCK_HEADINGS)
  const headingsFound = MEMORY_BLOCK_HEADINGS.filter((heading) => systemPrompt.includes(heading))
  const lines = systemPrompt.split('\n')
  const captured: string[] = []
  let capturing = false

  for (const line of lines) {
    if (headingsSet.has(line)) {
      capturing = true
      captured.push(line)
      continue
    }
    if (capturing) {
      if (
        (line.startsWith('## ') && !headingsSet.has(line)) ||
        line.startsWith("- The current user's Discord ID is ")
      ) {
        capturing = false
        continue
      }
      captured.push(line)
    }
  }

  return {
    memoryBlocksText: captured.join('\n').trim(),
    headingsFound
  }
}

export function countPrivateOnlyItemsInDb(
  db: Database.Database,
  isPrivateChannel: (channelId: string | null) => boolean,
  storeMode: 'legacy' | 'dual' | 'item' = config.memory.store
): number {
  const claimRows = (
    storeMode === 'item'
      ? db
          .prepare(
            `SELECT c.id AS id, e.channel_id AS channel_id FROM memory_item c
           LEFT JOIN memory_item_evidence e ON e.item_id = c.id
           WHERE c.kind = 'fact' AND c.status IN ('active', 'candidate')`
          )
          .all()
      : db
          .prepare(
            `SELECT c.id AS id, e.channel_id AS channel_id FROM memory_claim c
           LEFT JOIN memory_evidence e ON e.claim_id = c.id
           WHERE c.status IN ('active', 'candidate')`
          )
          .all()
  ) as Array<{ id: number; channel_id: string | null }>

  const claimChannels = new Map<number, Array<string | null>>()
  for (const row of claimRows) {
    const list = claimChannels.get(row.id) ?? []
    if (row.channel_id !== null) list.push(row.channel_id)
    claimChannels.set(row.id, list)
  }
  let privateFacts = 0
  for (const channels of claimChannels.values()) {
    if (channels.length > 0 && channels.every((ch) => isPrivateChannel(ch))) privateFacts += 1
  }

  const episodeRows = (
    storeMode === 'item'
      ? db
          .prepare(
            `SELECT item.id, occurrence.channel_id FROM memory_item item
           LEFT JOIN memory_item_occurrence occurrence
             ON occurrence.item_id = item.id AND occurrence.origin = 'episode'
           WHERE item.kind = 'episode'`
          )
          .all()
      : db.prepare('SELECT id, channel_id FROM memory_episode').all()
  ) as Array<{
    id: number
    channel_id: string | null
  }>
  const privateEpisodes = episodeRows.filter((row) => isPrivateChannel(row.channel_id)).length

  const mediaRows = (
    storeMode === 'item'
      ? db
          .prepare(
            `SELECT m.id AS id, o.channel_id AS channel_id FROM memory_item m
           LEFT JOIN memory_item_occurrence o ON o.item_id = m.id AND o.origin != 'episode'
           WHERE m.kind = 'media'`
          )
          .all()
      : db
          .prepare(
            `SELECT m.id AS id, o.channel_id AS channel_id FROM media_digest m
           LEFT JOIN media_occurrence o ON o.digest_id = m.id`
          )
          .all()
  ) as Array<{ id: number; channel_id: string | null }>
  const mediaChannels = new Map<number, Array<string | null>>()
  for (const row of mediaRows) {
    const list = mediaChannels.get(row.id) ?? []
    if (row.channel_id !== null) list.push(row.channel_id)
    mediaChannels.set(row.id, list)
  }
  let privateMedia = 0
  for (const channels of mediaChannels.values()) {
    if (channels.length > 0 && channels.every((ch) => isPrivateChannel(ch))) privateMedia += 1
  }

  return privateFacts + privateEpisodes + privateMedia
}

function sameLegacyIdList(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

export type BuilderKey = 'userFacts' | 'guildFacts' | 'episodes' | 'media' | 'recallUser'

export interface ParityTurnResult {
  mismatches: string[]
  legacyUserFactsBlock: string
  legacyGuildFactsBlock: string
  legacyEpisodesBlock: string
  legacyMediaBlock: string
  legacyRecallBlock: string
  itemUserFactsBlock: string
  itemGuildFactsBlock: string
  itemEpisodesBlock: string
  itemMediaBlock: string
  itemRecallBlock: string
  timings: {
    legacy: Record<BuilderKey, number>
    item: Record<BuilderKey, number>
  }
}

export async function runPhase4ParityCheck(
  db: Database.Database,
  input: {
    guildId: string
    channelId: string
    speakerId: string
    message: string
    mentionedUserIds: string[]
    recentUserIds: string[]
    now: number
    includeEpisodeRecall: boolean
    storeMode: 'legacy' | 'dual' | 'item'
  }
): Promise<ParityTurnResult> {
  const scope = { guildId: input.guildId, channelId: input.channelId }
  const participantIds = [
    ...new Set([input.speakerId, ...input.mentionedUserIds, ...input.recentUserIds].filter((id) => Boolean(id)))
  ]
  const turnInput = {
    guildId: input.guildId,
    speakerId: input.speakerId,
    participantIds,
    message: input.message,
    scope
  }

  const queryEmbedding = input.includeEpisodeRecall
    ? await embedEpisodeText({ text: input.message, role: 'RETRIEVAL_QUERY' })
    : undefined

  // User Facts
  const t0 = performance.now()
  const legacyUserSnap = readTurnSnapshot(turnInput, participantIds)
  const legacyUserSelected = selectForTurn(legacyUserSnap, turnInput, input.now)
  const legacyUserFactsBlock = buildFactsEnvelope(legacyUserSelected.entries)
  const legacyUserMs = performance.now() - t0

  const t1 = performance.now()
  const itemUserSnap = readItemTurnSnapshot(db, turnInput, participantIds)
  const itemUserSelected = selectForTurn(itemUserSnap, turnInput, input.now)
  const itemUserFactsBlock = buildFactsEnvelope(itemUserSelected.entries)
  const itemUserMs = performance.now() - t1

  // Guild Facts
  const t2 = performance.now()
  const legacyGuildRaw = readGuildFacts(input.guildId, input.now, scope)
  const legacyGuildSelected = selectGuildFacts(legacyGuildRaw, input.now)
  const legacyGuildFactsBlock = formatGuildFactsBlock(legacyGuildSelected.facts)
  const legacyGuildMs = performance.now() - t2

  const t3 = performance.now()
  const itemGuildRaw = readItemGuildFacts(db, input.guildId, input.now, scope)
  const itemGuildSelected = selectGuildFacts(itemGuildRaw, input.now)
  const itemGuildFactsBlock = formatGuildFactsBlock(itemGuildSelected.facts)
  const itemGuildMs = performance.now() - t3

  // Episodes
  const t4 = performance.now()
  const legacyEpisodesRaw = readRecallableEpisodes(input.guildId, scope)
  const legacyEpSelected = queryEmbedding
    ? selectEpisodesWithinBudget(
        selectEpisodes(legacyEpisodesRaw, queryEmbedding.values),
        config.memory.episodeRecallK,
        config.memory.episodeTokenBudget
      )
    : []
  const legacyEpisodesBlock = formatEpisodeRecallBlock(legacyEpSelected)
  const legacyEpMs = performance.now() - t4

  const t5 = performance.now()
  const itemEpisodesRaw = readItemRecallableEpisodes(db, input.guildId, scope)
  const itemEpSelected = queryEmbedding
    ? selectEpisodesWithinBudget(
        selectEpisodes(itemEpisodesRaw, queryEmbedding.values),
        config.memory.episodeRecallK,
        config.memory.episodeTokenBudget
      )
    : []
  const itemEpisodesBlock = formatEpisodeRecallBlock(itemEpSelected)
  const itemEpMs = performance.now() - t5

  // Media
  const t6 = performance.now()
  const legacyMediaRaw = readRecallableMedia(input.guildId, scope)
  const legacyMediaSelected = queryEmbedding ? selectMedia(legacyMediaRaw, queryEmbedding.values) : []
  const legacyMediaBlock = formatMediaRecallBlock(legacyMediaSelected)
  const legacyMediaMs = performance.now() - t6

  const t7 = performance.now()
  const itemMediaRaw = readItemMediaCandidates(db, input.guildId, scope)
  const itemMediaSelected = queryEmbedding ? selectMedia(itemMediaRaw, queryEmbedding.values) : []
  const itemMediaBlock = formatMediaRecallBlock(itemMediaSelected)
  const itemMediaMs = performance.now() - t7

  // recall_user
  const t8 = performance.now()
  const legacyRecallSnap = readSubjectSnapshot(input.guildId, input.speakerId, input.message, scope)
  const legacyRecallSelected = selectForSubject(legacyRecallSnap, input.message, MAX_RECALLED_FACTS, input.now)
  const legacyRecallBlock = formatRecallUserFacts(legacyRecallSelected).facts
  const legacyRecallMs = performance.now() - t8

  const t9 = performance.now()
  const itemRecallSnap = readItemSubjectSnapshot(db, input.guildId, input.speakerId, input.message, scope)
  const itemRecallSelected = selectForSubject(itemRecallSnap, input.message, MAX_RECALLED_FACTS, input.now)
  const itemRecallBlock = formatRecallUserFacts(itemRecallSelected).facts
  const itemRecallMs = performance.now() - t9

  const mismatches: string[] = []
  if (input.storeMode === 'dual') {
    if (legacyUserFactsBlock !== itemUserFactsBlock) mismatches.push('userFacts:text')
    if (
      !sameLegacyIdList(
        legacyUserSelected.claims.map((c) => c.claim.id),
        itemUserSelected.claims.map((c) => c.claim.id)
      )
    ) {
      mismatches.push('userFacts:ids')
    }

    if (legacyGuildFactsBlock !== itemGuildFactsBlock) mismatches.push('guildFacts:text')
    if (
      !sameLegacyIdList(
        legacyGuildSelected.facts.map((f) => f.id),
        itemGuildSelected.facts.map((f) => f.id)
      )
    ) {
      mismatches.push('guildFacts:ids')
    }

    if (legacyEpisodesBlock !== itemEpisodesBlock) mismatches.push('episodes:text')
    if (
      !sameLegacyIdList(
        legacyEpSelected.map((e) => e.id),
        itemEpSelected.map((e) => e.id)
      )
    ) {
      mismatches.push('episodes:ids')
    }

    if (legacyMediaBlock !== itemMediaBlock) mismatches.push('media:text')
    if (
      !sameLegacyIdList(
        legacyMediaSelected.map((m) => m.id),
        itemMediaSelected.map((m) => m.id)
      )
    ) {
      mismatches.push('media:ids')
    }

    if (legacyRecallBlock !== itemRecallBlock) mismatches.push('recallUser:text')
    if (
      !sameLegacyIdList(
        legacyRecallSelected.map((c) => c.claim.id),
        itemRecallSelected.map((c) => c.claim.id)
      )
    ) {
      mismatches.push('recallUser:ids')
    }
  }

  return {
    mismatches,
    legacyUserFactsBlock,
    legacyGuildFactsBlock,
    legacyEpisodesBlock,
    legacyMediaBlock,
    legacyRecallBlock,
    itemUserFactsBlock,
    itemGuildFactsBlock,
    itemEpisodesBlock,
    itemMediaBlock,
    itemRecallBlock,
    timings: {
      legacy: {
        userFacts: legacyUserMs,
        guildFacts: legacyGuildMs,
        episodes: legacyEpMs,
        media: legacyMediaMs,
        recallUser: legacyRecallMs
      },
      item: {
        userFacts: itemUserMs,
        guildFacts: itemGuildMs,
        episodes: itemEpMs,
        media: itemMediaMs,
        recallUser: itemRecallMs
      }
    }
  }
}

export function checkIntegrityDrift(
  db: Database.Database,
  storeMode: 'legacy' | 'dual' | 'item' = config.memory.store
): {
  fact: number
  episode: number
  media: number
  total: number
} {
  const drift = storeMode === 'item' ? getMemoryItemNativeIntegrityCounts(db) : getMemoryItemDriftCounts(db)
  return { ...drift, total: drift.fact + drift.episode + drift.media }
}

export function summarizeTimings(samples: number[]): BuilderTimingStats {
  if (samples.length === 0) return { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 }
  const sorted = [...samples].sort((a, b) => a - b)
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!
  return {
    count: sorted.length,
    p50Ms: Number(pick(0.5).toFixed(3)),
    p95Ms: Number(pick(0.95).toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(3))
  }
}

export interface TurnRecallObservation {
  day: number
  guildId: string | null
  channelId: string
  visibility: 'public' | 'private' | 'dm'
  expectedGtIds: string[]
  fullSystemPrompt: string
  memoryBlocksText: string
  bothStoresBlocksText: string
  dmHeadingsFound: string[]
  privateOnlyItemsCount: number
}

// Precision definitions:
// - End-state precision = TP / (TP + FP), where TP is a planted item in its expected DB state and FP is any stored
//   claim contradicting ground truth (superseded/retracted claim still active, past mention stored as current,
//   multi-valued sibling wrongly superseded, or server event with wrong event_date).
// - Turn-level precision = share of non-DM turns after checkAfterDay whose memory blocks mention the item's expected
//   or stale tokens that show only the expected current value (no stale tokens, and no retracted claim active in blocks).
export function evaluateGroundTruth(
  db: Database.Database,
  groundTruth: GroundTruthFile,
  observations: readonly TurnRecallObservation[],
  isPrivateChannel: (channelId: string | null) => boolean,
  storeMode: 'legacy' | 'dual' | 'item' = config.memory.store
): {
  overallPlanted: number
  overallMatched: number
  overallFalsePositives: number
  overallRecall: number
  overallPrecision: number
  byLabel: LabelQualityMetrics[]
  privateOnlyItemsCount: number
  privateTokensLeaked: number
  dmTurnsChecked: number
  dmMemoryBlockLeaks: number
} {
  const labels: GroundTruthLabel[] = [
    'new_fact',
    'update',
    'correction',
    'past_mention',
    'retraction',
    'multi_valued',
    'server_event',
    'private_fact',
    'media_share'
  ]

  const allClaims = (
    storeMode === 'item'
      ? db
          .prepare(
            `SELECT id, guild_id, subject_kind, subject_user_id, predicate, content AS value, period, status,
                  end_reason, event_date, valid_until AS expires_at
           FROM memory_item WHERE kind = 'fact'`
          )
          .all()
      : db
          .prepare(
            'SELECT id, guild_id, subject_kind, subject_user_id, predicate, value, period, status, end_reason, event_date, expires_at FROM memory_claim'
          )
          .all()
  ) as Array<{
    id: number
    guild_id: string
    subject_kind: string
    subject_user_id: string | null
    predicate: string
    value: string
    period: string
    status: string
    end_reason: string | null
    event_date: string | null
    expires_at: number | null
  }>

  const allMedia = (
    storeMode === 'item'
      ? db.prepare("SELECT id, guild_id, content AS summary, label FROM memory_item WHERE kind = 'media'").all()
      : db.prepare('SELECT id, guild_id, summary, label FROM media_digest').all()
  ) as Array<{
    id: number
    guild_id: string
    summary: string
    label: string
  }>

  const tokensMatch = (text: string, tokens: readonly string[]) => {
    const lower = text.toLowerCase()
    return tokens.every((t) => lower.includes(t.toLowerCase()))
  }

  let privateTokensLeaked = 0
  const publicObservations = observations.filter((obs) => obs.visibility === 'public')
  for (const item of groundTruth.items.filter((i) => i.mustNotLeakInPublic)) {
    for (const obs of publicObservations) {
      const leakedInPrompt = item.expectedTokens.some((token) =>
        obs.fullSystemPrompt.toLowerCase().includes(token.toLowerCase())
      )
      const leakedInBlocks = item.expectedTokens.some((token) =>
        obs.bothStoresBlocksText.toLowerCase().includes(token.toLowerCase())
      )
      if (leakedInPrompt || leakedInBlocks) {
        privateTokensLeaked += 1
      }
    }
  }

  const dmObservations = observations.filter((obs) => obs.visibility === 'dm')
  const dmMemoryBlockLeaks = dmObservations.filter((obs) => obs.dmHeadingsFound.length > 0).length
  const maxPrivateSeenAtPublicTurn =
    publicObservations.length === 0 ? 0 : Math.max(...publicObservations.map((obs) => obs.privateOnlyItemsCount))
  const finalPrivateOnlyCount = countPrivateOnlyItemsInDb(db, isPrivateChannel, storeMode)
  const privateOnlyItemsCount = Math.min(maxPrivateSeenAtPublicTurn, finalPrivateOnlyCount)

  const byLabel: LabelQualityMetrics[] = []
  let overallPlanted = 0
  let overallMatched = 0
  let overallFalsePositives = 0

  for (const label of labels) {
    const group = groundTruth.items.filter((i) => i.label === label)
    let matched = 0
    let falsePositives = 0
    let turnExpected = 0
    let turnRecalled = 0
    let turnMentioned = 0
    let turnClean = 0

    for (const item of group) {
      let ok = false
      let itemFp = 0
      if (label === 'media_share') {
        ok = allMedia.some(
          (m) => m.guild_id === item.guildId && tokensMatch(`${m.label} ${m.summary}`, item.expectedTokens)
        )
      } else if (label === 'server_event') {
        const matchingGuild = allClaims.filter(
          (c) => c.guild_id === item.guildId && c.subject_kind === 'guild' && tokensMatch(c.value, item.expectedTokens)
        )
        const matchingActiveGuild = matchingGuild.filter((c) => c.status === 'active')
        // An event whose date has passed ends as expired, which is its correct end state, not a miss.
        ok = matchingGuild
          .filter((c) => c.status === 'active' || c.end_reason === 'expired')
          .some((c) =>
            item.expectedEventDate
              ? c.event_date === item.expectedEventDate
              : Boolean(c.event_date) || Boolean(c.expires_at)
          )
        itemFp += matchingActiveGuild.filter((c) =>
          item.expectedEventDate ? c.event_date !== item.expectedEventDate : !c.event_date && !c.expires_at
        ).length
      } else if (label === 'retraction') {
        ok = allClaims.some(
          (c) =>
            c.guild_id === item.guildId &&
            c.subject_user_id === item.subjectUserId &&
            c.status === 'rejected' &&
            c.end_reason === 'retracted' &&
            tokensMatch(c.value, item.expectedTokens)
        )
        itemFp += allClaims.filter(
          (c) =>
            c.guild_id === item.guildId &&
            c.subject_user_id === item.subjectUserId &&
            c.status === 'active' &&
            tokensMatch(c.value, item.expectedTokens)
        ).length
      } else if (label === 'past_mention') {
        ok = allClaims.some(
          (c) =>
            c.guild_id === item.guildId &&
            c.subject_user_id === item.subjectUserId &&
            c.period === 'past' &&
            tokensMatch(c.value, item.expectedTokens)
        )
        itemFp += allClaims.filter(
          (c) =>
            c.guild_id === item.guildId &&
            c.subject_user_id === item.subjectUserId &&
            c.status === 'active' &&
            c.period === 'current' &&
            tokensMatch(c.value, item.expectedTokens)
        ).length
      } else {
        const hasNew = allClaims.some(
          (c) =>
            c.guild_id === item.guildId &&
            c.subject_user_id === item.subjectUserId &&
            c.status === 'active' &&
            tokensMatch(c.value, item.expectedTokens)
        )
        const staleActiveCount = item.supersededTokens
          ? allClaims.filter(
              (c) =>
                c.guild_id === item.guildId &&
                c.subject_user_id === item.subjectUserId &&
                c.status === 'active' &&
                tokensMatch(c.value, item.supersededTokens!)
            ).length
          : 0
        ok = hasNew && staleActiveCount === 0
        itemFp += staleActiveCount
        if (label === 'multi_valued') {
          itemFp += allClaims.filter(
            (c) =>
              c.guild_id === item.guildId &&
              c.subject_user_id === item.subjectUserId &&
              c.status !== 'active' &&
              c.end_reason === 'superseded' &&
              tokensMatch(c.value, item.expectedTokens)
          ).length
        }
      }
      if (ok) matched += 1
      falsePositives += itemFp

      for (const obs of observations.filter((o) => o.expectedGtIds.includes(item.id))) {
        turnExpected += 1
        if (tokensMatch(obs.memoryBlocksText, item.expectedTokens)) turnRecalled += 1
      }

      for (const obs of observations.filter(
        (o) =>
          o.visibility !== 'dm' &&
          o.guildId === item.guildId &&
          o.day >= item.checkAfterDay &&
          (!item.mustNotLeakInPublic || o.visibility === 'private')
      )) {
        const hasExpected = tokensMatch(obs.memoryBlocksText, item.expectedTokens)
        const hasStale = Boolean(item.supersededTokens && tokensMatch(obs.memoryBlocksText, item.supersededTokens))
        if (!hasExpected && !hasStale) continue
        turnMentioned += 1
        if (label === 'retraction') {
          // Retracted claims should not appear as current recalled facts.
          continue
        }
        if (hasExpected && !hasStale) {
          turnClean += 1
        }
      }
    }

    overallPlanted += group.length
    overallMatched += matched
    overallFalsePositives += falsePositives
    const recall = group.length === 0 ? 1 : Number((matched / group.length).toFixed(3))
    const precision = matched + falsePositives === 0 ? 1 : Number((matched / (matched + falsePositives)).toFixed(3))
    const turnRecall = turnExpected === 0 ? 1 : Number((turnRecalled / turnExpected).toFixed(3))
    const turnPrecision = turnMentioned === 0 ? 1 : Number((turnClean / turnMentioned).toFixed(3))
    byLabel.push({
      label,
      planted: group.length,
      matched,
      falsePositives,
      recall,
      precision,
      turnExpected,
      turnRecalled,
      turnRecall,
      turnMentioned,
      turnClean,
      turnPrecision
    })
  }

  const overallRecall = overallPlanted === 0 ? 1 : Number((overallMatched / overallPlanted).toFixed(3))
  const overallPrecision =
    overallMatched + overallFalsePositives === 0
      ? 1
      : Number((overallMatched / (overallMatched + overallFalsePositives)).toFixed(3))
  return {
    overallPlanted,
    overallMatched,
    overallFalsePositives,
    overallRecall,
    overallPrecision,
    byLabel,
    privateOnlyItemsCount,
    privateTokensLeaked,
    dmTurnsChecked: dmObservations.length,
    dmMemoryBlockLeaks
  }
}
