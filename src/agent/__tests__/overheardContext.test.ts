import { beforeEach, describe, expect, it } from 'vitest'
import { maybeExtractFromBuffer, resetCounters } from '../memoryExtractor.js'
import { addMessage, getMessages, resetAllBuffers } from '../passiveBuffer.js'

describe('overheard context (passive buffer persistence)', () => {
  beforeEach(() => {
    resetAllBuffers()
    resetCounters()
  })

  it('buffer retains messages after extraction triggers', () => {
    // Fill buffer with 12 messages (exceeds extractionInterval of 10)
    for (let i = 0; i < 12; i++) {
      addMessage('ch-1', `user-${i % 3}`, `User${i % 3}`, `user${i % 3}`, `message ${i}`)
    }

    // Trigger extraction counting (each call increments internal counter)
    for (let i = 0; i < 12; i++) {
      maybeExtractFromBuffer('ch-1')
    }

    // Buffer should still contain all 12 messages (not cleared)
    const messages = getMessages('ch-1')
    expect(messages.length).toBe(12)
    expect(messages[0].content).toBe('message 0')
    expect(messages[11].content).toBe('message 11')
  })

  it('buffer caps at bufferSize via FIFO eviction', () => {
    // Add 25 messages to exceed buffer size of 20
    for (let i = 0; i < 25; i++) {
      addMessage('ch-2', 'user-1', 'Alice', 'alice', `msg ${i}`)
    }

    const messages = getMessages('ch-2')
    expect(messages.length).toBe(20)
    // Oldest 5 should be evicted
    expect(messages[0].content).toBe('msg 5')
    expect(messages[19].content).toBe('msg 24')
  })

  it('overheard context format matches expected prompt structure', () => {
    addMessage('ch-3', 'user-a', 'Alice', 'alice', 'anyone wanna play maimai?')
    addMessage('ch-3', 'user-b', 'Bob', 'bob', 'sure, after dinner')
    addMessage('ch-3', 'user-a', 'Alice', 'alice', 'cool, 8pm?')

    const messages = getMessages('ch-3')
    const overheardText = messages.map((m) => `[${m.displayName}]: ${m.content}`).join('\n')

    expect(overheardText).toBe('[Alice]: anyone wanna play maimai?\n[Bob]: sure, after dinner\n[Alice]: cool, 8pm?')
  })

  it('empty buffer produces no overheard context', () => {
    const messages = getMessages('nonexistent')
    expect(messages.length).toBe(0)
  })
})
