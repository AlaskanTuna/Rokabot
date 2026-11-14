import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../database.js'
import { fillMemoryItemEmbeddingHashes, sweepMemoryItemIntegrity } from '../memoryItemIntegrity.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import { decodeMemoryItemEmbedding } from '../memoryItemStore.js'

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

function seedClaim(): number {
  const result = getDb()
    .prepare(`
      INSERT INTO memory_claim (
        guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
        confidence, salience, first_seen_at, last_seen_at, embedding_text
      ) VALUES ('guild-fixture', 'user', 'user-fixture', 'hobby', 'chess', 'explicit', 'active',
                0.8, 0.7, 10, 20, 'A hobby: chess.')
    `)
    .run()
  return Number(result.lastInsertRowid)
}

describe('memory item integrity maintenance', () => {
  it('writes value-free drift counts and warns when the projection is out of sync', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    const { logger } = await import('../../utils/logger.js')
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    seedClaim()

    expect(sweepMemoryItemIntegrity(getDb())).toEqual({ fact: 1, episode: 0, media: 0 })
    const event = getDb().prepare('SELECT kind, guild_id, channel_id, subject_user_id, detail FROM memory_events').get()
    expect(event).toEqual({
      kind: 'item_integrity',
      guild_id: null,
      channel_id: null,
      subject_user_id: null,
      detail: JSON.stringify({ fact: 1, episode: 0, media: 0 })
    })
    expect(warning).toHaveBeenCalledOnce()
    expect(JSON.stringify(event)).not.toContain('chess')
  })

  it('records zero drift after a matching projection', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    const { migrateMemoryItems } = await import('../memoryItemBackfill.js')
    seedClaim()
    migrateMemoryItems(getDb())

    expect(sweepMemoryItemIntegrity(getDb())).toEqual({ fact: 0, episode: 0, media: 0 })
    expect(getDb().prepare("SELECT detail FROM memory_events WHERE kind = 'item_integrity'").get()).toEqual({
      detail: JSON.stringify({ fact: 0, episode: 0, media: 0 })
    })
  })

  it('treats NULL text hashes as readable and fills them from stored item text', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    const database = getDb()
    configureMemoryItemProjectionTriggers(database, 'dual')
    const claimId = seedClaim()
    const vector = Buffer.alloc(768 * 4)
    for (let index = 0; index < 768; index += 1) vector.writeFloatLE(1, index * 4)
    database
      .prepare('UPDATE memory_claim SET embedding = ?, embedding_dim = 768, embedding_fingerprint = ? WHERE id = ?')
      .run(vector, 'gemini:gemini-embedding-2:768:gemini-task-prefix', claimId)

    const embedding = database
      .prepare(`
      SELECT item_id, fingerprint, model_id, dim, renderer, renderer_version, text_hash, vector
      FROM memory_item_embedding WHERE item_id = (SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = ?)
    `)
      .get(claimId) as Parameters<typeof decodeMemoryItemEmbedding>[0] & { item_id: number }
    expect(embedding.text_hash).toBeNull()
    expect(decodeMemoryItemEmbedding(embedding, 'A hobby: chess.', 'fact_sentence')).not.toBeNull()

    expect(fillMemoryItemEmbeddingHashes(database)).toBe(1)
    expect(
      database.prepare('SELECT text_hash FROM memory_item_embedding WHERE item_id = ?').get(embedding.item_id)
    ).toEqual({
      text_hash: createHash('sha256').update('A hobby: chess.').digest('hex')
    })
    expect(fillMemoryItemEmbeddingHashes(database)).toBe(0)
  })
})
