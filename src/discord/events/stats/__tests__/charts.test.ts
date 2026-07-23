import { describe, expect, it } from 'vitest'
import { renderActivitySparkline, renderToneBarChart } from '../charts.js'

describe('stats charts', () => {
  it('renders PNG charts when the canvas backend is available', async () => {
    const tones = await renderToneBarChart(
      new Map([
        ['playful', 8],
        ['sincere', 4],
        ['domestic', 2]
      ])
    )
    const activity = await renderActivitySparkline([
      { day: '2026-07-20', count: 2 },
      { day: '2026-07-21', count: 6 },
      { day: '2026-07-22', count: 4 }
    ])

    expect(tones?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(activity?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })
})
