import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configMock = vi.hoisted(() => ({
  embeddings: { provider: 'gemini', dim: 768, fingerprint: 'gemini:gemini-embedding-2:768:gemini-task-prefix' }
}))
let testDb: Database.Database

vi.mock('../../config.js', () => ({ config: configMock }))
vi.mock('../database.js', () => ({ getDb: () => testDb }))

import {
  GEMINI_FINGERPRINT,
  LOCAL_FINGERPRINT,
  geminiVector,
  localVector
} from '../../agent/memory/embeddings/__tests__/vectors.js'
import type { EmbeddingResult } from '../../agent/memory/embeddings/client.js'
import { listEpisodesForGuild, saveMemoryEpisode } from '../memoryEpisodeStore.js'
import { ensureVectorProvenanceColumns } from '../vectorProvenance.js'

const GEMINI_001_FINGERPRINT = 'gemini:gemini-embedding-001:768:gemini-task-prefix'
const OPENAI_768_FINGERPRINT = 'openai:some-768-model:768:raw'

function gemini001Vector(): EmbeddingResult {
  return {
    ...geminiVector(Array(768).fill(0.25)),
    modelId: 'gemini-embedding-001',
    fingerprint: GEMINI_001_FINGERPRINT
  }
}

function seed(id: number, embedding: EmbeddingResult | null): void {
  saveMemoryEpisode({
    id,
    guildId: 'guild-a',
    channelId: 'channel-a',
    startedAt: 1,
    endedAt: 100 - id,
    summary: `Episode ${id}.`,
    embedding
  })
}

// A vector stored before provenance existed; the migration marks it unknown.
function seedUnknown(id: number): void {
  seed(id, null)
  testDb
    .prepare('UPDATE memory_episode SET embedding = ? WHERE id = ?')
    .run(Buffer.from(new Float32Array(768).fill(0.25).buffer), id)
  ensureVectorProvenanceColumns(testDb, 'memory_episode')
}

function readable(): Array<[number, number | null]> {
  return listEpisodesForGuild('guild-a').map(({ id, embedding }) => [id, embedding?.length ?? null])
}

describe('active embedding space', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE memory_episode (
        id INTEGER PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        summary TEXT NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL
      );
    `)
    ensureVectorProvenanceColumns(testDb, 'memory_episode')
    configMock.embeddings = { provider: 'gemini', dim: 768, fingerprint: GEMINI_FINGERPRINT }
  })

  afterEach(() => testDb.close())

  it('reads Gemini and unknown-provenance vectors in the Gemini space, never local ones', () => {
    seed(1, geminiVector(Array(768).fill(0.25)))
    seedUnknown(2)
    seed(3, localVector(Array(384).fill(0.25)))

    expect(readable()).toEqual([
      [1, 768],
      [2, 768],
      [3, null]
    ])
  })

  it('does not read unknown-provenance vectors in a Gemini space on another model', () => {
    configMock.embeddings = { provider: 'gemini', dim: 768, fingerprint: GEMINI_001_FINGERPRINT }
    seed(1, gemini001Vector())
    seedUnknown(2)

    expect(readable()).toEqual([
      [1, 768],
      [2, null]
    ])
  })

  it('does not read vectors from another Gemini model in the gemini-embedding-2 space', () => {
    seed(1, geminiVector(Array(768).fill(0.25)))
    seed(2, gemini001Vector())

    expect(readable()).toEqual([
      [1, 768],
      [2, null]
    ])
  })

  it('does not read unknown-provenance vectors in a non-Gemini space of the same dimension', () => {
    configMock.embeddings = { provider: 'openai', dim: 768, fingerprint: OPENAI_768_FINGERPRINT }
    seed(1, {
      values: Array(768).fill(0.25),
      modelId: 'some-768-model',
      dim: 768,
      fingerprint: OPENAI_768_FINGERPRINT
    })
    seedUnknown(2)

    expect(readable()).toEqual([
      [1, 768],
      [2, null]
    ])
  })

  it('reads only local vectors in the local space', () => {
    configMock.embeddings = { provider: 'local', dim: 384, fingerprint: LOCAL_FINGERPRINT }
    seed(1, geminiVector(Array(768).fill(0.25)))
    seedUnknown(2)
    seed(3, localVector(Array(384).fill(0.25)))

    expect(readable()).toEqual([
      [1, null],
      [2, null],
      [3, 384]
    ])
  })

  it('treats a vector whose bytes do not match its recorded dimension as missing', () => {
    seed(1, geminiVector(Array(768).fill(0.25)))
    testDb.prepare('UPDATE memory_episode SET embedding_dim = 767 WHERE id = 1').run()

    expect(readable()).toEqual([[1, null]])
  })

  it('records the model, dimension and fingerprint beside the vector', () => {
    seed(1, localVector(Array(384).fill(0.25)))

    expect(
      testDb.prepare('SELECT embedding_model_id, embedding_dim, embedding_fingerprint FROM memory_episode').get()
    ).toEqual({
      embedding_model_id: 'Xenova/multilingual-e5-small@761b726d-q8',
      embedding_dim: 384,
      embedding_fingerprint: LOCAL_FINGERPRINT
    })
  })
})
