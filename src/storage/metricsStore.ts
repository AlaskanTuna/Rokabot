/**
 * Durable metrics events for future `/stats` queries: per-guild counts; latency percentiles via
 * ordered scans or NTILE over e2e_ms; outcome ratios grouped by outcome; and busiest channels
 * grouped by channel_id.
 */

import type Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

export interface ResponseMetrics {
  generateMs: number
  llmMs: number
  retryLatencyMs: number
  retries: number
  outcome: string
  kind: string
  tokensInEst: number
  tokensOutEst: number
}

export interface ResponseEventInput extends ResponseMetrics {
  guildId: string
  channelId: string
  userId: string
  trigger: 'mention' | 'reply' | 'name_keyword' | 'slash'
  tone: string
  e2eMs: number
}

export interface ExtractionEventInput {
  guildId: string
  channelId: string
  durationMs: number
  outcome: string
  factsExtracted: number
  factsSaved: number
}

let responseEventStatement: Database.Statement | undefined
let extractionEventStatement: Database.Statement | undefined

function getResponseEventStatement(): Database.Statement {
  responseEventStatement ??= getDb().prepare(
    `INSERT INTO response_events (
      guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
      retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  return responseEventStatement
}

function getExtractionEventStatement(): Database.Statement {
  extractionEventStatement ??= getDb().prepare(
    `INSERT INTO extraction_events (
      guild_id, channel_id, duration_ms, outcome, facts_extracted, facts_saved, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  return extractionEventStatement
}

/** Record one completed response without allowing telemetry failures to affect the response. */
export function recordResponseEvent(row: ResponseEventInput): void {
  try {
    getResponseEventStatement().run(
      row.guildId,
      row.channelId,
      row.userId,
      row.trigger,
      row.tone,
      row.outcome,
      row.kind,
      row.e2eMs,
      row.generateMs,
      row.llmMs,
      row.retryLatencyMs,
      row.retries,
      row.tokensInEst,
      row.tokensOutEst,
      Date.now()
    )
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record response metrics event')
  }
}

/** Record one completed memory extraction without allowing telemetry failures to affect extraction. */
export function recordExtractionEvent(row: ExtractionEventInput): void {
  try {
    getExtractionEventStatement().run(
      row.guildId,
      row.channelId,
      row.durationMs,
      row.outcome,
      row.factsExtracted,
      row.factsSaved,
      Date.now()
    )
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record extraction metrics event')
  }
}

/** Delete response and extraction events older than the configured retention period. */
export function pruneOldMetrics(maxAgeDays: number): number {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    const db = getDb()
    const responseResult = db.prepare('DELETE FROM response_events WHERE created_at < ?').run(cutoff)
    const extractionResult = db.prepare('DELETE FROM extraction_events WHERE created_at < ?').run(cutoff)
    const pruned = responseResult.changes + extractionResult.changes
    if (pruned > 0) {
      logger.info({ pruned, maxAgeDays }, 'Pruned old metrics events')
    }
    return pruned
  } catch (error) {
    logger.warn({ err: error }, 'Failed to prune metrics events')
    return 0
  }
}
