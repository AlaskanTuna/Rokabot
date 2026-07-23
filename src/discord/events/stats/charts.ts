import type { ToneKey } from '../../../agent/prompts/tones.js'
import { logger } from '../../../utils/logger.js'
import { getToneStyle } from '../../toneStyles.js'

export const ROKA_CHART_PALETTE = {
  background: '#17141f',
  text: '#f6efff',
  mutedText: '#bfb4ca',
  secondaryText: '#d9cfdf',
  grid: '#332b40',
  heatmapEmpty: '#241f2e',
  heatmapLow: '#4d2b3d',
  heatmapMedium: '#8a4a66',
  heatmapHigh: '#cf6d97',
  heatmapPeak: '#f7a6c6',
  growthStroke: '#f7a6c6',
  latencyLine: '#c4a7e7',
  latencyLow: '#6f5a94',
  latencyMedium: '#8f78b8',
  latencyHigh: '#b295d9',
  latencyPeak: '#dcc8f7'
} as const

function degreeColor(value: number, maximum: number, degrees: readonly [string, string, string, string]): string {
  const ratio = value / Math.max(1, maximum)
  return ratio <= 0.25 ? degrees[0] : ratio <= 0.5 ? degrees[1] : ratio <= 0.75 ? degrees[2] : degrees[3]
}

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export async function renderActivityHeatmap(days: { day: string; count: number }[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 900
    const height = 280
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const cellSize = 12
    const gap = 3
    const left = 96
    const top = 116
    const dayMs = 24 * 60 * 60 * 1000
    const sortedDays = [...days].sort((leftDay, rightDay) => leftDay.day.localeCompare(rightDay.day))
    const latest = sortedDays.at(-1)?.day ?? new Date().toISOString().slice(0, 10)
    const latestDate = new Date(`${latest}T00:00:00Z`)
    const latestWeekday = (latestDate.getUTCDay() + 6) % 7
    const gridStart = new Date(latestDate)
    gridStart.setUTCDate(latestDate.getUTCDate() - latestWeekday - 51 * 7)
    const countByDay = new Map(days.map(({ day, count }) => [day, count]))
    const maximum = Math.max(1, ...days.map(({ count }) => count))

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.fillRect(0, 0, width, height)
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 24px sans-serif'
    context.fillText('Activity Heatmap', 36, 46)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '16px sans-serif'
    context.fillText('Chats by day · Last 12 months', 36, 72)

    const monthLabels = new Map<number, string>()
    for (let column = 0; column < 52; column++) {
      for (let row = 0; row < 7; row++) {
        const date = new Date(gridStart.getTime() + (column * 7 + row) * dayMs)
        if ((date.getUTCDate() === 1 || column === 0) && !monthLabels.has(column)) {
          monthLabels.set(column, date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))
        }
      }
    }
    context.font = '13px sans-serif'
    monthLabels.forEach((label, column) => {
      context.fillText(label, left + column * (cellSize + gap), 102)
    })

    const weekdayLabels = [
      { label: 'Mon', row: 0 },
      { label: 'Wed', row: 2 },
      { label: 'Fri', row: 4 }
    ]
    for (const { label, row } of weekdayLabels) {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '14px sans-serif'
      context.fillText(label, 52, top + row * (cellSize + gap) + 10)
    }

    for (let column = 0; column < 52; column++) {
      for (let row = 0; row < 7; row++) {
        const date = new Date(gridStart.getTime() + (column * 7 + row) * dayMs)
        const day = date.toISOString().slice(0, 10)
        const count = countByDay.get(day) ?? 0
        const intensity = count / maximum
        const color =
          count === 0
            ? ROKA_CHART_PALETTE.heatmapEmpty
            : intensity <= 0.25
              ? ROKA_CHART_PALETTE.heatmapLow
              : intensity <= 0.5
                ? ROKA_CHART_PALETTE.heatmapMedium
                : intensity <= 0.75
                  ? ROKA_CHART_PALETTE.heatmapHigh
                  : ROKA_CHART_PALETTE.heatmapPeak

        context.fillStyle = color
        context.fillRect(left + column * (cellSize + gap), top + row * (cellSize + gap), cellSize, cellSize)
      }
    }

    if (days.length === 0) {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '16px sans-serif'
      context.fillText('No chats in this window yet.', left, 250)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats activity heatmap rendering unavailable')
    return null
  }
}

export async function renderChannelHistogram(channels: { label: string; count: number }[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 720
    const entries = [...channels].sort((left, right) => right.count - left.count).slice(0, 6)
    const height = Math.max(240, 132 + entries.length * 42)
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const maximum = Math.max(1, ...entries.map(({ count }) => count))
    const left = 190
    const right = width - 88
    const startY = 116

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.fillRect(0, 0, width, height)
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 24px sans-serif'
    context.fillText('Busiest Channels', 36, 46)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '16px sans-serif'
    context.fillText('Chats by channel', 36, 72)

    entries.forEach(({ label, count }, index) => {
      const y = startY + index * 42
      const barWidth = Math.max(3, Math.round((count / maximum) * (right - left)))

      context.fillStyle = ROKA_CHART_PALETTE.text
      context.font = '16px sans-serif'
      context.fillText(label, 36, y + 18)
      context.fillStyle = ROKA_CHART_PALETTE.heatmapEmpty
      context.fillRect(left, y, right - left, 24)
      context.fillStyle = degreeColor(count, maximum, [
        ROKA_CHART_PALETTE.heatmapLow,
        ROKA_CHART_PALETTE.heatmapMedium,
        ROKA_CHART_PALETTE.heatmapHigh,
        ROKA_CHART_PALETTE.heatmapPeak
      ])
      context.fillRect(left, y, barWidth, 24)
      context.fillStyle = ROKA_CHART_PALETTE.secondaryText
      context.fillText(String(count), right + 16, y + 18)
    })

    if (entries.length === 0) {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '16px sans-serif'
      context.fillText('No chats in this window yet.', 36, startY + 20)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats channel histogram rendering unavailable')
    return null
  }
}

export const TONE_EMOJI: Record<ToneKey, string> = {
  playful: '🎈',
  sincere: '✨',
  domestic: '🫖',
  flustered: '💗',
  curious: '🔎',
  annoyed: '⚡',
  tender: '🌷',
  confident: '🏆',
  nostalgic: '📖',
  mischievous: '🦊',
  sleepy: '🌙',
  competitive: '🥇'
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export async function renderMoodDonut(slices: { tone: string; count: number }[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const total = slices.reduce((sum, { count }) => sum + Math.max(0, count), 0)
    const visible = slices.filter(({ count }) => count > 0)
    const minor = visible.filter(({ count }) => (count / Math.max(total, 1)) * 100 < 4)
    const major = visible.filter(({ count }) => (count / Math.max(total, 1)) * 100 >= 4)
    const entries = [...major]
    const minorCount = minor.reduce((sum, { count }) => sum + count, 0)
    if (minorCount > 0) entries.push({ tone: 'other', count: minorCount })

    const width = 820
    const height = Math.max(350, 162 + entries.length * 34)
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const centerX = 204
    const centerY = 198
    const radius = 104
    const innerRadius = 62
    const dominant = [...entries].sort((left, right) => right.count - left.count)[0]

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.fillRect(0, 0, width, height)
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 24px sans-serif'
    context.fillText('Server Mood', 36, 46)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '16px sans-serif'
    context.fillText('Reply tones · Last 30 days', 36, 72)

    let startAngle = -Math.PI / 2
    for (const { tone, count } of entries) {
      const portion = total === 0 ? 0 : count / total
      const endAngle = startAngle + portion * Math.PI * 2
      context.fillStyle = tone === 'other' ? '#8f8798' : hexColor(getToneStyle(tone as ToneKey).color)
      context.beginPath()
      context.moveTo(centerX, centerY)
      context.arc(centerX, centerY, radius, startAngle, endAngle)
      context.closePath()
      context.fill()
      startAngle = endAngle
    }

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.beginPath()
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 16px sans-serif'
    context.textAlign = 'center'
    context.fillText(dominant ? titleCase(dominant.tone) : 'No mood', centerX, centerY - 4)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '14px sans-serif'
    context.fillText(
      dominant && total > 0 ? `${Math.round((dominant.count / total) * 100)}%` : '0%',
      centerX,
      centerY + 20
    )
    context.textAlign = 'start'

    entries.forEach(({ tone, count }, index) => {
      const y = 116 + index * 34
      const percent = total === 0 ? 0 : Math.round((count / total) * 100)
      const color = tone === 'other' ? '#8f8798' : hexColor(getToneStyle(tone as ToneKey).color)

      context.fillStyle = color
      context.fillRect(372, y, 16, 16)
      context.fillStyle = ROKA_CHART_PALETTE.text
      context.font = '16px sans-serif'
      context.fillText(titleCase(tone), 402, y + 14)
      context.fillStyle = ROKA_CHART_PALETTE.secondaryText
      context.fillText(`${count} · ${percent}%`, 620, y + 14)
    })

    if (entries.length === 0) {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '16px sans-serif'
      context.fillText('No replies in this window yet.', 372, 132)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats mood donut rendering unavailable')
    return null
  }
}

export async function renderMemoryGrowth(points: { day: string; cumulative: number }[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 720
    const height = 300
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const maximum = Math.max(1, ...points.map(({ cumulative }) => cumulative))
    const left = 88
    const right = width - 36
    const top = 110
    const bottom = height - 64
    const span = Math.max(1, points.length - 1)

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.fillRect(0, 0, width, height)
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 24px sans-serif'
    context.fillText('Memory Growth', 36, 46)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '16px sans-serif'
    context.fillText('Active memories over time', 36, 72)

    context.font = '12px sans-serif'
    context.fillText('Memories', 36, 98)
    context.fillText('Date', (left + right) / 2 - 12, height - 20)
    for (let index = 0; index <= 4; index++) {
      const value = Math.round((maximum * index) / 4)
      const y = bottom - (value / maximum) * (bottom - top)
      context.strokeStyle = ROKA_CHART_PALETTE.grid
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(left, y)
      context.lineTo(right, y)
      context.stroke()
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.fillText(String(value), 52, y + 4)
    }

    context.strokeStyle = ROKA_CHART_PALETTE.grid
    context.beginPath()
    context.moveTo(left, top)
    context.lineTo(left, bottom)
    context.lineTo(right, bottom)
    context.stroke()

    if (points.length > 0) {
      context.beginPath()
      points.forEach(({ cumulative }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (cumulative / maximum) * (bottom - top)
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.lineTo(right, bottom)
      context.lineTo(left, bottom)
      context.closePath()
      const fillGradient = context.createLinearGradient(0, top, 0, bottom)
      fillGradient.addColorStop(0, `${ROKA_CHART_PALETTE.growthStroke}80`)
      fillGradient.addColorStop(1, `${ROKA_CHART_PALETTE.growthStroke}08`)
      context.fillStyle = fillGradient
      context.fill()
      context.strokeStyle = ROKA_CHART_PALETTE.growthStroke
      context.lineWidth = 3
      context.beginPath()
      points.forEach(({ cumulative }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (cumulative / maximum) * (bottom - top)
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
      const tickIndices = [...new Set([0, Math.floor(span / 2), points.length - 1])]
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '12px sans-serif'
      for (const index of tickIndices) {
        const x = left + (index / span) * (right - left)
        context.fillText(points[index].day.slice(5), Math.max(left, x - 16), bottom + 20)
      }
      const growth = (points.at(-1)?.cumulative ?? 0) - points[0].cumulative
      if (growth !== 0) {
        const lastY = bottom - ((points.at(-1)?.cumulative ?? 0) / maximum) * (bottom - top)
        context.fillStyle = ROKA_CHART_PALETTE.growthStroke
        context.font = 'bold 13px sans-serif'
        context.fillText(`${growth > 0 ? '+' : ''}${growth} this month`, right - 132, Math.max(top + 16, lastY - 12))
      }
    } else {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '16px sans-serif'
      context.fillText('No active memories in this window yet.', left, top + 36)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats memory growth rendering unavailable')
    return null
  }
}

export async function renderLatencyTrend(points: { day: string; p95: number }[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 720
    const height = 300
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const maximum = Math.max(1, ...points.map(({ p95 }) => p95))
    const left = 88
    const right = width - 36
    const top = 110
    const bottom = height - 64
    const span = Math.max(1, points.length - 1)

    context.fillStyle = ROKA_CHART_PALETTE.background
    context.fillRect(0, 0, width, height)
    context.fillStyle = ROKA_CHART_PALETTE.text
    context.font = 'bold 24px sans-serif'
    context.fillText('Response Latency', 36, 46)
    context.fillStyle = ROKA_CHART_PALETTE.mutedText
    context.font = '16px sans-serif'
    context.fillText('Daily p95 response time', 36, 72)

    context.font = '12px sans-serif'
    context.fillText('p95 latency', 36, 98)
    context.fillText('Date', (left + right) / 2 - 12, height - 20)
    for (let index = 0; index <= 4; index++) {
      const value = Math.round((maximum * index) / 4)
      const y = bottom - (value / maximum) * (bottom - top)
      context.strokeStyle = ROKA_CHART_PALETTE.grid
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(left, y)
      context.lineTo(right, y)
      context.stroke()
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.fillText(value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`, 34, y + 4)
    }

    context.strokeStyle = ROKA_CHART_PALETTE.grid
    context.beginPath()
    context.moveTo(left, top)
    context.lineTo(left, bottom)
    context.lineTo(right, bottom)
    context.stroke()

    if (points.length > 0) {
      context.strokeStyle = ROKA_CHART_PALETTE.latencyLine
      context.lineWidth = 3
      context.beginPath()
      points.forEach(({ p95 }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (p95 / maximum) * (bottom - top)
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
      points.forEach(({ p95 }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (p95 / maximum) * (bottom - top)
        context.fillStyle = degreeColor(p95, maximum, [
          ROKA_CHART_PALETTE.latencyLow,
          ROKA_CHART_PALETTE.latencyMedium,
          ROKA_CHART_PALETTE.latencyHigh,
          ROKA_CHART_PALETTE.latencyPeak
        ])
        context.beginPath()
        context.arc(x, y, 3.5, 0, Math.PI * 2)
        context.fill()
      })
      const tickIndices = [...new Set([0, Math.floor(span / 2), points.length - 1])]
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '12px sans-serif'
      for (const index of tickIndices) {
        const x = left + (index / span) * (right - left)
        context.fillText(points[index].day.slice(5), Math.max(left, x - 16), bottom + 20)
      }
    } else {
      context.fillStyle = ROKA_CHART_PALETTE.mutedText
      context.font = '16px sans-serif'
      context.fillText('No latency samples in this window yet.', left, top + 36)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats latency trend rendering unavailable')
    return null
  }
}
