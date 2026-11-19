import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDb, getDb } from '../database.js'
import { type JevEventInput, recordJevEvent } from '../jevEventStore.js'

const base: JevEventInput = {
  kind: 'turn',
  guildId: 'guild-1',
  channelId: 'channel-1',
  question: 'features',
  answer: 'decision',
  probability: null,
  confidence: null,
  applied: false,
  latencyMs: 5,
  inputTokens: 3
}

beforeEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('jevEventStore', () => {
  it('records the job ID for extraction judgments and NULL for turn judgments', () => {
    recordJevEvent({ ...base, kind: 'admission', jobId: 42 })
    recordJevEvent({ ...base, kind: 'turn' })

    expect(getDb().prepare('SELECT kind, job_id FROM jev_events ORDER BY rowid').all()).toEqual([
      { kind: 'admission', job_id: 42 },
      { kind: 'turn', job_id: null }
    ])
  })

  it('records who judged a main-model judgment and NULL for Jev', () => {
    recordJevEvent({ ...base, kind: 'admission', judge: 'anthropic:claude-haiku-5-5' })
    recordJevEvent({ ...base, kind: 'verification' })

    expect(getDb().prepare('SELECT kind, judge FROM jev_events ORDER BY rowid').all()).toEqual([
      { kind: 'admission', judge: 'anthropic:claude-haiku-5-5' },
      { kind: 'verification', judge: null }
    ])
  })
})

describe('jev_events recall kind', () => {
  it('stores a recall row', () => {
    recordJevEvent({
      kind: 'recall',
      guildId: 'g',
      channelId: 'c',
      question: 'recall:r1:abcd1234',
      answer: '{"status":"ok"}',
      probability: null,
      confidence: null,
      applied: false,
      latencyMs: 412,
      inputTokens: 5120
    })

    expect(getDb().prepare("SELECT count(*) AS n FROM jev_events WHERE kind = 'recall'").get()).toEqual({ n: 1 })
  })

  it('migrates an old table whose CHECK rejects recall, keeping its rows', () => {
    const previousPath = process.env.ROKABOT_DB_PATH
    const path = join(tmpdir(), `jev-migrate-${process.pid}.db`)
    rmSync(path, { force: true })
    try {
      const old = new Database(path)
      try {
        old.exec(`CREATE TABLE jev_events (
          kind TEXT NOT NULL CHECK (kind IN ('turn', 'admission', 'verification')),
          guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL,
          probability REAL, confidence REAL, applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
          latency_ms INTEGER NOT NULL, input_tokens INTEGER NOT NULL, baseline TEXT, created_at INTEGER NOT NULL,
          job_id INTEGER DEFAULT NULL, judge TEXT DEFAULT NULL)`)
        old.exec('CREATE INDEX idx_jev_events_created_at ON jev_events (created_at)')
        old.prepare(`INSERT INTO jev_events VALUES ('turn','g','c','q','a',0.5,0.9,1,300,900,NULL,1,7,'judge-x')`).run()
      } finally {
        old.close()
      }

      closeDb()
      process.env.ROKABOT_DB_PATH = path
      const database = getDb()
      database
        .prepare(
          `INSERT INTO jev_events (kind, guild_id, channel_id, question, answer, applied, latency_ms,
          input_tokens, created_at) VALUES ('recall','g','c','q','a',0,1,1,2)`
        )
        .run()

      expect(database.prepare('SELECT kind, job_id, judge FROM jev_events ORDER BY created_at').all()).toEqual([
        { kind: 'turn', job_id: 7, judge: 'judge-x' },
        { kind: 'recall', job_id: null, judge: null }
      ])
      expect(
        database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jev_events'").all()
      ).toEqual([{ name: 'idx_jev_events_created_at' }])
    } finally {
      closeDb()
      process.env.ROKABOT_DB_PATH = previousPath
      for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true })
    }
  })
})
