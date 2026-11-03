import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ debug: vi.fn() }))

vi.mock('@napi-rs/canvas', () => {
  throw new Error('canvas unavailable')
})
vi.mock('../../../../utils/logger.js', () => ({ logger: { debug: mocks.debug } }))

import {
  renderActivityHeatmap,
  renderChannelHistogram,
  renderLatencyTrend,
  renderMemoryGrowth,
  renderMoodDonut
} from '../charts.js'

describe('stats chart fallback', () => {
  it('returns null when the lazy canvas import fails', async () => {
    await expect(renderActivityHeatmap([{ day: '2026-07-23', count: 1 }])).resolves.toBeNull()
    await expect(renderChannelHistogram([{ label: '#general', count: 1 }])).resolves.toBeNull()
    await expect(renderMoodDonut([{ tone: 'playful', count: 1 }])).resolves.toBeNull()
    await expect(renderMemoryGrowth([{ day: '2026-07-23', cumulative: 1 }])).resolves.toBeNull()
    await expect(renderLatencyTrend([{ day: '2026-07-23', p95: 1000 }])).resolves.toBeNull()
    expect(mocks.debug).toHaveBeenCalledTimes(5)
  })
})
