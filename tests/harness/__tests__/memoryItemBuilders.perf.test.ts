import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildEpisodeRecallBlock } from '../../../src/agent/memory/episodeRetriever.js'
import { buildMediaRecallBlock } from '../../../src/agent/memory/mediaRecall.js'
import { retrieveForTurn, retrieveGuildFacts } from '../../../src/agent/memory/retriever.js'
import { config } from '../../../src/config.js'
import { closeDb, getDb } from '../../../src/storage/database.js'
import { type StoredVector, decodeFloat32Embedding } from '../../../src/storage/memoryEpisodeStore.js'
import { fillMemoryItemEmbeddingHashes } from '../../../src/storage/memoryItemIntegrity.js'
import { configureMemoryItemProjectionTriggers } from '../../../src/storage/memoryItemProjection.js'
import { type MemoryItemEmbeddingRow, decodeMemoryItemEmbedding } from '../../../src/storage/memoryItemStore.js'

const GUILD_ID = 'item-perf-guild'
const HERE = 'item-perf-here'
const OTHER = 'item-perf-other'
const USERS = ['perf-user-0', 'perf-user-1', 'perf-user-2', 'perf-user-3']
const QUERY_VECTOR = Array.from({ length: config.embeddings.dim }, () => 0.25)
const MEMORY = config.memory as { store: string; privacy: string }
const previousStore = MEMORY.store
const previousPrivacy = MEMORY.privacy
// Timing noise on a shared runner: the item store may not be slower than legacy beyond this.
const SLOWDOWN_FACTOR = 1.25
const SLOWDOWN_MS = 2

function vector(index: number): Buffer {
  const bytes = Buffer.alloc(config.embeddings.dim * 4)
  for (let position = 0; position < config.embeddings.dim; position += 1) bytes.writeFloatLE(0.25, position * 4)
  bytes.writeFloatLE(0.01 + (index % 100) / 100, 0)
  return bytes
}

/** Seeds the legacy tables with the dual triggers on, so both stores hold the same rows. */
function seed(from: number, to: number): void {
  const db = getDb()
  const claim = db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status, confidence,
      salience, pinned, needs_review, first_seen_at, last_seen_at, period
    ) VALUES (?, ?, ?, ?, ?, ?, 'explicit', 'active', 0.9, ?, 0, 0, ?, ?, 'current')
  `)
  const evidence = db.prepare(`
    INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (?, ?, 'explicit', ?)
  `)
  const episode = db.prepare(`
    INSERT INTO memory_episode (
      id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const digest = db.prepare(`
    INSERT INTO media_digest (
      id, guild_id, content_key, kind, label, summary, digest_json, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, ?, ?, 'video', ?, ?, '{}', ?, ?, ?, ?, ?)
  `)
  const occurrence = db.prepare(`
    INSERT INTO media_occurrence (digest_id, guild_id, channel_id, message_id, shared_by_user_id, origin, observed_at)
    VALUES (?, ?, ?, ?, ?, 'link', ?)
  `)
  const { model, dim, fingerprint } = config.embeddings
  db.transaction(() => {
    for (let index = from; index < to; index += 1) {
      const channel = index % 2 === 0 ? HERE : OTHER
      const seen = 1_000 + index
      const salience = (index % 97) / 100
      const userId = USERS[index % USERS.length]
      claim.run(
        index * 2 + 1,
        GUILD_ID,
        'user',
        userId,
        `hobby_${index % 40}`,
        `perf keyword ${index}`,
        salience,
        seen,
        seen
      )
      evidence.run(index * 2 + 1, channel, seen)
      claim.run(
        index * 2 + 2,
        GUILD_ID,
        'guild',
        null,
        `place_${index % 40}`,
        `perf place ${index}`,
        salience,
        seen,
        seen
      )
      evidence.run(index * 2 + 2, channel, seen)
      episode.run(
        index + 1,
        GUILD_ID,
        channel,
        seen,
        seen + 1,
        `Perf episode ${index}.`,
        vector(index),
        seen,
        model,
        dim,
        fingerprint
      )
      digest.run(
        index + 1,
        GUILD_ID,
        `perf-key-${index}`,
        `Perf clip ${index}`,
        `Perf media ${index}.`,
        vector(index),
        seen,
        model,
        dim,
        fingerprint
      )
      occurrence.run(index + 1, GUILD_ID, channel, `perf-message-${index}`, userId, seen)
    }
  })()
  fillMemoryItemEmbeddingHashes(db)
}

function averageMs(run: () => unknown): number {
  run()
  const started = performance.now()
  for (let iteration = 0; iteration < 3; iteration += 1) run()
  return (performance.now() - started) / 3
}

function decodeTimes(): { legacy: number; item: number } {
  const db = getDb()
  const legacyRows = db
    .prepare('SELECT embedding, embedding_dim, embedding_fingerprint FROM memory_episode WHERE guild_id = ?')
    .all(GUILD_ID) as StoredVector[]
  const itemRows = db
    .prepare(`
      SELECT item.content, vector.fingerprint, vector.model_id, vector.dim, vector.renderer,
             vector.renderer_version, vector.text_hash, vector.vector
      FROM memory_item item JOIN memory_item_embedding vector ON vector.item_id = item.id
      WHERE item.guild_id = ? AND item.kind = 'episode'
    `)
    .all(GUILD_ID) as Array<MemoryItemEmbeddingRow & { content: string }>
  return {
    legacy: averageMs(() => legacyRows.map((row) => decodeFloat32Embedding(row))),
    item: averageMs(() => itemRows.map((row) => decodeMemoryItemEmbedding(row, row.content, 'summary')))
  }
}

describe('memory item builders performance', () => {
  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
  })

  afterEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
    Object.assign(MEMORY, { store: previousStore, privacy: previousPrivacy })
  })

  it('is not slower on the item store at 1,000 and 10,000 items per kind', () => {
    const scope = { guildId: GUILD_ID, channelId: HERE }
    const turn = {
      guildId: GUILD_ID,
      speakerId: USERS[0],
      participantIds: USERS.slice(1),
      message: 'perf keyword',
      scope
    }
    const builders = {
      people: () => retrieveForTurn(turn),
      guild: () => retrieveGuildFacts(GUILD_ID, Date.now(), scope),
      episodes: () => buildEpisodeRecallBlock({ guildId: GUILD_ID, queryEmbedding: QUERY_VECTOR, scope }),
      media: () => buildMediaRecallBlock({ guildId: GUILD_ID, queryEmbedding: QUERY_VECTOR, scope })
    }
    const observations: string[] = []
    let seeded = 0

    for (const size of [1_000, 10_000]) {
      seed(seeded, size)
      seeded = size
      expect(getDb().prepare('SELECT COUNT(*) AS count FROM memory_item').get()).toEqual({ count: size * 4 })

      const decode = decodeTimes()
      observations.push(`${size}/decode legacy=${decode.legacy.toFixed(2)}ms item=${decode.item.toFixed(2)}ms`)
      expect(decode.item).toBeLessThanOrEqual(decode.legacy * SLOWDOWN_FACTOR + SLOWDOWN_MS)

      for (const privacy of ['relaxed', 'strict'] as const) {
        MEMORY.privacy = privacy
        for (const [name, build] of Object.entries(builders)) {
          MEMORY.store = 'legacy'
          const legacy = averageMs(build)
          MEMORY.store = 'item'
          const item = averageMs(build)
          observations.push(`${size}/${privacy}/${name} legacy=${legacy.toFixed(2)}ms item=${item.toFixed(2)}ms`)
          expect(item).toBeLessThanOrEqual(legacy * SLOWDOWN_FACTOR + SLOWDOWN_MS)
        }
      }
    }

    console.info(`Memory item builders: ${observations.join(', ')}`)
    // Seeding 40,000 rows takes about 35 s on a CI runner, beyond the perf suite's 30 s default.
  }, 180_000)
})
