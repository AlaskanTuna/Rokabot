import { renderFactSentence } from '../agent/memory/factSentences.js'
import { config } from '../config.js'
import { getDb } from './database.js'
import {
  type EmbeddingVector,
  type EpisodeEmbedding,
  type StoredVector,
  decodeFloat32Embedding,
  isActiveVector,
  vectorParams
} from './memoryEpisodeStore.js'
import { decodeMemoryItemEmbedding, findMemoryItemById, writeMemoryItemEmbedding } from './memoryItemStore.js'

export type ClaimEmbeddingState = Readonly<{
  id: number
  subjectKind: 'user' | 'guild'
  predicate: string
  value: string
  eventDate: string | null
  period: 'current' | 'past'
  embeddingText: string | null
  hasEmbedding: boolean
}>

type ClaimEmbeddingRow = {
  id: number
  subject_kind: 'user' | 'guild'
  predicate: string
  value: string
  event_date: string | null
  period: string
  embedding_text: string | null
  embedding_bytes: number | null
  embedding_dim: number | null
  embedding_fingerprint: string | null
}

export function listActiveClaimsForEmbedding(): ClaimEmbeddingState[] {
  if (config.memory.store === 'item') {
    const rows = getDb()
      .prepare(`
        SELECT COALESCE(item.legacy_id, item.id) AS id, item.subject_kind, item.predicate, item.content AS value,
               item.event_date, item.period, item.legacy_embedding_text AS embedding_text,
               embedding.vector AS embedding, embedding.dim AS embedding_dim,
               embedding.fingerprint AS embedding_fingerprint
        FROM memory_item item
        LEFT JOIN memory_item_embedding embedding
          ON embedding.item_id = item.id AND embedding.fingerprint = (
            SELECT candidate.fingerprint FROM memory_item_embedding candidate WHERE candidate.item_id = item.id
            ORDER BY (candidate.fingerprint = ?) DESC, candidate.fingerprint LIMIT 1
          )
        WHERE item.kind = 'fact' AND item.status = 'active'
        ORDER BY COALESCE(item.legacy_id, item.id)
      `)
      .all(config.embeddings.fingerprint) as Array<{
      id: number
      subject_kind: 'user' | 'guild'
      predicate: string
      value: string
      event_date: string | null
      period: string
      embedding_text: string | null
      embedding: Buffer | null
      embedding_dim: number | null
      embedding_fingerprint: string | null
    }>
    return rows.map((row) => ({
      id: row.id,
      subjectKind: row.subject_kind,
      predicate: row.predicate,
      value: row.value,
      eventDate: row.event_date,
      period: row.period as ClaimEmbeddingState['period'],
      embeddingText: row.embedding_text,
      hasEmbedding:
        row.embedding !== null &&
        row.embedding_fingerprint !== null &&
        isActiveVector(row.embedding_fingerprint, row.embedding_dim, row.embedding.byteLength)
    }))
  }
  const rows = getDb()
    .prepare(
      `SELECT id, subject_kind, predicate, value, event_date, period, embedding_text,
              length(embedding) AS embedding_bytes, embedding_dim, embedding_fingerprint
       FROM memory_claim WHERE status = 'active' ORDER BY id`
    )
    .all() as ClaimEmbeddingRow[]
  return rows.map((row) => ({
    id: row.id,
    subjectKind: row.subject_kind,
    predicate: row.predicate,
    value: row.value,
    eventDate: row.event_date,
    period: row.period as ClaimEmbeddingState['period'],
    embeddingText: row.embedding_text,
    // A vector from another embedding space counts as missing, so the next sweep re-embeds it.
    hasEmbedding:
      row.embedding_bytes !== null && isActiveVector(row.embedding_fingerprint, row.embedding_dim, row.embedding_bytes)
  }))
}

export function setClaimEmbedding(input: { id: number; embeddingText: string; embedding: EmbeddingVector }): boolean {
  if (config.memory.store === 'item') {
    const database = getDb()
    return database.transaction(() => {
      const item = findMemoryItemById(database, 'fact', input.id, 'memory_claim')
      if (item?.status !== 'active') return false
      const [vector, modelId, dim, fingerprint] = vectorParams(input.embedding, 'Fact')
      database
        .prepare('UPDATE memory_item SET legacy_embedding_text = ? WHERE id = ?')
        .run(input.embeddingText, item.id)
      writeMemoryItemEmbedding(database, {
        itemId: item.id,
        fingerprint: fingerprint ?? config.embeddings.fingerprint,
        modelId,
        dim: dim ?? input.embedding.dim,
        renderer: 'fact_sentence',
        text: input.embeddingText,
        vector: vector as Buffer
      })
      return true
    })()
  }
  const result = getDb()
    .prepare(
      `UPDATE memory_claim SET embedding = ?, embedding_model_id = ?, embedding_dim = ?, embedding_fingerprint = ?,
         embedding_text = ?
       WHERE id = ? AND status = 'active'`
    )
    .run(...vectorParams(input.embedding, 'Fact'), input.embeddingText, input.id)
  return result.changes === 1
}

export function getClaimEmbeddings(claimIds: readonly number[]): Map<number, EpisodeEmbedding> {
  const embeddings = new Map<number, EpisodeEmbedding>()
  if (claimIds.length === 0) return embeddings

  if (config.memory.store === 'item') {
    const database = getDb()
    for (const claimId of claimIds) {
      const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
      if (!item) continue
      const row = database
        .prepare(`
          SELECT fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector
          FROM memory_item_embedding WHERE item_id = ?
          ORDER BY (fingerprint = ?) DESC, fingerprint
        `)
        .get(item.id, config.embeddings.fingerprint) as
        | {
            fingerprint: string
            model_id: string | null
            dim: number
            renderer: 'fact_sentence' | 'summary'
            renderer_version: number
            text_hash: string | null
            vector: Buffer
          }
        | undefined
      if (!row) continue
      const embeddingText =
        item.legacy_embedding_text ??
        renderFactSentence({
          subjectKind: item.subject_kind,
          predicate: item.predicate ?? '',
          value: item.content,
          eventDate: item.event_date,
          period: item.period
        })
      const embedding = decodeMemoryItemEmbedding(row, embeddingText, 'fact_sentence')
      if (embedding) embeddings.set(claimId, embedding)
    }
    return embeddings
  }

  const placeholders = claimIds.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT id, embedding, embedding_dim, embedding_fingerprint FROM memory_claim WHERE id IN (${placeholders})`
    )
    .all(...claimIds) as Array<StoredVector & { id: number }>
  for (const row of rows) {
    const embedding = decodeFloat32Embedding(row)
    if (embedding) embeddings.set(row.id, embedding)
  }
  return embeddings
}

/** A claim with no evidence rows maps to [null]: its source channel is unknown, which `balanced` treats as public. */
export function getClaimSourceChannels(claimIds: readonly number[]): Map<number, Array<string | null>> {
  const channels = new Map<number, Array<string | null>>()
  if (claimIds.length === 0) return channels

  if (config.memory.store === 'item') {
    const database = getDb()
    for (const claimId of claimIds) {
      const item = findMemoryItemById(database, 'fact', claimId, 'memory_claim')
      if (!item) continue
      const rows = database
        .prepare('SELECT channel_id FROM memory_item_evidence WHERE item_id = ?')
        .all(item.id) as Array<{ channel_id: string | null }>
      channels.set(claimId, rows.length > 0 ? rows.map(({ channel_id }) => channel_id) : [null])
    }
    return channels
  }

  const placeholders = claimIds.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(`SELECT claim_id, channel_id FROM memory_evidence WHERE claim_id IN (${placeholders})`)
    .all(...claimIds) as Array<{ claim_id: number; channel_id: string | null }>
  for (const row of rows) {
    channels.set(row.claim_id, [...(channels.get(row.claim_id) ?? []), row.channel_id])
  }
  for (const claimId of claimIds) {
    if (!channels.has(claimId)) channels.set(claimId, [null])
  }
  return channels
}
