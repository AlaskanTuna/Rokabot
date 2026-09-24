import { config } from '../../config.js'
import type { EpisodeCursor, EpisodeLine } from '../../storage/extractionQueue.js'
import {
  enqueueEpisodeAndAdvanceCursor,
  getEpisodeCursor,
  recordOpenEpisodeMessage
} from '../../storage/memoryEpisodeStore.js'
import { type BufferedMessage, addMessage, getMessages } from '../passiveBuffer.js'
import { startExtractionScheduler } from './scheduler.js'

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function asEpisodeLine(message: BufferedMessage): EpisodeLine {
  return {
    messageId: message.messageId,
    userId: message.userId,
    displayName: message.displayName,
    content: message.content,
    timestamp: message.timestamp,
    isBot: message.isBot
  }
}

function deltaStart(buffered: readonly BufferedMessage[], cursor: EpisodeCursor | undefined): number {
  if (!cursor) return 0
  if (cursor.lastMessageId) {
    const checkpoint = buffered.findIndex((message) => message.messageId === cursor.lastMessageId)
    if (checkpoint >= 0) return checkpoint + 1
  }
  if (cursor.messageCount > 0) return Math.max(0, buffered.length - cursor.messageCount)
  return buffered.length
}

function clearTimer(channelId: string): void {
  const timer = timers.get(channelId)
  if (timer) clearTimeout(timer)
  timers.delete(channelId)
}

function scheduleLull(channelId: string): void {
  clearTimer(channelId)
  const timer = setTimeout(() => flushEpisode(channelId), config.memory.episodeLullMs)
  timer.unref?.()
  timers.set(channelId, timer)
}

export function recordEpisodeMessage(input: { guildId: string; channelId: string; message: EpisodeLine }): void {
  const { guildId, channelId, message } = input
  const buffered = getMessages(channelId)
  const cursor = getEpisodeCursor(channelId)
  if (buffered.some((line) => line.messageId === message.messageId) || cursor?.lastMessageId === message.messageId)
    return

  const start = deltaStart(buffered, cursor)
  const openMessages = buffered.slice(start)
  const lastOpenMessage = openMessages.at(-1)
  if (
    lastOpenMessage &&
    (Date.now() - lastOpenMessage.timestamp >= config.memory.episodeLullMs ||
      message.timestamp - lastOpenMessage.timestamp >= config.memory.episodeLullMs)
  ) {
    flushEpisode(channelId)
  }

  addMessage(channelId, message.userId, message.displayName, message.displayName, message.content, {
    messageId: message.messageId,
    timestamp: message.timestamp,
    isBot: message.isBot
  })
  const nextCursor = recordOpenEpisodeMessage({ guildId, channelId, openedAt: message.timestamp })
  scheduleLull(channelId)
  if (nextCursor.messageCount >= config.memory.episodeMaxMessages) flushEpisode(channelId)
}

export function flushEpisode(channelId: string): void {
  const cursor = getEpisodeCursor(channelId)
  if (!cursor || cursor.messageCount === 0) {
    clearTimer(channelId)
    return
  }

  const buffered = getMessages(channelId)
  const start = deltaStart(buffered, cursor)
  const messages = buffered.slice(start).map(asEpisodeLine)
  if (messages.length === 0) {
    clearTimer(channelId)
    return
  }

  enqueueEpisodeAndAdvanceCursor({
    guildId: cursor.guildId,
    channelId,
    episode: {
      messages,
      context: buffered.slice(Math.max(0, start - 3), start).map(asEpisodeLine),
      startedAt: cursor.openedAt ?? messages[0].timestamp,
      endedAt: messages.at(-1)!.timestamp
    },
    lastMessageId: messages.at(-1)!.messageId
  })
  startExtractionScheduler()
  clearTimer(channelId)
}

export function flushOpenEpisodes(): void {
  for (const channelId of [...timers.keys()]) flushEpisode(channelId)
}

export function resetEpisodeTrackerForTest(): void {
  for (const channelId of timers.keys()) clearTimer(channelId)
}
