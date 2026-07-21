import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    rateLimit: { rpm: 15, rpd: 500 },
    session: { ttlMs: 300_000, windowSize: 10 }
  }
}))

import { clearMessages, pushMessage } from '../messageWindow.js'
import type { WindowMessage } from '../types.js'

function makeMessage(content: string, role: 'user' | 'assistant' = 'user'): WindowMessage {
  return {
    role,
    displayName: 'TestUser',
    content,
    timestamp: Date.now()
  }
}

describe('pushMessage', () => {
  it('adds a message to an empty array', () => {
    const messages: WindowMessage[] = []
    pushMessage(messages, makeMessage('hello'))

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('hello')
  })

  it('preserves existing messages', () => {
    const messages: WindowMessage[] = [makeMessage('first')]
    pushMessage(messages, makeMessage('second'))

    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('first')
    expect(messages[1].content).toBe('second')
  })

  it('evicts oldest message when exceeding window size', () => {
    const messages: WindowMessage[] = []
    for (let i = 0; i < 10; i++) {
      pushMessage(messages, makeMessage(`msg-${i}`))
    }
    expect(messages).toHaveLength(10)

    pushMessage(messages, makeMessage('msg-10'))

    expect(messages).toHaveLength(10)
    expect(messages[0].content).toBe('msg-1')
    expect(messages[9].content).toBe('msg-10')
  })

  it('evicts multiple messages if somehow over capacity', () => {
    const messages: WindowMessage[] = []
    for (let i = 0; i < 10; i++) {
      pushMessage(messages, makeMessage(`msg-${i}`))
    }

    // Force-push extra without going through pushMessage
    messages.push(makeMessage('extra-1'))
    messages.push(makeMessage('extra-2'))

    // Now push through the function which will enforce the limit
    pushMessage(messages, makeMessage('new'))

    expect(messages).toHaveLength(10)
    expect(messages[9].content).toBe('new')
  })

  it('handles empty message content', () => {
    const messages: WindowMessage[] = []
    pushMessage(messages, makeMessage(''))

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('')
  })

  it('returns the same array reference', () => {
    const messages: WindowMessage[] = []
    const result = pushMessage(messages, makeMessage('hello'))

    expect(result).toBe(messages)
  })
})

describe('clearMessages', () => {
  it('empties a populated array', () => {
    const messages: WindowMessage[] = [makeMessage('a'), makeMessage('b')]
    clearMessages(messages)

    expect(messages).toHaveLength(0)
  })

  it('handles already empty array', () => {
    const messages: WindowMessage[] = []
    clearMessages(messages)

    expect(messages).toHaveLength(0)
  })
})
