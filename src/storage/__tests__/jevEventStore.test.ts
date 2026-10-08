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
})
