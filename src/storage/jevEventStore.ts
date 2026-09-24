import type Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

export type JevEventKind = 'turn' | 'admission' | 'verification'

export interface JevEventInput {
  kind: JevEventKind
  guildId: string
  channelId: string
  question: string
  answer: string
  probability: number | null
  confidence: number | null
  applied: boolean
  latencyMs: number
  inputTokens: number
  baseline?: string | null
}

let jevEventStatement: Database.Statement | undefined

function getJevEventStatement(): Database.Statement {
  jevEventStatement ??= getDb().prepare(
    'INSERT INTO jev_events (kind, guild_id, channel_id, question, answer, probability, confidence, applied, ' +
      'latency_ms, input_tokens, baseline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  return jevEventStatement
}

export function recordJevEvent(row: JevEventInput): void {
  try {
    getJevEventStatement().run(
      row.kind,
      row.guildId,
      row.channelId,
      row.question,
      row.answer,
      row.probability,
      row.confidence,
      row.applied ? 1 : 0,
      row.latencyMs,
      row.inputTokens,
      row.baseline ?? null,
      Date.now()
    )
  } catch (error) {
    logger.warn({ err: error }, 'Failed to record Jev event')
  }
}
