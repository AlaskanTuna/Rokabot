import { getDb } from './database.js'
import {
  type EmbeddingVector,
  type EpisodeEmbedding,
  type StoredVector,
  decodeFloat32Embedding,
  isActiveVector,
  vectorParams
} from './memoryEpisodeStore.js'

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
