/** Passive message ring buffer for monitored channels */

import { config } from '../config.js'
import type { EpisodeLine } from '../storage/extractionQueue.js'

export interface BufferedMessage extends EpisodeLine {
  username: string
}

export type BufferedMessageOptions = Readonly<{
  messageId?: string
  timestamp?: number
  isBot?: boolean
}>

interface ChannelBuffer {
  messages: BufferedMessage[]
  userMap: Map<string, string> // displayName → userId
  usernameMap: Map<string, string> // userId → username
  nextLocalMessageId: number
}

const BUFFER_SIZE = config.memory.bufferSize
const buffers = new Map<string, ChannelBuffer>()

export function addMessage(
  channelId: string,
  userId: string,
  displayName: string,
  username: string,
  content: string,
  options: BufferedMessageOptions = {}
): number {
  if (!buffers.has(channelId)) {
    buffers.set(channelId, { messages: [], userMap: new Map(), usernameMap: new Map(), nextLocalMessageId: 0 })
  }
  const buf = buffers.get(channelId)!
  const isBot = options.isBot ?? false
  if (!isBot) {
    buf.userMap.set(displayName, userId)
    buf.usernameMap.set(userId, username)
  }
  const messageId = options.messageId ?? `${channelId}-local-${++buf.nextLocalMessageId}`
  buf.messages.push({
    messageId,
    displayName,
    username,
    userId,
    content,
    timestamp: options.timestamp ?? Date.now(),
    isBot
  })
  if (buf.messages.length > BUFFER_SIZE) {
    const removed = buf.messages.shift()
    if (removed && !removed.isBot && !buf.messages.some((m) => !m.isBot && m.displayName === removed.displayName)) {
      buf.userMap.delete(removed.displayName)
    }
    if (removed && !removed.isBot && !buf.messages.some((m) => !m.isBot && m.userId === removed.userId)) {
      buf.usernameMap.delete(removed.userId)
    }
  }
  return buf.messages.length
}

export function getMessages(channelId: string): BufferedMessage[] {
  return buffers.get(channelId)?.messages ?? []
}

export function getUserMap(channelId: string): Map<string, string> {
  return buffers.get(channelId)?.userMap ?? new Map()
}

export function getUsernameMap(channelId: string): Map<string, string> {
  return buffers.get(channelId)?.usernameMap ?? new Map()
}

export function clearBuffer(channelId: string): void {
  const buf = buffers.get(channelId)
  if (buf) {
    buf.messages = []
  }
}

export function getMessageCount(channelId: string): number {
  return buffers.get(channelId)?.messages.length ?? 0
}

/** Reset all buffers for testing */
export function resetAllBuffers(): void {
  buffers.clear()
}
