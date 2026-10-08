import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: { logging: { level: 'silent' }, memory: { extractionSampleDays: 14 } }
}))

import { closeDb, getDb } from '../database.js'
import { countExtractionSamples, pruneExtractionSamples, recordExtractionSample } from '../extractionSampleStore.js'

const DAY = 24 * 60 * 60 * 1000

const sample = (jobId: number) => ({
  jobId,
  guildId: 'guild-1',
  channelId: 'channel-1',
  outcome: 'below_threshold' as const,
  admissionProbability: 0.2,
  lines: ['[Alice]: hello']
})

beforeEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  vi.restoreAllMocks()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('extractionSampleStore', () => {
  it('keeps at most 200 samples, replacing the oldest', () => {
    for (let jobId = 1; jobId <= 201; jobId += 1) recordExtractionSample(sample(jobId))

    expect(countExtractionSamples()).toBe(200)
    expect(getDb().prepare('SELECT MIN(job_id) AS min FROM extraction_samples').get()).toEqual({ min: 2 })
  })

  it('deletes samples past their expiry', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)
    recordExtractionSample(sample(1))

    expect(pruneExtractionSamples(15 * DAY)).toBe(1)
    expect(countExtractionSamples()).toBe(0)
  })
})
