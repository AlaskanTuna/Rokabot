import { getDb } from './database.js'
import { enqueueEpisode } from './extractionQueue.js'
import type { EpisodeCursor, ExtractionEpisode, ExtractionQueueJob } from './extractionQueue.js'

type EpisodeCursorRow = {
  guild_id: string
  channel_id: string
  last_message_id: string | null
  opened_at: number | null
  message_count: number
}

function mapCursor(row: EpisodeCursorRow): EpisodeCursor {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    lastMessageId: row.last_message_id,
    openedAt: row.opened_at,
    messageCount: row.message_count
  }
}

export function getEpisodeCursor(channelId: string): EpisodeCursor | undefined {
  const row = getDb()
    .prepare(
      'SELECT guild_id, channel_id, last_message_id, opened_at, message_count FROM memory_episode_cursor WHERE channel_id = ?'
    )
    .get(channelId) as EpisodeCursorRow | undefined
  return row ? mapCursor(row) : undefined
}

export function recordOpenEpisodeMessage(input: {
  guildId: string
  channelId: string
  openedAt: number
}): EpisodeCursor {
  const db = getDb()
  db.prepare(
    `INSERT INTO memory_episode_cursor (channel_id, guild_id, last_message_id, opened_at, message_count)
     VALUES (?, ?, NULL, ?, 1)
     ON CONFLICT(channel_id) DO UPDATE SET
       guild_id = excluded.guild_id,
       opened_at = COALESCE(memory_episode_cursor.opened_at, excluded.opened_at),
       message_count = memory_episode_cursor.message_count + 1`
  ).run(input.channelId, input.guildId, input.openedAt)
  return getEpisodeCursor(input.channelId) as EpisodeCursor
}

export function enqueueEpisodeAndAdvanceCursor(input: {
  guildId: string
  channelId: string
  episode: ExtractionEpisode
  lastMessageId: string
}): ExtractionQueueJob {
  const db = getDb()
  return db.transaction(() => {
    const job = enqueueEpisode(input, { transaction: true })
    const cursor = db
      .prepare(
        `UPDATE memory_episode_cursor
         SET last_message_id = ?, opened_at = NULL, message_count = 0
         WHERE channel_id = ? AND guild_id = ?`
      )
      .run(input.lastMessageId, input.channelId, input.guildId)
    if (cursor.changes !== 1) throw new Error('Episode cursor not found')
    return job
  })()
}
