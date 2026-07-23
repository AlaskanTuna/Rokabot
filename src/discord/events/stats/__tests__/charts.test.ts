import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it, vi } from 'vitest'
import {
  ROKA_CHART_PALETTE,
  TONE_EMOJI,
  renderActivityHeatmap,
  renderChannelHistogram,
  renderLatencyTrend,
  renderMemoryGrowth,
  renderMoodDonut
} from '../charts.js'

async function captureChartText(
  render: (charts: typeof import('../charts.js')) => Promise<Buffer | null>
): Promise<string[]> {
  const text: string[] = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    fillRect: vi.fn(),
    fillText: vi.fn((value: string) => text.push(value)),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn()
  }

  vi.resetModules()
  vi.doMock('@napi-rs/canvas', () => ({
    createCanvas: () => ({
      getContext: () => context,
      toBuffer: () => Buffer.from('chart')
    })
  }))

  try {
    await render(await import('../charts.js'))
    return text
  } finally {
    vi.doUnmock('@napi-rs/canvas')
    vi.resetModules()
  }
}

describe('stats charts', () => {
  it('uses plain emoji rather than kaomoji in the mood legend', () => {
    expect(Object.values(TONE_EMOJI).join('')).not.toMatch(/[()^_<>;=]/)
  })

  it('renders a complete 52-week heatmap grid including the seventh weekday row', async () => {
    const windowEnd = new Date('2026-07-23T00:00:00Z')
    const days = Array.from({ length: 365 }, (_, index) => {
      const day = new Date(windowEnd)
      day.setUTCDate(windowEnd.getUTCDate() - (364 - index))
      return { day: day.toISOString().slice(0, 10), count: 0 }
    })
    const chart = await renderActivityHeatmap(days)

    expect(chart?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    if (!chart) throw new Error('Heatmap did not render')

    const image = await loadImage(chart)
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)

    expect([image.width, image.height]).toEqual([900, 280])
    expect([...context.getImageData(102, 212, 1, 1).data]).toEqual([36, 31, 46, 255])
  })

  it('uses the shared Roka palette for distinct chart color degrees', () => {
    expect(ROKA_CHART_PALETTE).toMatchObject({
      heatmapEmpty: '#241f2e',
      heatmapLow: '#4d2b3d',
      heatmapMedium: '#8a4a66',
      heatmapHigh: '#cf6d97',
      heatmapPeak: '#f7a6c6',
      growthStroke: '#f7a6c6',
      latencyLine: '#c4a7e7'
    })
  })

  it('renders a PNG channel histogram', async () => {
    const chart = await renderChannelHistogram([
      { label: '#general', count: 8 },
      { label: '#bot-spam', count: 4 }
    ])

    expect(chart?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('renders a PNG mood donut', async () => {
    const chart = await renderMoodDonut([
      { tone: 'playful', count: 8 },
      { tone: 'sincere', count: 4 },
      { tone: 'domestic', count: 2 }
    ])

    expect(chart?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('draws plain text rather than emoji in the mood donut legend', async () => {
    const text = await captureChartText((charts) =>
      charts.renderMoodDonut([
        { tone: 'playful', count: 8 },
        { tone: 'sincere', count: 4 }
      ])
    )

    expect(text).toContain('Playful')
    expect(text).toContain('Sincere')
    expect(text.join('')).not.toContain(TONE_EMOJI.playful)
    expect(text.join('')).not.toContain(TONE_EMOJI.sincere)
  })

  it('renders a PNG memory growth chart', async () => {
    const chart = await renderMemoryGrowth([
      { day: '2026-07-20', cumulative: 2 },
      { day: '2026-07-21', cumulative: 6 },
      { day: '2026-07-22', cumulative: 9 }
    ])

    expect(chart?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('renders a PNG latency trend', async () => {
    const chart = await renderLatencyTrend([
      { day: '2026-07-20', p95: 1200 },
      { day: '2026-07-21', p95: 950 },
      { day: '2026-07-22', p95: 1800 }
    ])

    expect(chart?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('labels latency axes and formats millisecond-scale ticks as seconds', async () => {
    const text = await captureChartText((charts) =>
      charts.renderLatencyTrend([
        { day: '2026-07-20', p95: 3200 },
        { day: '2026-07-21', p95: 7930 }
      ])
    )

    expect(text).toContain('p95 latency')
    expect(text).toContain('Date')
    expect(text).toContain('7.9s')
    expect(text).not.toContain('7930ms')
  })
})
