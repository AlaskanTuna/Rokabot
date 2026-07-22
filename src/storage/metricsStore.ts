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

export interface MemoryEventInput {
  kind: 'retrieval' | 'extraction' | 'claim_change' | 'context_build'
  guildId?: string
  channelId?: string
  subjectUserId?: string
  durationMs?: number
  nCandidates?: number
  nSelected?: number
  nChanged?: number
  tokensEst?: number
  op?: 'assert' | 'retract' | 'supersede' | 'none'
}

let responseEventStatement: Database.Statement | undefined
let extractionEventStatement: Database.Statement | undefined
let memoryEventStatement: Database.Statement | undefined

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

function getMemoryEventStatement(): Database.Statement {
  memoryEventStatement ??= getDb().prepare(
    `INSERT INTO memory_events (
      kind, guild_id, channel_id, subject_user_id, duration_ms, n_candidates, n_selected, n_changed,
      tokens_est, op, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  return memoryEventStatement
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

/** Record one memory pipeline event without allowing telemetry failures to affect the caller. */
export function recordMemoryEvent(row: MemoryEventInput): void {
  try {
    getMemoryEventStatement().run(
      row.kind,
      row.guildId,
      row.channelId,
      row.subjectUserId,
      row.durationMs,
      row.nCandidates,
      row.nSelected,
      row.nChanged,
      row.tokensEst,
      row.op,
      Date.now()
    )
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record memory metrics event')
  }
}

export function countMemoryEvents(kind?: MemoryEventInput['kind']): number {
  const row = kind
    ? getDb().prepare('SELECT COUNT(*) AS count FROM memory_events WHERE kind = ?').get(kind)
    : getDb().prepare('SELECT COUNT(*) AS count FROM memory_events').get()
  return (row as { count: number }).count
}

/** Delete metrics events older than the configured retention period. */
export function pruneOldMetrics(maxAgeDays: number): number {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    const db = getDb()
    const responseResult = db.prepare('DELETE FROM response_events WHERE created_at < ?').run(cutoff)
    const extractionResult = db.prepare('DELETE FROM extraction_events WHERE created_at < ?').run(cutoff)
    const memoryResult = db.prepare('DELETE FROM memory_events WHERE created_at < ?').run(cutoff)
    const pruned = responseResult.changes + extractionResult.changes + memoryResult.changes
    if (pruned > 0) {
      logger.info({ pruned, maxAgeDays }, 'Pruned old metrics events')
    }
    return pruned
  } catch (error) {
    logger.warn({ err: error }, 'Failed to prune metrics events')
    return 0
  }
}
