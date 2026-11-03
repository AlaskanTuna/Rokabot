import { describe, expect, it, vi } from 'vitest'

vi.mock('../../character/index.js', () => ({
  character: {
    moodKeys: ['calm', 'warm'],
    moods: {
      calm: { color: 11, placeholder: 'https://example/calm.png' },
      warm: { color: 22, placeholder: 'https://example/warm.png' }
    },
    defaultMood: 'calm'
  }
}))

import { getToneStyle } from '../toneStyles.js'

describe('getToneStyle', () => {
  it('falls back to the default mood for a removed playful tone', () => {
    expect(getToneStyle('playful')).toEqual({ color: 11, imageUrl: 'https://example/calm.png' })
  })

  it('falls back to the default mood for a renamed tone', () => {
    expect(getToneStyle('renamed')).toEqual({ color: 11, imageUrl: 'https://example/calm.png' })
  })

  it('returns the matching style for a known tone', () => {
    expect(getToneStyle('warm')).toEqual({ color: 22, imageUrl: 'https://example/warm.png' })
  })
})
