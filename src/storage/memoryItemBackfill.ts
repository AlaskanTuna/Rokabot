import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { UNKNOWN_FINGERPRINT } from './vectorProvenance.js'

type Row = Record<string, unknown>

type MemoryItemsMigrationReport = Readonly<{
  copied_items: number
  refreshed_items: number
  deleted_items: number
  copied_evidence: number
  copied_occurrences: number
  copied_payloads: number
  copied_embeddings: number
  kind_counts: Record<'fact' | 'episode' | 'media', number>
  subject_counts: Record<'user' | 'guild', number>
  status_counts: Record<'candidate' | 'active' | 'superseded' | 'rejected', number>
  period_counts: Record<'current' | 'past', number>
  evidence_per_item: Record<string, number>
  occurrences_per_item: Record<string, number>
  non_null_provenance_counts: Record<'model_id' | 'dim' | 'fingerprint' | 'text_hash', number>
  vector_counts_by_fingerprint: Array<{ fingerprint_hash: string; count: number }>
  legacy_ids: Readonly<{ expected: number; complete: number; unique: number }>
  checks: Readonly<{
    category_counts: true
    evidence_occurrences_per_item: true
    non_null_provenance_counts: true
    vectors_by_fingerprint: true
    legacy_ids_complete_unique: true
    timestamps_no_inventions: true
    round_trip_all_columns: true
  }>
  checks_passed: number
  checks_failed: 0
  round_trip_columns_checked: number
}>

type MutableReport = {
  copied_items: number
  refreshed_items: number
  deleted_items: number
  copied_evidence: number
  copied_occurrences: number
  copied_payloads: number
  copied_embeddings: number
}

type Verification = {
  passed: number
  failed: number
  roundTripColumnsChecked: number
  driftCounts: { fact: number; episode: number; media: number }
}

const ITEM_INSERT = `
  INSERT INTO memory_item (
    guild_id, kind, subject_kind, subject_user_id, predicate, content, label, media_kind, content_key,
    source_job_id, period, object_kind, object_user_id, source_kind, status, needs_review, end_reason, ended_at,
    superseded_by, confidence, salience, pinned, valid_until, event_date, first_seen_at, last_seen_at,
    last_recalled_at, created_at, version, legacy_table, legacy_id, legacy_embedding_text
  ) VALUES (
    @guild_id, @kind, @subject_kind, @subject_user_id, @predicate, @content, @label, @media_kind, @content_key,
    @source_job_id, @period, @object_kind, @object_user_id, @source_kind, @status, @needs_review, @end_reason,
    @ended_at, @superseded_by, @confidence, @salience, @pinned, @valid_until, @event_date, @first_seen_at,
    @last_seen_at, @last_recalled_at, @created_at, 1, @legacy_table, @legacy_id, @legacy_embedding_text
  )
`

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hasVector(row: Row): boolean {
  return Buffer.isBuffer(row.embedding)
}

function vectorDimension(row: Row): number {
  if (typeof row.embedding_dim === 'number') return row.embedding_dim
  const bytes = row.embedding as Buffer
  return bytes.byteLength % 4 === 0 ? bytes.byteLength / 4 : 0
}

function fingerprint(row: Row): string {
  return typeof row.embedding_fingerprint === 'string' ? row.embedding_fingerprint : UNKNOWN_FINGERPRINT
}

function rowForLegacyId(database: Database.Database, table: string, id: number): Row | undefined {
  return database.prepare('SELECT * FROM memory_item WHERE legacy_table = ? AND legacy_id = ?').get(table, id) as
    | Row
    | undefined
}

function projectionValuesEqual(current: Row, values: Record<string, unknown>): boolean {
  return Object.entries(values).every(([key, value]) => valueEqual(current[key], value))
}

function syncItem(
  database: Database.Database,
  values: Record<string, unknown>,
  report: MutableReport,
  newItemIds: Set<number>
): number {
  const existing = rowForLegacyId(database, String(values.legacy_table), Number(values.legacy_id))
  if (!existing) {
    const insertValues = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'version'))
    const result = database.prepare(ITEM_INSERT).run(insertValues)
    const id = Number(result.lastInsertRowid)
    newItemIds.add(id)
    report.copied_items += 1
    return id
  }

  const fields = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'version'))
  const nextVersion = typeof values.version === 'number' ? values.version : existing.version
  if (projectionValuesEqual(existing, fields) && valueEqual(existing.version, nextVersion)) return Number(existing.id)

  const changes = Object.fromEntries(
    Object.entries({ ...fields, version: nextVersion }).filter(([key, value]) => !valueEqual(existing[key], value))
  )
  if (Object.keys(changes).length > 0) {
    database
      .prepare(
        `UPDATE memory_item SET ${Object.keys(changes)
          .map((key) => `${key} = @${key}`)
          .join(', ')} WHERE id = @id`
      )
      .run({ ...changes, id: existing.id })
    if (!newItemIds.has(Number(existing.id))) report.refreshed_items += 1
  }
  return Number(existing.id)
}

function syncVector(
  database: Database.Database,
  itemId: number,
  row: Row,
  renderer: 'fact_sentence' | 'summary',
  legacyText: string | null,
  report: MutableReport
): void {
  const existing = database.prepare('SELECT * FROM memory_item_embedding WHERE item_id = ?').all(itemId) as Row[]
  if (!hasVector(row)) {
    if (existing.length > 0) database.prepare('DELETE FROM memory_item_embedding WHERE item_id = ?').run(itemId)
    return
  }

  const textHash = legacyText === null ? null : sha256(legacyText)
  const expected = {
    item_id: itemId,
    fingerprint: fingerprint(row),
    model_id: row.embedding_model_id ?? null,
    dim: vectorDimension(row),
    renderer,
    renderer_version: 1,
    vector: row.embedding,
    created_at: null
  }
  const matches =
    existing.length === 1 &&
    projectionValuesEqual(existing[0]!, expected) &&
    (existing[0]!.text_hash === null || valueEqual(existing[0]!.text_hash, textHash))
  if (matches) return

  if (existing.length > 0) database.prepare('DELETE FROM memory_item_embedding WHERE item_id = ?').run(itemId)
  database
    .prepare(`
      INSERT INTO memory_item_embedding (
        item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
    `)
    .run(itemId, expected.fingerprint, expected.model_id, expected.dim, renderer, textHash, expected.vector)
  if (existing.length === 0) report.copied_embeddings += 1
}

function syncSupportRow(
  database: Database.Database,
  table: 'memory_item_evidence' | 'memory_item_occurrence',
  where: string,
  whereValues: readonly unknown[],
  values: Record<string, unknown>
): 'inserted' | 'updated' | 'same' {
  const current = database.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(...whereValues) as Row | undefined
  if (!current) {
    const columns = Object.keys(values)
    database
      .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((key) => `@${key}`).join(', ')})`)
      .run(values)
    return 'inserted'
  }
  if (projectionValuesEqual(current, values)) return 'same'
  const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => !valueEqual(current[key], value)))
  database
    .prepare(
      `UPDATE ${table} SET ${Object.keys(changes)
        .map((key) => `${key} = ?`)
        .join(', ')} WHERE ${where}`
    )
    .run(...Object.keys(changes).map((key) => changes[key]), ...whereValues)
  return 'updated'
}

function copyClaims(database: Database.Database, report: MutableReport, newItemIds: Set<number>): void {
  const claims = database.prepare('SELECT * FROM memory_claim ORDER BY id').all() as Row[]
  for (const claim of claims) {
    const successorId = (claim.superseded_by as number | null) ?? null
    const successorExists =
      successorId !== null && Boolean(database.prepare('SELECT 1 FROM memory_claim WHERE id = ?').get(successorId))
    const successor = successorExists ? rowForLegacyId(database, 'memory_claim', successorId) : undefined
    const itemId = syncItem(
      database,
      {
        guild_id: claim.guild_id,
        kind: 'fact',
        subject_kind: claim.subject_kind,
        subject_user_id: claim.subject_user_id,
        predicate: claim.predicate,
        content: claim.value,
        label: null,
        media_kind: null,
        content_key: null,
        source_job_id: null,
        period: claim.period,
        object_kind: claim.object_kind,
        object_user_id: claim.object_user_id,
        source_kind: claim.source_kind,
        status: claim.status,
        needs_review: claim.needs_review,
        end_reason: claim.end_reason,
        ended_at: claim.ended_at,
        superseded_by: successor?.id ?? null,
        confidence: claim.confidence,
        salience: claim.salience,
        pinned: claim.pinned,
        valid_until: claim.expires_at,
        event_date: claim.event_date,
        first_seen_at: claim.first_seen_at,
        last_seen_at: claim.last_seen_at,
        last_recalled_at: claim.last_recalled_at,
        created_at: null,
        legacy_table: 'memory_claim',
        legacy_id: claim.id,
        legacy_embedding_text: claim.embedding_text
      },
      report,
      newItemIds
    )
    syncVector(database, itemId, claim, 'fact_sentence', claim.embedding_text as string | null, report)
  }

  const evidence = database.prepare('SELECT * FROM memory_evidence ORDER BY id').all() as Row[]
  for (const row of evidence) {
    const item = rowForLegacyId(database, 'memory_claim', Number(row.claim_id))
    if (!item) continue
    const result = syncSupportRow(database, 'memory_item_evidence', 'legacy_id = ?', [row.id], {
      item_id: item.id,
      channel_id: row.channel_id,
      source_kind: row.source_kind,
      observed_at: row.observed_at,
      effective_at: row.effective_at,
      job_id: row.job_id,
      source_message_id: row.source_message_id,
      speaker_user_id: row.speaker_user_id,
      legacy_id: row.id
    })
    if (result === 'inserted') report.copied_evidence += 1
  }
}

function copyEpisodes(database: Database.Database, report: MutableReport, newItemIds: Set<number>): void {
  const rows = database.prepare('SELECT * FROM memory_episode ORDER BY id').all() as Row[]
  for (const row of rows) {
    const existing = rowForLegacyId(database, 'memory_episode', Number(row.id))
    const version = existing
      ? Number(existing.version) + (valueEqual(existing.content, row.summary) ? 0 : 1)
      : undefined
    const itemId = syncItem(
      database,
      {
        guild_id: row.guild_id,
        kind: 'episode',
        subject_kind: 'guild',
        subject_user_id: null,
        predicate: null,
        content: row.summary,
        label: null,
        media_kind: null,
        content_key: null,
        source_job_id: row.id,
        period: 'current',
        object_kind: null,
        object_user_id: null,
        source_kind: null,
        status: 'active',
        needs_review: 0,
        end_reason: null,
        ended_at: null,
        superseded_by: null,
        confidence: null,
        salience: null,
        pinned: 0,
        valid_until: null,
        event_date: null,
        first_seen_at: row.started_at,
        last_seen_at: row.ended_at,
        last_recalled_at: null,
        created_at: row.created_at,
        legacy_table: 'memory_episode',
        legacy_id: row.id,
        legacy_embedding_text: null,
        ...(version === undefined ? {} : { version })
      },
      report,
      newItemIds
    )
    const occurrence = syncSupportRow(
      database,
      'memory_item_occurrence',
      "item_id = ? AND origin = 'episode'",
      [itemId],
      {
        item_id: itemId,
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        origin: 'episode',
        message_id: null,
        shared_by_user_id: null,
        source_author_id: null,
        span_start: row.started_at,
        observed_at: row.ended_at,
        legacy_id: null
      }
    )
    if (occurrence === 'inserted') report.copied_occurrences += 1
    syncVector(database, itemId, row, 'summary', String(row.summary), report)
  }
}

function copyMedia(database: Database.Database, report: MutableReport, newItemIds: Set<number>): void {
  const rows = database.prepare('SELECT * FROM media_digest ORDER BY id').all() as Row[]
  const occurrences = database.prepare('SELECT * FROM media_occurrence ORDER BY id').all() as Row[]
  const byDigest = new Map<number, Row[]>()
  for (const occurrence of occurrences) {
    const digestId = Number(occurrence.digest_id)
    byDigest.set(digestId, [...(byDigest.get(digestId) ?? []), occurrence])
  }

  for (const row of rows) {
    const shares = byDigest.get(Number(row.id)) ?? []
    const latestShare = shares.reduce<number | null>(
      (latest, share) => (latest === null ? Number(share.observed_at) : Math.max(latest, Number(share.observed_at))),
      null
    )
    const existing = rowForLegacyId(database, 'media_digest', Number(row.id))
    const version = existing
      ? Number(existing.version) +
        (valueEqual(existing.content, row.summary) && valueEqual(existing.label, row.label) ? 0 : 1)
      : undefined
    const itemId = syncItem(
      database,
      {
        guild_id: row.guild_id,
        kind: 'media',
        subject_kind: 'guild',
        subject_user_id: null,
        predicate: null,
        content: row.summary,
        label: row.label,
        media_kind: row.kind,
        content_key: row.content_key,
        source_job_id: null,
        period: 'current',
        object_kind: null,
        object_user_id: null,
        source_kind: null,
        status: 'active',
        needs_review: 0,
        end_reason: null,
        ended_at: null,
        superseded_by: null,
        confidence: null,
        salience: null,
        pinned: 0,
        valid_until: null,
        event_date: null,
        first_seen_at: row.created_at,
        last_seen_at: latestShare ?? row.created_at,
        last_recalled_at: null,
        created_at: row.created_at,
        legacy_table: 'media_digest',
        legacy_id: row.id,
        legacy_embedding_text: null,
        ...(version === undefined ? {} : { version })
      },
      report,
      newItemIds
    )

    const payload = database.prepare('SELECT digest_json FROM memory_item_payload WHERE item_id = ?').get(itemId) as
      | Row
      | undefined
    if (!payload) {
      database
        .prepare('INSERT INTO memory_item_payload (item_id, digest_json) VALUES (?, ?)')
        .run(itemId, row.digest_json)
      report.copied_payloads += 1
    } else if (!valueEqual(payload.digest_json, row.digest_json)) {
      database.prepare('UPDATE memory_item_payload SET digest_json = ? WHERE item_id = ?').run(row.digest_json, itemId)
    }

    syncVector(database, itemId, row, 'summary', String(row.summary), report)

    for (const share of shares) {
      const result = syncSupportRow(database, 'memory_item_occurrence', 'legacy_id = ?', [share.id], {
        item_id: itemId,
        guild_id: share.guild_id,
        channel_id: share.channel_id,
        origin: share.origin,
        message_id: share.message_id,
        shared_by_user_id: share.shared_by_user_id,
        source_author_id: share.source_author_id,
        span_start: null,
        observed_at: share.observed_at,
        legacy_id: share.id
      })
      if (result === 'inserted') report.copied_occurrences += 1
    }
  }
}

function removeOrphanProjectionRows(database: Database.Database, report: MutableReport): void {
  const sourceTables = [
    ['memory_claim', 'memory_claim'],
    ['memory_episode', 'memory_episode'],
    ['media_digest', 'media_digest']
  ] as const
  for (const [legacyTable, sourceTable] of sourceTables) {
    const orphanItems = database
      .prepare(`
        SELECT item.id FROM memory_item item
        WHERE item.legacy_table = ? AND NOT EXISTS (
          SELECT 1 FROM ${sourceTable} source WHERE source.id = item.legacy_id
        )
      `)
      .all(legacyTable) as Array<{ id: number }>
    for (const { id } of orphanItems) {
      database.prepare('DELETE FROM memory_item_evidence WHERE item_id = ?').run(id)
      database.prepare('DELETE FROM memory_item_occurrence WHERE item_id = ?').run(id)
      database.prepare('DELETE FROM memory_item_payload WHERE item_id = ?').run(id)
      database.prepare('DELETE FROM memory_item_embedding WHERE item_id = ?').run(id)
      database.prepare('DELETE FROM memory_item WHERE id = ?').run(id)
      report.deleted_items += 1
    }
  }
  database
    .prepare(`
    DELETE FROM memory_item_evidence
    WHERE legacy_id IS NULL OR NOT EXISTS (SELECT 1 FROM memory_evidence source WHERE source.id = memory_item_evidence.legacy_id)
  `)
    .run()
  database
    .prepare(`
    DELETE FROM memory_item_occurrence
    WHERE (legacy_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM media_occurrence source WHERE source.id = memory_item_occurrence.legacy_id
    )) OR (origin = 'episode' AND NOT EXISTS (
      SELECT 1 FROM memory_item item WHERE item.id = memory_item_occurrence.item_id AND item.legacy_table = 'memory_episode'
    ))
  `)
    .run()
  database
    .prepare(`
    DELETE FROM memory_item_payload
    WHERE NOT EXISTS (SELECT 1 FROM memory_item item WHERE item.id = memory_item_payload.item_id AND item.kind = 'media')
  `)
    .run()
  database
    .prepare(`
    DELETE FROM memory_item_embedding
    WHERE NOT EXISTS (SELECT 1 FROM memory_item item WHERE item.id = memory_item_embedding.item_id)
  `)
    .run()
}

function refreshClaimSuccessors(database: Database.Database, report: MutableReport, newItemIds: Set<number>): void {
  const claims = database.prepare('SELECT id, superseded_by FROM memory_claim').all() as Row[]
  const update = database.prepare('UPDATE memory_item SET superseded_by = ? WHERE id = ?')
  for (const claim of claims) {
    const item = rowForLegacyId(database, 'memory_claim', Number(claim.id))
    if (!item) continue
    const legacySuccessorId = (claim.superseded_by as number | null) ?? null
    const successor =
      legacySuccessorId === null ? undefined : rowForLegacyId(database, 'memory_claim', legacySuccessorId)
    const successorId = successor?.id ?? null
    if (valueEqual(item.superseded_by, successorId)) continue
    update.run(successorId, item.id)
    if (!newItemIds.has(Number(item.id))) report.refreshed_items += 1
  }
}

function valueEqual(left: unknown, right: unknown): boolean {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) ? left.equals(right) : left === right
}

function addCheck(result: Verification, passed: boolean): void {
  if (passed) result.passed += 1
  else result.failed += 1
}

function compareRows(source: Row, projected: Row, result: Verification): void {
  const columns = Object.keys(source)
  result.roundTripColumnsChecked += columns.length
  const projectedColumns = Object.keys(projected)
  addCheck(
    result,
    columns.length === projectedColumns.length && columns.every((column) => Object.hasOwn(projected, column))
  )
  for (const column of columns)
    addCheck(result, Object.hasOwn(projected, column) && valueEqual(source[column], projected[column]))
}

function projectedEmbedding(database: Database.Database, itemId: number): Row | undefined {
  const rows = database.prepare('SELECT * FROM memory_item_embedding WHERE item_id = ?').all(itemId) as Row[]
  return rows.length === 1 ? rows[0] : undefined
}

function projectClaim(database: Database.Database, claim: Row, result: Verification): boolean {
  const failuresBefore = result.failed
  const item = rowForLegacyId(database, 'memory_claim', Number(claim.id))
  if (!item) {
    addCheck(result, false)
    result.roundTripColumnsChecked += Object.keys(claim).length
    return false
  }
  const embedding = projectedEmbedding(database, Number(item.id))
  addCheck(result, (claim.embedding === null) === !embedding)
  addCheck(result, item.kind === 'fact' && item.subject_kind === claim.subject_kind)
  const expectedHash = typeof claim.embedding_text === 'string' ? sha256(claim.embedding_text) : null
  if (embedding?.text_hash !== null && embedding?.text_hash !== undefined)
    addCheck(result, embedding.text_hash === expectedHash)
  const successor =
    item.superseded_by === null
      ? null
      : (database.prepare('SELECT legacy_id FROM memory_item WHERE id = ?').get(item.superseded_by) as Row | undefined)
  const projected: Row = {
    id: item.legacy_id,
    guild_id: item.guild_id,
    subject_kind: item.subject_kind,
    subject_user_id: item.subject_user_id,
    predicate: item.predicate,
    value: item.content,
    object_kind: item.object_kind,
    object_user_id: item.object_user_id,
    source_kind: item.source_kind,
    status: item.status,
    confidence: item.confidence,
    salience: item.salience,
    pinned: item.pinned,
    needs_review: item.needs_review,
    superseded_by: successor?.legacy_id ?? null,
    first_seen_at: item.first_seen_at,
    last_seen_at: item.last_seen_at,
    last_recalled_at: item.last_recalled_at,
    ended_at: item.ended_at,
    end_reason: item.end_reason,
    expires_at: item.valid_until,
    event_date: item.event_date,
    embedding: embedding?.vector ?? null,
    embedding_text: item.legacy_embedding_text,
    embedding_model_id: embedding?.model_id ?? null,
    embedding_dim: embedding?.dim ?? null,
    embedding_fingerprint: embedding?.fingerprint ?? null,
    period: item.period
  }
  compareRows(claim, projected, result)
  return result.failed === failuresBefore
}

function projectEvidence(database: Database.Database, evidence: Row, result: Verification): boolean {
  const failuresBefore = result.failed
  const row = database
    .prepare(`
      SELECT i.legacy_id AS claim_id, e.channel_id, e.source_kind, e.observed_at, e.effective_at, e.job_id,
             e.source_message_id, e.speaker_user_id
      FROM memory_item_evidence e JOIN memory_item i ON i.id = e.item_id
      WHERE e.legacy_id = ?
    `)
    .get(evidence.id) as Row | undefined
  if (!row) {
    addCheck(result, false)
    result.roundTripColumnsChecked += Object.keys(evidence).length
    return false
  }
  compareRows(evidence, { id: evidence.id, ...row }, result)
  return result.failed === failuresBefore
}

function projectEpisode(database: Database.Database, episode: Row, result: Verification): boolean {
  const failuresBefore = result.failed
  const item = rowForLegacyId(database, 'memory_episode', Number(episode.id))
  if (!item) {
    addCheck(result, false)
    result.roundTripColumnsChecked += Object.keys(episode).length
    return false
  }
  const embedding = projectedEmbedding(database, Number(item.id))
  addCheck(result, (episode.embedding === null) === !embedding)
  addCheck(result, item.kind === 'episode' && item.subject_kind === 'guild')
  const expectedHash = sha256(String(episode.summary))
  if (embedding?.text_hash !== null && embedding?.text_hash !== undefined)
    addCheck(result, embedding.text_hash === expectedHash)
  const occurrence = database
    .prepare(
      "SELECT guild_id, channel_id, span_start, observed_at FROM memory_item_occurrence WHERE item_id = ? AND origin = 'episode'"
    )
    .get(item.id) as Row | undefined
  if (!occurrence) addCheck(result, false)
  const projected = {
    id: item.source_job_id,
    guild_id: item.guild_id,
    channel_id: occurrence?.channel_id,
    started_at: occurrence?.span_start,
    ended_at: occurrence?.observed_at,
    summary: item.content,
    embedding: embedding?.vector ?? null,
    created_at: item.created_at,
    embedding_model_id: embedding?.model_id ?? null,
    embedding_dim: embedding?.dim ?? null,
    embedding_fingerprint: embedding?.fingerprint ?? null
  }
  compareRows(episode, projected, result)
  return result.failed === failuresBefore
}

function projectMedia(database: Database.Database, digest: Row, result: Verification): boolean {
  const failuresBefore = result.failed
  const item = rowForLegacyId(database, 'media_digest', Number(digest.id))
  if (!item) {
    addCheck(result, false)
    result.roundTripColumnsChecked += Object.keys(digest).length
    return false
  }
  const embedding = projectedEmbedding(database, Number(item.id))
  addCheck(result, (digest.embedding === null) === !embedding)
  addCheck(result, item.kind === 'media' && item.subject_kind === 'guild')
  const expectedHash = sha256(String(digest.summary))
  if (embedding?.text_hash !== null && embedding?.text_hash !== undefined)
    addCheck(result, embedding.text_hash === expectedHash)
  const payload = database.prepare('SELECT digest_json FROM memory_item_payload WHERE item_id = ?').get(item.id) as
    | Row
    | undefined
  if (!payload) addCheck(result, false)
  const projected = {
    id: item.legacy_id,
    guild_id: item.guild_id,
    content_key: item.content_key,
    kind: item.media_kind,
    label: item.label,
    summary: item.content,
    digest_json: payload?.digest_json,
    embedding: embedding?.vector ?? null,
    created_at: item.created_at,
    embedding_model_id: embedding?.model_id ?? null,
    embedding_dim: embedding?.dim ?? null,
    embedding_fingerprint: embedding?.fingerprint ?? null
  }
  compareRows(digest, projected, result)
  return result.failed === failuresBefore
}

function projectMediaOccurrence(database: Database.Database, occurrence: Row, result: Verification): boolean {
  const failuresBefore = result.failed
  const row = database
    .prepare(`
      SELECT i.legacy_id AS digest_id, o.guild_id, o.channel_id, o.message_id, o.shared_by_user_id,
             o.source_author_id, o.origin, o.observed_at
      FROM memory_item_occurrence o JOIN memory_item i ON i.id = o.item_id
      WHERE o.legacy_id = ?
    `)
    .get(occurrence.id) as Row | undefined
  if (!row) {
    addCheck(result, false)
    result.roundTripColumnsChecked += Object.keys(occurrence).length
    return false
  }
  compareRows(occurrence, { id: occurrence.id, ...row }, result)
  return result.failed === failuresBefore
}

function countBy(rows: readonly Row[], key: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const value = String(row[key])
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function countDistribution(counts: readonly number[]): Record<string, number> {
  const distribution: Record<string, number> = {}
  for (const count of counts) distribution[String(count)] = (distribution[String(count)] ?? 0) + 1
  return distribution
}

function sameCounts(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => (left[key] ?? 0) === (right[key] ?? 0))
}

function expectedCategoryCounts(claims: readonly Row[], episodes: readonly Row[], media: readonly Row[]) {
  const all = [
    ...claims.map((row) => ({ kind: 'fact', subject_kind: row.subject_kind, status: row.status, period: row.period })),
    ...episodes.map(() => ({ kind: 'episode', subject_kind: 'guild', status: 'active', period: 'current' })),
    ...media.map(() => ({ kind: 'media', subject_kind: 'guild', status: 'active', period: 'current' }))
  ]
  return {
    kinds: countBy(all, 'kind'),
    subjects: countBy(all, 'subject_kind'),
    statuses: countBy(all, 'status'),
    periods: countBy(all, 'period')
  }
}

function sourceVectorRows(
  claims: readonly Row[],
  episodes: readonly Row[],
  media: readonly Row[]
): Array<{
  legacyTable: 'memory_claim' | 'memory_episode' | 'media_digest'
  legacyId: number
  fingerprint: string
  modelId: unknown
  dim: unknown
  textHash: string | null
}> {
  return [
    ...claims.filter(hasVector).map((row) => ({
      legacyTable: 'memory_claim' as const,
      legacyId: Number(row.id),
      fingerprint: fingerprint(row),
      modelId: row.embedding_model_id,
      dim: row.embedding_dim,
      textHash: typeof row.embedding_text === 'string' ? sha256(row.embedding_text) : null
    })),
    ...episodes.filter(hasVector).map((row) => ({
      legacyTable: 'memory_episode' as const,
      legacyId: Number(row.id),
      fingerprint: fingerprint(row),
      modelId: row.embedding_model_id,
      dim: row.embedding_dim,
      textHash: sha256(String(row.summary))
    })),
    ...media.filter(hasVector).map((row) => ({
      legacyTable: 'media_digest' as const,
      legacyId: Number(row.id),
      fingerprint: fingerprint(row),
      modelId: row.embedding_model_id,
      dim: row.embedding_dim,
      textHash: sha256(String(row.summary))
    }))
  ]
}

function verify(
  database: Database.Database,
  claims: Row[],
  evidence: Row[],
  episodes: Row[],
  media: Row[],
  mediaOccurrences: Row[]
): {
  result: Verification
  report: Omit<
    MemoryItemsMigrationReport,
    | 'copied_items'
    | 'refreshed_items'
    | 'deleted_items'
    | 'copied_evidence'
    | 'copied_occurrences'
    | 'copied_payloads'
    | 'copied_embeddings'
  >
} {
  const result: Verification = {
    passed: 0,
    failed: 0,
    roundTripColumnsChecked: 0,
    driftCounts: { fact: 0, episode: 0, media: 0 }
  }
  const items = database.prepare('SELECT * FROM memory_item ORDER BY id').all() as Row[]
  const itemEvidence = database.prepare('SELECT * FROM memory_item_evidence ORDER BY id').all() as Row[]
  const itemOccurrences = database.prepare('SELECT * FROM memory_item_occurrence ORDER BY id').all() as Row[]
  const itemEmbeddings = database
    .prepare('SELECT * FROM memory_item_embedding ORDER BY item_id, fingerprint')
    .all() as Row[]
  const itemPayloads = database.prepare('SELECT * FROM memory_item_payload ORDER BY item_id').all() as Row[]
  const expectedCounts = expectedCategoryCounts(claims, episodes, media)
  const kindCounts = countBy(items, 'kind')
  const subjectCounts = countBy(items, 'subject_kind')
  const statusCounts = countBy(items, 'status')
  const periodCounts = countBy(items, 'period')
  const completeIds = items.filter(
    (item) => typeof item.legacy_table === 'string' && typeof item.legacy_id === 'number'
  )
  const uniqueIds = new Set(completeIds.map((item) => `${item.legacy_table}\u0000${item.legacy_id}`))
  const expectedLegacyCount = claims.length + episodes.length + media.length
  addCheck(result, sameCounts(expectedCounts.kinds, kindCounts))
  addCheck(result, sameCounts(expectedCounts.subjects, subjectCounts))
  addCheck(result, sameCounts(expectedCounts.statuses, statusCounts))
  addCheck(result, sameCounts(expectedCounts.periods, periodCounts))
  addCheck(result, items.length === expectedLegacyCount)
  addCheck(result, completeIds.length === items.length && uniqueIds.size === completeIds.length)
  addCheck(result, itemEvidence.length === evidence.length)
  addCheck(result, itemOccurrences.length === mediaOccurrences.length + episodes.length)
  addCheck(result, itemPayloads.length === media.length)

  for (const claim of claims) {
    if (!projectClaim(database, claim, result)) result.driftCounts.fact += 1
  }
  for (const row of evidence) {
    if (!projectEvidence(database, row, result)) result.driftCounts.fact += 1
  }
  for (const row of episodes) {
    if (!projectEpisode(database, row, result)) result.driftCounts.episode += 1
  }
  for (const row of media) {
    if (!projectMedia(database, row, result)) result.driftCounts.media += 1
  }
  for (const row of mediaOccurrences) {
    if (!projectMediaOccurrence(database, row, result)) result.driftCounts.media += 1
  }
  const sourceIds = {
    memory_claim: new Set(claims.map((row) => Number(row.id))),
    memory_episode: new Set(episodes.map((row) => Number(row.id))),
    media_digest: new Set(media.map((row) => Number(row.id)))
  }
  for (const item of items) {
    const table = item.legacy_table as keyof typeof sourceIds
    const kind = item.kind as keyof Verification['driftCounts']
    if (!sourceIds[table]?.has(Number(item.legacy_id))) result.driftCounts[kind] += 1
  }
  const sourceEvidenceIds = new Set(evidence.map((row) => Number(row.id)))
  for (const row of itemEvidence) {
    if (!sourceEvidenceIds.has(Number(row.legacy_id))) result.driftCounts.fact += 1
  }
  const sourceOccurrenceIds = new Set(mediaOccurrences.map((row) => Number(row.id)))
  for (const row of itemOccurrences) {
    if (row.legacy_id !== null && !sourceOccurrenceIds.has(Number(row.legacy_id))) result.driftCounts.media += 1
    if (row.origin === 'episode') {
      const parent = database.prepare('SELECT legacy_id FROM memory_item WHERE id = ?').get(row.item_id) as
        | Row
        | undefined
      if (!episodes.some((episode) => Number(episode.id) === Number(parent?.legacy_id))) result.driftCounts.episode += 1
    }
  }

  const expectedEvidenceCounts = new Map<number, number>()
  for (const row of evidence)
    expectedEvidenceCounts.set(Number(row.claim_id), (expectedEvidenceCounts.get(Number(row.claim_id)) ?? 0) + 1)
  const expectedOccurrenceCounts = new Map<number, number>()
  for (const row of mediaOccurrences) {
    const digestId = Number(row.digest_id)
    expectedOccurrenceCounts.set(digestId, (expectedOccurrenceCounts.get(digestId) ?? 0) + 1)
  }
  for (const row of items) {
    const expectedEvidenceCount =
      row.legacy_table === 'memory_claim' ? (expectedEvidenceCounts.get(Number(row.legacy_id)) ?? 0) : 0
    const expectedOccurrenceCount =
      row.legacy_table === 'memory_episode'
        ? 1
        : row.legacy_table === 'media_digest'
          ? (expectedOccurrenceCounts.get(Number(row.legacy_id)) ?? 0)
          : 0
    const actualEvidenceCount = Number(
      (database.prepare('SELECT COUNT(*) AS count FROM memory_item_evidence WHERE item_id = ?').get(row.id) as Row)
        .count
    )
    const actualOccurrenceCount = Number(
      (database.prepare('SELECT COUNT(*) AS count FROM memory_item_occurrence WHERE item_id = ?').get(row.id) as Row)
        .count
    )
    addCheck(result, actualEvidenceCount === expectedEvidenceCount)
    addCheck(result, actualOccurrenceCount === expectedOccurrenceCount)
  }

  for (const claim of claims) {
    const item = rowForLegacyId(database, 'memory_claim', Number(claim.id))
    if (item) {
      addCheck(result, valueEqual(item.first_seen_at, claim.first_seen_at))
      addCheck(result, valueEqual(item.last_seen_at, claim.last_seen_at))
      addCheck(result, valueEqual(item.last_recalled_at, claim.last_recalled_at))
      addCheck(result, valueEqual(item.ended_at, claim.ended_at))
      addCheck(result, valueEqual(item.valid_until, claim.expires_at))
      addCheck(result, item.created_at === null)
    }
  }
  for (const episode of episodes) {
    const item = rowForLegacyId(database, 'memory_episode', Number(episode.id))
    if (item) {
      addCheck(result, valueEqual(item.first_seen_at, episode.started_at))
      addCheck(result, valueEqual(item.last_seen_at, episode.ended_at))
      addCheck(result, valueEqual(item.created_at, episode.created_at))
      addCheck(result, item.last_recalled_at === null && item.ended_at === null && item.valid_until === null)
    }
  }
  for (const digest of media) {
    const item = rowForLegacyId(database, 'media_digest', Number(digest.id))
    if (item) {
      const latestShare = mediaOccurrences
        .filter((row) => Number(row.digest_id) === Number(digest.id))
        .reduce<number | null>(
          (latest, row) => (latest === null ? Number(row.observed_at) : Math.max(latest, Number(row.observed_at))),
          null
        )
      addCheck(result, valueEqual(item.first_seen_at, digest.created_at))
      addCheck(result, valueEqual(item.last_seen_at, latestShare ?? digest.created_at))
      addCheck(result, valueEqual(item.created_at, digest.created_at))
      addCheck(result, item.last_recalled_at === null && item.ended_at === null && item.valid_until === null)
    }
  }
  for (const row of itemEvidence) {
    const source = evidence.find((candidate) => candidate.id === row.legacy_id)
    if (source) {
      addCheck(result, valueEqual(row.observed_at, source.observed_at))
      addCheck(result, valueEqual(row.effective_at, source.effective_at))
    }
  }
  for (const row of itemOccurrences) {
    if (row.legacy_id !== null) {
      const source = mediaOccurrences.find((candidate) => candidate.id === row.legacy_id)
      if (source) addCheck(result, valueEqual(row.observed_at, source.observed_at))
    } else if (row.origin === 'episode') {
      const parent = database.prepare('SELECT legacy_id FROM memory_item WHERE id = ?').get(row.item_id) as
        | Row
        | undefined
      const source = episodes.find((candidate) => candidate.id === parent?.legacy_id)
      addCheck(result, Boolean(source))
      if (source) {
        addCheck(result, valueEqual(row.span_start, source.started_at))
        addCheck(result, valueEqual(row.observed_at, source.ended_at))
      }
    }
  }
  for (const embedding of itemEmbeddings) {
    if (embedding.created_at !== null) {
      addCheck(result, false)
      const item = database.prepare('SELECT kind FROM memory_item WHERE id = ?').get(embedding.item_id) as
        | { kind: keyof Verification['driftCounts'] }
        | undefined
      if (item) result.driftCounts[item.kind] += 1
    } else addCheck(result, true)
  }

  const sourceVectors = sourceVectorRows(claims, episodes, media)
  const sourceProvenance = {
    model_id: sourceVectors.filter((row) => row.modelId !== null && row.modelId !== undefined).length,
    dim: sourceVectors.filter((row) => row.dim !== null && row.dim !== undefined).length,
    fingerprint: sourceVectors.length,
    text_hash: sourceVectors.filter((row) => row.textHash !== null).length
  }
  const itemProvenance = {
    model_id: itemEmbeddings.filter((row) => row.model_id !== null).length,
    dim: itemEmbeddings.filter((row) => row.dim !== null).length,
    fingerprint: itemEmbeddings.filter((row) => row.fingerprint !== null).length,
    text_hash: itemEmbeddings.filter((row) => row.text_hash !== null).length
  }
  addCheck(
    result,
    sameCounts(
      { model_id: sourceProvenance.model_id, dim: sourceProvenance.dim, fingerprint: sourceProvenance.fingerprint },
      { model_id: itemProvenance.model_id, dim: itemProvenance.dim, fingerprint: itemProvenance.fingerprint }
    )
  )
  const expectedHashes = new Map(
    sourceVectors.map((row) => [`${row.legacyTable}\u0000${row.legacyId}\u0000${row.fingerprint}`, row.textHash])
  )
  addCheck(result, itemProvenance.text_hash <= sourceProvenance.text_hash)
  for (const embedding of itemEmbeddings) {
    if (embedding.text_hash === null) continue
    const item = database
      .prepare('SELECT legacy_table, legacy_id FROM memory_item WHERE id = ?')
      .get(embedding.item_id) as Row | undefined
    addCheck(
      result,
      expectedHashes.get(`${item?.legacy_table}\u0000${item?.legacy_id}\u0000${embedding.fingerprint}`) ===
        embedding.text_hash
    )
  }

  const sourceVectorsByFingerprint = countBy(
    sourceVectors.map((row) => ({ fingerprint: row.fingerprint })),
    'fingerprint'
  )
  const itemVectorsByFingerprint = countBy(itemEmbeddings, 'fingerprint')
  addCheck(result, sameCounts(sourceVectorsByFingerprint, itemVectorsByFingerprint))

  const report: Omit<
    MemoryItemsMigrationReport,
    | 'copied_items'
    | 'refreshed_items'
    | 'deleted_items'
    | 'copied_evidence'
    | 'copied_occurrences'
    | 'copied_payloads'
    | 'copied_embeddings'
  > = {
    kind_counts: {
      fact: kindCounts.fact ?? 0,
      episode: kindCounts.episode ?? 0,
      media: kindCounts.media ?? 0
    },
    subject_counts: { user: subjectCounts.user ?? 0, guild: subjectCounts.guild ?? 0 },
    status_counts: {
      candidate: statusCounts.candidate ?? 0,
      active: statusCounts.active ?? 0,
      superseded: statusCounts.superseded ?? 0,
      rejected: statusCounts.rejected ?? 0
    },
    period_counts: { current: periodCounts.current ?? 0, past: periodCounts.past ?? 0 },
    evidence_per_item: countDistribution(
      items.map((item) =>
        Number(
          (database.prepare('SELECT COUNT(*) AS count FROM memory_item_evidence WHERE item_id = ?').get(item.id) as Row)
            .count
        )
      )
    ),
    occurrences_per_item: countDistribution(
      items.map((item) =>
        Number(
          (
            database
              .prepare('SELECT COUNT(*) AS count FROM memory_item_occurrence WHERE item_id = ?')
              .get(item.id) as Row
          ).count
        )
      )
    ),
    non_null_provenance_counts: itemProvenance,
    vector_counts_by_fingerprint: Object.entries(itemVectorsByFingerprint)
      .map(([value, count]) => ({ fingerprint_hash: sha256(value).slice(0, 16), count }))
      .sort((left, right) => left.fingerprint_hash.localeCompare(right.fingerprint_hash)),
    legacy_ids: { expected: expectedLegacyCount, complete: completeIds.length, unique: uniqueIds.size },
    checks: {
      category_counts: true,
      evidence_occurrences_per_item: true,
      non_null_provenance_counts: true,
      vectors_by_fingerprint: true,
      legacy_ids_complete_unique: true,
      timestamps_no_inventions: true,
      round_trip_all_columns: true
    },
    checks_passed: result.passed,
    checks_failed: 0,
    round_trip_columns_checked: result.roundTripColumnsChecked
  }
  return { result, report }
}

export function getMemoryItemDriftCounts(database: Database.Database): {
  fact: number
  episode: number
  media: number
} {
  const claims = database.prepare('SELECT * FROM memory_claim ORDER BY id').all() as Row[]
  const evidence = database.prepare('SELECT * FROM memory_evidence ORDER BY id').all() as Row[]
  const episodes = database.prepare('SELECT * FROM memory_episode ORDER BY id').all() as Row[]
  const media = database.prepare('SELECT * FROM media_digest ORDER BY id').all() as Row[]
  const occurrences = database.prepare('SELECT * FROM media_occurrence ORDER BY id').all() as Row[]
  return verify(database, claims, evidence, episodes, media, occurrences).result.driftCounts
}

export function migrateMemoryItems(database: Database.Database): MemoryItemsMigrationReport {
  const transaction = database.transaction(() => {
    const report: MutableReport = {
      copied_items: 0,
      refreshed_items: 0,
      deleted_items: 0,
      copied_evidence: 0,
      copied_occurrences: 0,
      copied_payloads: 0,
      copied_embeddings: 0
    }
    const newItemIds = new Set<number>()
    copyClaims(database, report, newItemIds)
    copyEpisodes(database, report, newItemIds)
    copyMedia(database, report, newItemIds)
    removeOrphanProjectionRows(database, report)
    refreshClaimSuccessors(database, report, newItemIds)

    const claims = database.prepare('SELECT * FROM memory_claim ORDER BY id').all() as Row[]
    const evidence = database.prepare('SELECT * FROM memory_evidence ORDER BY id').all() as Row[]
    const episodes = database.prepare('SELECT * FROM memory_episode ORDER BY id').all() as Row[]
    const media = database.prepare('SELECT * FROM media_digest ORDER BY id').all() as Row[]
    const occurrences = database.prepare('SELECT * FROM media_occurrence ORDER BY id').all() as Row[]
    const verification = verify(database, claims, evidence, episodes, media, occurrences)
    if (verification.result.failed > 0) {
      throw new Error(`Memory item backfill verification failed (${verification.result.failed} checks)`)
    }
    return { ...report, ...verification.report }
  })

  return transaction()
}

export type { MemoryItemsMigrationReport }
