import { describe, expect, it } from 'vitest'

import { resolveMemoryScope } from '../memory/memoryScope.js'

describe('resolveMemoryScope', () => {
  it.each([
    ['off', false, 'none'],
    ['relaxed', false, 'none'],
    ['off', true, 'forget'],
    ['relaxed', true, 'full'],
    ['balanced', true, 'full'],
    ['strict', true, 'full']
  ] as const)('maps memory %s with privacy %s to %s', (privacy, memory, scope) => {
    expect(resolveMemoryScope(memory, privacy)).toBe(scope)
  })

  it('keeps a memory-free turn memory-free whatever the privacy level', () => {
    for (const privacy of ['relaxed', 'balanced', 'strict', 'off'] as const) {
      expect(resolveMemoryScope(false, privacy)).toBe('none')
    }
  })
})
