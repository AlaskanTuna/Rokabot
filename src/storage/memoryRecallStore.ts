import { getDb } from './database.js'
import { type EpisodeEmbedding, decodeFloat32Embedding, encodeFloat32Embedding } from './memoryEpisodeStore.js'

export type ClaimEmbeddingState = Readonly<{
  id: number
  subjectKind: 'user' | 'guild'
  predicate: string
  value: string
  eventDate: string | null
  embeddingText: string | null
  hasEmbedding: boolean
}>

type ClaimEmbeddingRow = {
  id: number
  subject_kind: 'user' | 'guild'
  predicate: string
  value: string
  event_date: string | null
  embedding_text: string | null
  has_embedding: number
}

export function listActiveClaimsForEmbedding(): ClaimEmbeddingState[] {
  const rows = getDb()
    .prepare(
      `SELECT id, subject_kind, predicate, value, event_date, embedding_text, embedding IS NOT NULL AS has_embedding
       FROM memory_claim WHERE status = 'active' ORDER BY id`
    )
    .all() as ClaimEmbeddingRow[]
  return rows.map((row) => ({
    id: row.id,
    subjectKind: row.subject_kind,
    predicate: row.predicate,
    value: row.value,
    eventDate: row.event_date,
    embeddingText: row.embedding_text,
    hasEmbedding: row.has_embedding === 1
  }))
}

export function setClaimEmbedding(input: { id: number; embeddingText: string; embedding: readonly number[] }): boolean {
  const result = getDb()
    .prepare("UPDATE memory_claim SET embedding = ?, embedding_text = ? WHERE id = ? AND status = 'active'")
    .run(encodeFloat32Embedding(input.embedding, 'Fact'), input.embeddingText, input.id)
  return result.changes === 1
}

export function getClaimEmbeddings(claimIds: readonly number[]): Map<number, EpisodeEmbedding> {
  const embeddings = new Map<number, EpisodeEmbedding>()
  if (claimIds.length === 0) return embeddings

  const placeholders = claimIds.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(`SELECT id, embedding FROM memory_claim WHERE id IN (${placeholders})`)
    .all(...claimIds) as Array<{ id: number; embedding: Buffer | null }>
  for (const row of rows) {
    const embedding = decodeFloat32Embedding(row.embedding)
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
