import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 5000, windowSize: 10 }
  }
}))

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import {
  addMessage,
  destroyAllSessions,
  destroySession,
  getHistory,
  getOrCreateSession,
  getSessionCount
} from '../sessionManager.js'
import type { WindowMessage } from '../types.js'

function makeMessage(content: string): WindowMessage {
  return {
    role: 'user',
    displayName: 'TestUser',
    content,
    timestamp: Date.now()
  }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    destroyAllSessions()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getOrCreateSession', () => {
    it('creates a new session for unknown channel', () => {
      const session = getOrCreateSession('ch-1')

      expect(session.channelId).toBe('ch-1')
      expect(session.messages).toHaveLength(0)
      expect(getSessionCount()).toBe(1)
    })

    it('returns existing session for known channel', () => {
      const first = getOrCreateSession('ch-1')
      first.messages.push(makeMessage('hello'))

      const second = getOrCreateSession('ch-1')

      expect(second).toBe(first)
      expect(second.messages).toHaveLength(1)
      expect(getSessionCount()).toBe(1)
    })

    it('creates separate sessions for different channels', () => {
      getOrCreateSession('ch-1')
      getOrCreateSession('ch-2')

      expect(getSessionCount()).toBe(2)
    })
  })

  describe('addMessage', () => {
    it('stores message in the correct session', () => {
      getOrCreateSession('ch-1')
      addMessage('ch-1', makeMessage('hello'))

      const history = getHistory('ch-1')
      expect(history).toHaveLength(1)
      expect(history[0].content).toBe('hello')
    })

    it('creates session if it does not exist', () => {
      addMessage('ch-new', makeMessage('hello'))

      expect(getSessionCount()).toBe(1)
      expect(getHistory('ch-new')).toHaveLength(1)
    })

    it('does not affect other channels', () => {
      addMessage('ch-1', makeMessage('msg-1'))
      addMessage('ch-2', makeMessage('msg-2'))

      expect(getHistory('ch-1')).toHaveLength(1)
      expect(getHistory('ch-1')[0].content).toBe('msg-1')
      expect(getHistory('ch-2')[0].content).toBe('msg-2')
    })
  })

  describe('getHistory', () => {
    it('returns empty array for non-existent session', () => {
      expect(getHistory('nonexistent')).toEqual([])
    })

    it('returns a copy of messages, not the original', () => {
      addMessage('ch-1', makeMessage('hello'))
      const history = getHistory('ch-1')
      history.push(makeMessage('injected'))

      expect(getHistory('ch-1')).toHaveLength(1)
    })
  })

  describe('TTL expiry', () => {
    it('destroys session after idle timeout', () => {
      getOrCreateSession('ch-1')
      expect(getSessionCount()).toBe(1)

      vi.advanceTimersByTime(5000)

      expect(getSessionCount()).toBe(0)
    })

    it('resets idle timer on new interaction', () => {
      getOrCreateSession('ch-1')

      // Advance partway, then interact
      vi.advanceTimersByTime(3000)
      getOrCreateSession('ch-1') // re-accessing resets timer

      // Advance another 3s (total 6s from start, but only 3s from last reset)
      vi.advanceTimersByTime(3000)
      expect(getSessionCount()).toBe(1)

      // Now let the full TTL elapse from last reset
      vi.advanceTimersByTime(2000)
      expect(getSessionCount()).toBe(0)
    })
  })

  describe('destroySession', () => {
    it('removes the specified session', () => {
      getOrCreateSession('ch-1')
      getOrCreateSession('ch-2')

      destroySession('ch-1')

      expect(getSessionCount()).toBe(1)
      expect(getHistory('ch-1')).toEqual([])
    })

    it('does nothing for non-existent session', () => {
      destroySession('nonexistent')
      expect(getSessionCount()).toBe(0)
    })
  })

  describe('destroyAllSessions', () => {
    it('removes all sessions', () => {
      getOrCreateSession('ch-1')
      getOrCreateSession('ch-2')
      getOrCreateSession('ch-3')

      destroyAllSessions()

      expect(getSessionCount()).toBe(0)
    })
  })
})
