import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

const MAX_SAMPLES = 200
const DAY_MS = 24 * 60 * 60 * 1000

export type ExtractionSampleInput = Readonly<{
  jobId: number
  guildId: string
  channelId: string
  outcome: 'trivial' | 'below_threshold'
  admissionProbability: number | null
  lines: readonly string[]
}>

/** Private evaluation data: never read by memory, recall, Jev or any prompt. */
export function recordExtractionSample(input: ExtractionSampleInput): void {
  try {
    const now = Date.now()
    const db = getDb()
    db.transaction(() => {
      db.prepare(
        `INSERT INTO extraction_samples
           (job_id, guild_id, channel_id, outcome, admission_probability, lines, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.jobId,
        input.guildId,
        input.channelId,
        input.outcome,
        input.admissionProbability,
        JSON.stringify(input.lines),
        now,
        now + config.memory.extractionSampleDays * DAY_MS
      )
      db.prepare(
        `DELETE FROM extraction_samples WHERE id NOT IN
           (SELECT id FROM extraction_samples ORDER BY id DESC LIMIT ?)`
      ).run(MAX_SAMPLES)
    })()
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record extraction sample')
  }
}

// Expiry is fixed at insert, so the age check is what makes a lowered extractionSampleDays apply to stored rows.
export function pruneExtractionSamples(now = Date.now()): number {
  return getDb()
    .prepare('DELETE FROM extraction_samples WHERE expires_at <= ? OR created_at <= ?')
    .run(now, now - config.memory.extractionSampleDays * DAY_MS).changes
}

export function countExtractionSamples(): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM extraction_samples').get() as { count: number }).count
}
