import type Database from 'better-sqlite3'
import { reserveMemoryItemIds } from './memoryItemStore.js'
import { UNKNOWN_FINGERPRINT } from './vectorProvenance.js'

type MemoryStoreMode = 'legacy' | 'dual' | 'item'

const DROP_PROJECTION_TRIGGERS = `
  DROP TRIGGER IF EXISTS memory_item_projection_memory_claim_after_insert;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_claim_after_update;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_claim_after_delete;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_evidence_after_insert;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_evidence_after_update;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_evidence_after_delete;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_episode_after_insert;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_episode_after_update;
  DROP TRIGGER IF EXISTS memory_item_projection_memory_episode_after_delete;
  DROP TRIGGER IF EXISTS memory_item_projection_media_digest_after_insert;
  DROP TRIGGER IF EXISTS memory_item_projection_media_digest_after_update;
  DROP TRIGGER IF EXISTS memory_item_projection_media_digest_after_delete;
  DROP TRIGGER IF EXISTS memory_item_projection_media_occurrence_after_insert;
  DROP TRIGGER IF EXISTS memory_item_projection_media_occurrence_after_update;
  DROP TRIGGER IF EXISTS memory_item_projection_media_occurrence_after_delete;
`

const CLAIM_PROJECTION = `
  INSERT INTO memory_item (
    guild_id, kind, subject_kind, subject_user_id, predicate, content, label, media_kind, content_key,
    source_job_id, period, object_kind, object_user_id, source_kind, status, needs_review, end_reason, ended_at,
    superseded_by, confidence, salience, pinned, valid_until, event_date, first_seen_at, last_seen_at,
    last_recalled_at, created_at, legacy_table, legacy_id, legacy_embedding_text
  ) VALUES (
    new.guild_id, 'fact', new.subject_kind, new.subject_user_id, new.predicate, new.value, NULL, NULL, NULL,
    NULL, new.period, new.object_kind, new.object_user_id, new.source_kind, new.status, new.needs_review,
    new.end_reason, new.ended_at,
    (SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = new.superseded_by),
    new.confidence, new.salience, new.pinned, new.expires_at, new.event_date, new.first_seen_at, new.last_seen_at,
    new.last_recalled_at, NULL, 'memory_claim', new.id, new.embedding_text
  ) ON CONFLICT (legacy_table, legacy_id) DO UPDATE SET
    guild_id = excluded.guild_id,
    kind = excluded.kind,
    subject_kind = excluded.subject_kind,
    subject_user_id = excluded.subject_user_id,
    predicate = excluded.predicate,
    content = excluded.content,
    label = excluded.label,
    media_kind = excluded.media_kind,
    content_key = excluded.content_key,
    source_job_id = excluded.source_job_id,
    period = excluded.period,
    object_kind = excluded.object_kind,
    object_user_id = excluded.object_user_id,
    source_kind = excluded.source_kind,
    status = excluded.status,
    needs_review = excluded.needs_review,
    end_reason = excluded.end_reason,
    ended_at = excluded.ended_at,
    superseded_by = excluded.superseded_by,
    confidence = excluded.confidence,
    salience = excluded.salience,
    pinned = excluded.pinned,
    valid_until = excluded.valid_until,
    event_date = excluded.event_date,
    first_seen_at = excluded.first_seen_at,
    last_seen_at = excluded.last_seen_at,
    last_recalled_at = excluded.last_recalled_at,
    created_at = NULL,
    legacy_embedding_text = excluded.legacy_embedding_text;
  UPDATE memory_item
  SET superseded_by = (
    SELECT successor.id FROM memory_item successor
    WHERE successor.legacy_table = 'memory_claim' AND successor.legacy_id = new.superseded_by
  )
  WHERE legacy_table = 'memory_claim' AND legacy_id = new.id;
  UPDATE memory_item
  SET superseded_by = (
    SELECT successor.id FROM memory_item successor
    WHERE successor.legacy_table = 'memory_claim' AND successor.legacy_id = new.id
  )
  WHERE legacy_table = 'memory_claim'
    AND legacy_id IN (SELECT id FROM memory_claim WHERE superseded_by = new.id);
`

const CLAIM_VECTOR_INSERT = `
  INSERT INTO memory_item_embedding (
    item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector, created_at
  )
  SELECT item.id, COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}'), new.embedding_model_id,
         CASE WHEN new.embedding_dim IS NOT NULL THEN new.embedding_dim
              WHEN length(new.embedding) % 4 = 0 THEN length(new.embedding) / 4 ELSE 0 END,
         'fact_sentence', 1, NULL, new.embedding, NULL
  FROM memory_item item
  WHERE item.legacy_table = 'memory_claim' AND item.legacy_id = new.id AND new.embedding IS NOT NULL;
`

const CLAIM_VECTOR_UPDATE = CLAIM_VECTOR_INSERT.replace(
  'AND new.embedding IS NOT NULL;',
  `AND new.embedding IS NOT NULL
    AND (old.embedding IS NOT new.embedding OR old.embedding_text IS NOT new.embedding_text
      OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
      OR old.embedding_fingerprint IS NOT new.embedding_fingerprint
      OR NOT EXISTS (
        SELECT 1 FROM memory_item_embedding existing
        WHERE existing.item_id = item.id
          AND existing.fingerprint = COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}')
      ));`
)

const EPISODE_PROJECTION = `
  INSERT INTO memory_item (
    guild_id, kind, subject_kind, subject_user_id, predicate, content, label, media_kind, content_key,
    source_job_id, period, object_kind, object_user_id, source_kind, status, needs_review, end_reason, ended_at,
    superseded_by, confidence, salience, pinned, valid_until, event_date, first_seen_at, last_seen_at,
    last_recalled_at, created_at, legacy_table, legacy_id, legacy_embedding_text
  ) VALUES (
    new.guild_id, 'episode', 'guild', NULL, NULL, new.summary, NULL, NULL, NULL,
    new.id, 'current', NULL, NULL, NULL, 'active', 0, NULL, NULL,
    NULL, NULL, NULL, 0, NULL, NULL, new.started_at, new.ended_at,
    NULL, new.created_at, 'memory_episode', new.id, NULL
  ) ON CONFLICT (legacy_table, legacy_id) DO UPDATE SET
    guild_id = excluded.guild_id,
    kind = excluded.kind,
    subject_kind = excluded.subject_kind,
    subject_user_id = excluded.subject_user_id,
    predicate = excluded.predicate,
    version = memory_item.version + CASE WHEN memory_item.content IS NOT excluded.content THEN 1 ELSE 0 END,
    content = excluded.content,
    label = excluded.label,
    media_kind = excluded.media_kind,
    content_key = excluded.content_key,
    source_job_id = excluded.source_job_id,
    period = excluded.period,
    object_kind = excluded.object_kind,
    object_user_id = excluded.object_user_id,
    source_kind = excluded.source_kind,
    status = excluded.status,
    needs_review = excluded.needs_review,
    end_reason = excluded.end_reason,
    ended_at = excluded.ended_at,
    superseded_by = excluded.superseded_by,
    confidence = excluded.confidence,
    salience = excluded.salience,
    pinned = excluded.pinned,
    valid_until = excluded.valid_until,
    event_date = excluded.event_date,
    first_seen_at = excluded.first_seen_at,
    last_seen_at = excluded.last_seen_at,
    last_recalled_at = excluded.last_recalled_at,
    created_at = excluded.created_at,
    legacy_embedding_text = NULL;
  INSERT INTO memory_item_occurrence (
    item_id, guild_id, channel_id, origin, message_id, shared_by_user_id, source_author_id, span_start, observed_at
  ) VALUES (
    (SELECT id FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = new.id),
    new.guild_id, new.channel_id, 'episode', NULL, NULL, NULL, new.started_at, new.ended_at
  ) ON CONFLICT DO UPDATE SET
    guild_id = excluded.guild_id,
    channel_id = excluded.channel_id,
    origin = 'episode',
    message_id = NULL,
    shared_by_user_id = NULL,
    source_author_id = NULL,
    span_start = excluded.span_start,
    observed_at = excluded.observed_at;
`

const EPISODE_VECTOR_INSERT = `
  INSERT INTO memory_item_embedding (
    item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector, created_at
  )
  SELECT item.id, COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}'), new.embedding_model_id,
         CASE WHEN new.embedding_dim IS NOT NULL THEN new.embedding_dim
              WHEN length(new.embedding) % 4 = 0 THEN length(new.embedding) / 4 ELSE 0 END,
         'summary', 1, NULL, new.embedding, NULL
  FROM memory_item item
  WHERE item.legacy_table = 'memory_episode' AND item.legacy_id = new.id AND new.embedding IS NOT NULL;
`

const EPISODE_VECTOR_UPDATE = EPISODE_VECTOR_INSERT.replace(
  'AND new.embedding IS NOT NULL;',
  `AND new.embedding IS NOT NULL
    AND (old.embedding IS NOT new.embedding OR old.summary IS NOT new.summary
      OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
      OR old.embedding_fingerprint IS NOT new.embedding_fingerprint
      OR NOT EXISTS (
        SELECT 1 FROM memory_item_embedding existing
        WHERE existing.item_id = item.id
          AND existing.fingerprint = COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}')
      ));`
)

const MEDIA_PROJECTION = `
  INSERT INTO memory_item (
    guild_id, kind, subject_kind, subject_user_id, predicate, content, label, media_kind, content_key,
    source_job_id, period, object_kind, object_user_id, source_kind, status, needs_review, end_reason, ended_at,
    superseded_by, confidence, salience, pinned, valid_until, event_date, first_seen_at, last_seen_at,
    last_recalled_at, created_at, legacy_table, legacy_id, legacy_embedding_text
  ) VALUES (
    new.guild_id, 'media', 'guild', NULL, NULL, new.summary, new.label, new.kind, new.content_key,
    NULL, 'current', NULL, NULL, NULL, 'active', 0, NULL, NULL,
    NULL, NULL, NULL, 0, NULL, NULL, new.created_at,
    COALESCE((SELECT MAX(observed_at) FROM media_occurrence WHERE digest_id = new.id), new.created_at),
    NULL, new.created_at, 'media_digest', new.id, NULL
  ) ON CONFLICT (legacy_table, legacy_id) DO UPDATE SET
    guild_id = excluded.guild_id,
    kind = excluded.kind,
    subject_kind = excluded.subject_kind,
    subject_user_id = excluded.subject_user_id,
    predicate = excluded.predicate,
    version = memory_item.version + CASE
      WHEN memory_item.content IS NOT excluded.content OR memory_item.label IS NOT excluded.label THEN 1 ELSE 0 END,
    content = excluded.content,
    label = excluded.label,
    media_kind = excluded.media_kind,
    content_key = excluded.content_key,
    source_job_id = excluded.source_job_id,
    period = excluded.period,
    object_kind = excluded.object_kind,
    object_user_id = excluded.object_user_id,
    source_kind = excluded.source_kind,
    status = excluded.status,
    needs_review = excluded.needs_review,
    end_reason = excluded.end_reason,
    ended_at = excluded.ended_at,
    superseded_by = excluded.superseded_by,
    confidence = excluded.confidence,
    salience = excluded.salience,
    pinned = excluded.pinned,
    valid_until = excluded.valid_until,
    event_date = excluded.event_date,
    first_seen_at = excluded.first_seen_at,
    last_seen_at = excluded.last_seen_at,
    last_recalled_at = excluded.last_recalled_at,
    created_at = excluded.created_at,
    legacy_embedding_text = NULL;
  INSERT INTO memory_item_payload (item_id, digest_json)
  VALUES (
    (SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = new.id),
    new.digest_json
  ) ON CONFLICT (item_id) DO UPDATE SET digest_json = excluded.digest_json;
`

const MEDIA_VECTOR_INSERT = `
  INSERT INTO memory_item_embedding (
    item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector, created_at
  )
  SELECT item.id, COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}'), new.embedding_model_id,
         CASE WHEN new.embedding_dim IS NOT NULL THEN new.embedding_dim
              WHEN length(new.embedding) % 4 = 0 THEN length(new.embedding) / 4 ELSE 0 END,
         'summary', 1, NULL, new.embedding, NULL
  FROM memory_item item
  WHERE item.legacy_table = 'media_digest' AND item.legacy_id = new.id AND new.embedding IS NOT NULL;
`

const MEDIA_VECTOR_UPDATE = MEDIA_VECTOR_INSERT.replace(
  'AND new.embedding IS NOT NULL;',
  `AND new.embedding IS NOT NULL
    AND (old.embedding IS NOT new.embedding OR old.summary IS NOT new.summary
      OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
      OR old.embedding_fingerprint IS NOT new.embedding_fingerprint
      OR NOT EXISTS (
        SELECT 1 FROM memory_item_embedding existing
        WHERE existing.item_id = item.id
          AND existing.fingerprint = COALESCE(new.embedding_fingerprint, '${UNKNOWN_FINGERPRINT}')
      ));`
)

const EVIDENCE_PROJECTION = `
  INSERT INTO memory_item_evidence (
    item_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id, legacy_id
  )
  SELECT item.id, new.channel_id, new.source_kind, new.observed_at, new.effective_at, new.job_id,
         new.source_message_id, new.speaker_user_id, new.id
  FROM memory_item item
  WHERE item.legacy_table = 'memory_claim' AND item.legacy_id = new.claim_id
  ON CONFLICT (legacy_id) DO UPDATE SET
    item_id = excluded.item_id,
    channel_id = excluded.channel_id,
    source_kind = excluded.source_kind,
    observed_at = excluded.observed_at,
    effective_at = excluded.effective_at,
    job_id = excluded.job_id,
    source_message_id = excluded.source_message_id,
    speaker_user_id = excluded.speaker_user_id;
`

const MEDIA_OCCURRENCE_PROJECTION = `
  INSERT INTO memory_item_occurrence (
    item_id, guild_id, channel_id, origin, message_id, shared_by_user_id, source_author_id, span_start, observed_at,
    legacy_id
  )
  SELECT item.id, new.guild_id, new.channel_id, new.origin, new.message_id, new.shared_by_user_id,
         new.source_author_id, NULL, new.observed_at, new.id
  FROM memory_item item
  WHERE item.legacy_table = 'media_digest' AND item.legacy_id = new.digest_id
  ON CONFLICT (legacy_id) DO UPDATE SET
    item_id = excluded.item_id,
    guild_id = excluded.guild_id,
    channel_id = excluded.channel_id,
    origin = excluded.origin,
    message_id = excluded.message_id,
    shared_by_user_id = excluded.shared_by_user_id,
    source_author_id = excluded.source_author_id,
    span_start = NULL,
    observed_at = excluded.observed_at;
  UPDATE memory_item
  SET last_seen_at = COALESCE(
    (SELECT MAX(observed_at) FROM memory_item_occurrence WHERE item_id = memory_item.id AND origin != 'episode'),
    created_at
  )
  WHERE id = (SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = new.digest_id);
`

function createProjectionTriggers(database: Database.Database): void {
  database.exec(`
    CREATE TRIGGER memory_item_projection_memory_claim_after_insert
    AFTER INSERT ON memory_claim BEGIN
      ${CLAIM_PROJECTION}
      ${CLAIM_VECTOR_INSERT}
    END;
    CREATE TRIGGER memory_item_projection_memory_claim_after_update
    AFTER UPDATE ON memory_claim BEGIN
      ${CLAIM_PROJECTION}
      DELETE FROM memory_item_embedding
      WHERE item_id = (SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = new.id)
        AND (new.embedding IS NULL OR old.embedding IS NOT new.embedding OR old.embedding_text IS NOT new.embedding_text
          OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
          OR old.embedding_fingerprint IS NOT new.embedding_fingerprint);
      ${CLAIM_VECTOR_UPDATE}
    END;
    CREATE TRIGGER memory_item_projection_memory_claim_after_delete
    AFTER DELETE ON memory_claim BEGIN
      UPDATE memory_item SET superseded_by = NULL WHERE superseded_by = (
        SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = old.id
      );
      DELETE FROM memory_item_evidence WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = old.id
      );
      DELETE FROM memory_item_embedding WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = old.id
      );
      DELETE FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = old.id;
    END;

    CREATE TRIGGER memory_item_projection_memory_evidence_after_insert
    AFTER INSERT ON memory_evidence BEGIN
      ${EVIDENCE_PROJECTION}
    END;
    CREATE TRIGGER memory_item_projection_memory_evidence_after_update
    AFTER UPDATE ON memory_evidence BEGIN
      ${EVIDENCE_PROJECTION}
    END;
    CREATE TRIGGER memory_item_projection_memory_evidence_after_delete
    AFTER DELETE ON memory_evidence BEGIN
      DELETE FROM memory_item_evidence WHERE legacy_id = old.id;
    END;

    CREATE TRIGGER memory_item_projection_memory_episode_after_insert
    AFTER INSERT ON memory_episode BEGIN
      ${EPISODE_PROJECTION}
      ${EPISODE_VECTOR_INSERT}
    END;
    CREATE TRIGGER memory_item_projection_memory_episode_after_update
    AFTER UPDATE ON memory_episode BEGIN
      ${EPISODE_PROJECTION}
      DELETE FROM memory_item_embedding
      WHERE item_id = (SELECT id FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = new.id)
        AND (old.embedding IS NOT new.embedding OR old.summary IS NOT new.summary
          OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
          OR old.embedding_fingerprint IS NOT new.embedding_fingerprint);
      ${EPISODE_VECTOR_UPDATE}
    END;
    CREATE TRIGGER memory_item_projection_memory_episode_after_delete
    AFTER DELETE ON memory_episode BEGIN
      DELETE FROM memory_item_occurrence WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = old.id
      ) AND origin = 'episode';
      DELETE FROM memory_item_embedding WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = old.id
      );
      DELETE FROM memory_item WHERE legacy_table = 'memory_episode' AND legacy_id = old.id;
    END;

    CREATE TRIGGER memory_item_projection_media_digest_after_insert
    AFTER INSERT ON media_digest BEGIN
      ${MEDIA_PROJECTION}
      ${MEDIA_VECTOR_INSERT}
    END;
    CREATE TRIGGER memory_item_projection_media_digest_after_update
    AFTER UPDATE ON media_digest BEGIN
      ${MEDIA_PROJECTION}
      DELETE FROM memory_item_embedding
      WHERE item_id = (SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = new.id)
        AND (old.embedding IS NOT new.embedding OR old.summary IS NOT new.summary
          OR old.embedding_model_id IS NOT new.embedding_model_id OR old.embedding_dim IS NOT new.embedding_dim
          OR old.embedding_fingerprint IS NOT new.embedding_fingerprint);
      ${MEDIA_VECTOR_UPDATE}
    END;
    CREATE TRIGGER memory_item_projection_media_digest_after_delete
    AFTER DELETE ON media_digest BEGIN
      DELETE FROM memory_item_occurrence WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = old.id
      );
      DELETE FROM memory_item_payload WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = old.id
      );
      DELETE FROM memory_item_embedding WHERE item_id = (
        SELECT id FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = old.id
      );
      DELETE FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = old.id;
    END;

    CREATE TRIGGER memory_item_projection_media_occurrence_after_insert
    AFTER INSERT ON media_occurrence BEGIN
      ${MEDIA_OCCURRENCE_PROJECTION}
    END;
    CREATE TRIGGER memory_item_projection_media_occurrence_after_update
    AFTER UPDATE ON media_occurrence BEGIN
      ${MEDIA_OCCURRENCE_PROJECTION}
    END;
    CREATE TRIGGER memory_item_projection_media_occurrence_after_delete
    AFTER DELETE ON media_occurrence BEGIN
      DELETE FROM memory_item_occurrence WHERE legacy_id = old.id;
      UPDATE memory_item
      SET last_seen_at = COALESCE(
        (SELECT MAX(observed_at) FROM memory_item_occurrence WHERE item_id = memory_item.id AND origin != 'episode'),
        created_at
      )
      WHERE legacy_table = 'media_digest' AND legacy_id = old.digest_id;
    END;
  `)
}

export function configureMemoryItemProjectionTriggers(database: Database.Database, store: MemoryStoreMode): void {
  database.transaction(() => {
    database.exec(DROP_PROJECTION_TRIGGERS)
    if (store === 'dual') createProjectionTriggers(database)
    if (store === 'item') reserveMemoryItemIds(database)
  })()
}
