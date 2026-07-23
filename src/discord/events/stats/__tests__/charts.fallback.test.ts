import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ debug: vi.fn() }))

vi.mock('@napi-rs/canvas', () => {
  throw new Error('canvas unavailable')
})
vi.mock('../../../../utils/logger.js', () => ({ logger: { debug: mocks.debug } }))

import { renderActivitySparkline, renderToneBarChart } from '../charts.js'

describe('stats chart fallback', () => {
  it('returns null when the lazy canvas import fails', async () => {
    await expect(renderToneBarChart(new Map([['playful', 1]]))).resolves.toBeNull()
    await expect(renderActivitySparkline([{ day: '2026-07-23', count: 1 }])).resolves.toBeNull()
    expect(mocks.debug).toHaveBeenCalledTimes(2)
  })
})
