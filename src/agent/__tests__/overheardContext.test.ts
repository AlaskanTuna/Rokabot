import { beforeEach, describe, expect, it } from 'vitest'
import { addMessage, getMessages, resetAllBuffers } from '../passiveBuffer.js'

describe('overheard context (passive buffer persistence)', () => {
  beforeEach(() => {
    resetAllBuffers()
  })

  it('buffer caps at bufferSize via FIFO eviction', () => {
    // Add 35 messages to exceed the default buffer size of 30
    for (let i = 0; i < 35; i++) {
      addMessage('ch-2', 'user-1', 'Alice', 'alice', `msg ${i}`)
    }

    const messages = getMessages('ch-2')
    expect(messages.length).toBe(30)
    // Oldest 5 should be evicted
    expect(messages[0].content).toBe('msg 5')
    expect(messages[29].content).toBe('msg 34')
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
