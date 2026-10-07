import type Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

export type BugReportType = 'bug' | 'wrong_answer' | 'unsafe' | 'other'
export type BugReportContext = 'guild' | 'bot_dm' | 'private_channel'

export interface ReportAttachmentMetadata {
  name: string
  contentType: string | null
  size: number
}

export interface BugReportInput {
  type: BugReportType
  message: string
  userId: string
  username: string | null
  displayName: string | null
  context: BugReportContext
  guildId: string | null
  channelId: string | null
  interactionId: string
  locale: string | null
  attachment: ReportAttachmentMetadata | null
  botVersion: string
  gitCommit: string | null
  geminiModel: string
  fallbackModel: string
  uptimeS: number
}

export interface ReportStoreOptions {
  maxPerUserPerHour: number
  historyMessages: number
  historyMaxAgeMs: number
}

export const MAX_CONTEXT_JSON_BYTES = 64 * 1024

const HOUR_MS = 60 * 60 * 1000

type SnapshotEntry = Record<string, unknown>
type ReportSnapshot = {
  recentMessages: SnapshotEntry[]
  recentResponses: SnapshotEntry[]
  recentFailures: SnapshotEntry[]
  recentJev: SnapshotEntry[]
}

function queryRecentRows(
  database: Database.Database,
  channelId: string,
  cutoff: number,
  limit: number,
  section: keyof ReportSnapshot,
  sql: string
): SnapshotEntry[] {
  try {
    const rows = database.prepare(sql).all(channelId, cutoff, limit) as SnapshotEntry[]
    return rows.reverse()
  } catch (err) {
    logger.warn({ channelId, section, err }, 'Failed to capture bug report context snapshot')
    return []
  }
}

function captureSnapshot(
  database: Database.Database,
  channelId: string | null,
  createdAt: number,
  options: Pick<ReportStoreOptions, 'historyMessages' | 'historyMaxAgeMs'>
): ReportSnapshot {
  const snapshot: ReportSnapshot = {
    recentMessages: [],
    recentResponses: [],
    recentFailures: [],
    recentJev: []
  }
  if (!channelId) return snapshot

  const cutoff = createdAt - options.historyMaxAgeMs
  try {
    const rows = database
      .prepare(
        `SELECT role, display_name, content, timestamp, user_id
         FROM session_history
         WHERE channel_id = ? AND timestamp >= ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(channelId, cutoff, options.historyMessages) as Array<
      SnapshotEntry & { role: string; user_id?: string | null }
    >
    snapshot.recentMessages = rows
      .reverse()
      .map(({ role, user_id, ...row }) => (role === 'user' ? { role, ...row, user_id } : { role, ...row }))
  } catch (err) {
    logger.warn({ channelId, section: 'recentMessages', err }, 'Failed to capture bug report context snapshot')
  }

  snapshot.recentResponses = queryRecentRows(
    database,
    channelId,
    cutoff,
    10,
    'recentResponses',
    'SELECT * FROM response_events WHERE channel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?'
  )
  snapshot.recentFailures = queryRecentRows(
    database,
    channelId,
    cutoff,
    5,
    'recentFailures',
    'SELECT * FROM failure_diagnostics WHERE channel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?'
  )
  snapshot.recentJev = queryRecentRows(
    database,
    channelId,
    cutoff,
    5,
    'recentJev',
    'SELECT * FROM jev_events WHERE channel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?'
  )

  trimSnapshot(snapshot)
  return snapshot
}

function trimSnapshot(snapshot: ReportSnapshot): void {
  const timestampFields = {
    recentMessages: 'timestamp',
    recentResponses: 'created_at',
    recentFailures: 'created_at',
    recentJev: 'created_at'
  } as const
  let json = JSON.stringify(snapshot)
  while (Buffer.byteLength(json) > MAX_CONTEXT_JSON_BYTES) {
    let oldestSection: keyof ReportSnapshot | undefined
    let oldestTimestamp = Number.POSITIVE_INFINITY
    for (const section of Object.keys(timestampFields) as Array<keyof ReportSnapshot>) {
      const entry = snapshot[section][0]
      if (!entry) continue
      const timestamp = Number(entry[timestampFields[section]])
      if (timestamp < oldestTimestamp) {
        oldestSection = section
        oldestTimestamp = timestamp
      }
    }
    if (!oldestSection) break
    snapshot[oldestSection].shift()
    json = JSON.stringify(snapshot)
  }
}

export function countReportsSince(userId: string, since: number): number {
  const result = getDb()
    .prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE user_id = ? AND created_at >= ?')
    .get(userId, since) as { count: number }
  return result.count
}

export function createReportIfAllowed(input: BugReportInput, options: ReportStoreOptions): number | null {
  const database = getDb()
  const createdAt = Date.now()
  return database.transaction(() => {
    const count = database
      .prepare('SELECT COUNT(*) AS count FROM bug_reports WHERE user_id = ? AND created_at >= ?')
      .get(input.userId, createdAt - HOUR_MS) as { count: number }
    if (count.count >= options.maxPerUserPerHour) return null

    const contextJson = JSON.stringify(captureSnapshot(database, input.channelId, createdAt, options))
    const result = database
      .prepare(
        `INSERT INTO bug_reports (
          created_at, type, message, user_id, username, display_name, context, guild_id, channel_id,
          interaction_id, locale, attachment_name, attachment_content_type, attachment_size,
          bot_version, git_commit, gemini_model, fallback_model, uptime_s, context_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createdAt,
        input.type,
        input.message,
        input.userId,
        input.username,
        input.displayName,
        input.context,
        input.guildId,
        input.channelId,
        input.interactionId,
        input.locale,
        input.attachment?.name ?? null,
        input.attachment?.contentType ?? null,
        input.attachment?.size ?? null,
        input.botVersion,
        input.gitCommit,
        input.geminiModel,
        input.fallbackModel,
        input.uptimeS,
        contextJson
      )
    return Number(result.lastInsertRowid)
  })()
}

export function updateReportAttachment(
  reportId: number,
  attachmentPath: string | null,
  attachmentError: string | null
) {
  getDb()
    .prepare('UPDATE bug_reports SET attachment_path = ?, attachment_error = ? WHERE id = ?')
    .run(attachmentPath, attachmentError, reportId)
}
