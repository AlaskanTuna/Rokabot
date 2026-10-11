import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { UNKNOWN_FINGERPRINT, ensureVectorProvenanceColumns } from '../vectorProvenance.js'

let db: Database.Database

afterEach(() => db.close())

function columns(): string[] {
  return (db.prepare("PRAGMA table_info('memory_episode')").all() as Array<{ name: string }>).map(({ name }) => name)
}

function provenance() {
  return db
    .prepare('SELECT id, embedding_model_id, embedding_dim, embedding_fingerprint FROM memory_episode ORDER BY id')
    .all()
}

describe('ensureVectorProvenanceColumns', () => {
  it('adds the provenance columns and marks vectors stored before them as unknown provenance', () => {
    db = new Database(':memory:')
    db.exec('CREATE TABLE memory_episode (id INTEGER PRIMARY KEY, summary TEXT NOT NULL, embedding BLOB)')
    db.prepare('INSERT INTO memory_episode (id, summary, embedding) VALUES (1, ?, ?), (2, ?, NULL)').run(
      'Picnic.',
      Buffer.alloc(3072),
      'No vector.'
    )

    ensureVectorProvenanceColumns(db, 'memory_episode')
    ensureVectorProvenanceColumns(db, 'memory_episode')

    expect(columns()).toEqual([
      'id',
      'summary',
      'embedding',
      'embedding_model_id',
      'embedding_dim',
      'embedding_fingerprint'
    ])
    expect(provenance()).toEqual([
      { id: 1, embedding_model_id: null, embedding_dim: 768, embedding_fingerprint: UNKNOWN_FINGERPRINT },
      { id: 2, embedding_model_id: null, embedding_dim: null, embedding_fingerprint: null }
    ])
  })

  it('keeps provenance that a write recorded', () => {
    db = new Database(':memory:')
    db.exec('CREATE TABLE memory_episode (id INTEGER PRIMARY KEY, summary TEXT NOT NULL, embedding BLOB)')
    ensureVectorProvenanceColumns(db, 'memory_episode')
    db.prepare('INSERT INTO memory_episode VALUES (1, ?, ?, ?, 384, ?)').run(
      'Picnic.',
      Buffer.alloc(1536),
      'm',
      'local:m:384:e5-prefix-mean-l2'
    )

    ensureVectorProvenanceColumns(db, 'memory_episode')

    expect(provenance()).toEqual([
      { id: 1, embedding_model_id: 'm', embedding_dim: 384, embedding_fingerprint: 'local:m:384:e5-prefix-mean-l2' }
    ])
  })

  it('skips a table that does not exist yet', () => {
    db = new Database(':memory:')

    expect(() => ensureVectorProvenanceColumns(db, 'media_digest')).not.toThrow()
  })
})
