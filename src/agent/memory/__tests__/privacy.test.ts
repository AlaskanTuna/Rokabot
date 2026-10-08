import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config.js', () => ({
  config: { memory: { privacy: 'relaxed' } }
}))

import { registerChannelVisibility, resetChannelVisibilityForTest } from '../channelVisibility.js'
import { canRecall } from '../privacy.js'

const parents: Record<string, string> = { 'thread-1': 'private-1' }
const visibilities: Record<string, 'public' | 'private'> = { 'public-1': 'public', 'private-1': 'private' }

const here = { guildId: 'g', channelId: 'general' }

beforeEach(() => {
  registerChannelVisibility({
    visibility: (channelId) => visibilities[channelId] ?? 'private',
    parentOf: (channelId) => parents[channelId] ?? null
  })
})

afterEach(() => {
  resetChannelVisibilityForTest()
})

describe('canRecall', () => {
  it('relaxed recalls everything and off recalls nothing', () => {
    expect(canRecall(['private-1'], here, 'relaxed')).toBe(true)
    expect(canRecall(['general'], here, 'off')).toBe(false)
  })

  it('strict recalls only from this channel or the channel this thread belongs to', () => {
    expect(canRecall(['general'], here, 'strict')).toBe(true)
    expect(canRecall(['public-1'], here, 'strict')).toBe(false)
    expect(canRecall(['private-1'], { guildId: 'g', channelId: 'thread-1' }, 'strict')).toBe(true)
  })

  it('balanced shares public channels and keeps private ones', () => {
    expect(canRecall(['public-1'], here, 'balanced')).toBe(true)
    expect(canRecall(['private-1'], here, 'balanced')).toBe(false)
    expect(canRecall(['private-1'], { guildId: 'g', channelId: 'private-1' }, 'balanced')).toBe(true)
  })

  it('passes when any source passes', () => {
    expect(canRecall(['private-1', 'public-1'], here, 'balanced')).toBe(true)
  })

  it('treats a missing source as public under balanced and never recalls it under strict', () => {
    expect(canRecall([null], here, 'balanced')).toBe(true)
    expect(canRecall([], here, 'balanced')).toBe(true)
    expect(canRecall([null], here, 'strict')).toBe(false)
  })

  it('treats every channel as private when no resolver is registered', () => {
    resetChannelVisibilityForTest()
    expect(canRecall(['public-1'], here, 'balanced')).toBe(false)
  })

  it('reads the configured level when none is passed', () => {
    expect(canRecall(['private-1'], here)).toBe(true)
  })
})
