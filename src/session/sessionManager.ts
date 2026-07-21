/**
 * In-memory session manager — maps channel IDs to conversation state.
 * Sessions are ephemeral: a bot restart clears all history.
 */

import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { pushMessage } from './messageWindow.js'
import type { ChannelSession, WindowMessage } from './types.js'

const sessions = new Map<string, ChannelSession>()

/** Retrieve an existing session or create a fresh one, resetting the idle timer either way. */
export function getOrCreateSession(channelId: string): ChannelSession {
  let session = sessions.get(channelId)

  if (!session) {
    session = {
      channelId,
      messages: [],
      idleTimer: null,
      lastActivity: Date.now()
    }
    sessions.set(channelId, session)
    logger.info({ channelId }, 'Session created')
  }

  resetIdleTimer(session)
  return session
}

export function addMessage(channelId: string, message: WindowMessage): void {
  const session = getOrCreateSession(channelId)
  pushMessage(session.messages, message)
  session.lastActivity = Date.now()
}

export function getHistory(channelId: string): WindowMessage[] {
  const session = sessions.get(channelId)
  return session ? [...session.messages] : []
}

export function destroySession(channelId: string): void {
  const session = sessions.get(channelId)
  if (session) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
    }
    sessions.delete(channelId)
    logger.info({ channelId }, 'Session destroyed')
  }
}

export function destroyAllSessions(): void {
  for (const [channelId] of sessions) {
    destroySession(channelId)
  }
  logger.info('All sessions destroyed')
}

export function getSessionCount(): number {
  return sessions.size
}

/** Restart the idle timeout — destroys the session after TTL inactivity. */
function resetIdleTimer(session: ChannelSession): void {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer)
  }

  session.idleTimer = setTimeout(() => {
    logger.info({ channelId: session.channelId }, 'Session idle timeout')
    destroySession(session.channelId)
  }, config.session.ttlMs)
}
