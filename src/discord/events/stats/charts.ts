import type { ToneKey } from '../../../agent/prompts/tones.js'
import { logger } from '../../../utils/logger.js'
import { getToneStyle } from '../../toneStyles.js'

export interface DailyCount {
  day: string
  count: number
}

function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export async function renderToneBarChart(toneCounts: ReadonlyMap<string, number>): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 720
    const height = 400
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const entries = [...toneCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12)
    const maximum = Math.max(1, ...entries.map(([, count]) => count))

    context.fillStyle = '#17141f'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#f6efff'
    context.font = 'bold 24px sans-serif'
    context.fillText('Mood Ring', 36, 48)
    context.fillStyle = '#bfb4ca'
    context.font = '16px sans-serif'
    context.fillText('Replies by detected tone', 36, 74)

    const rowHeight = Math.max(24, Math.min(30, Math.floor(270 / Math.max(entries.length, 1))))
    const startY = 104
    for (const [index, [tone, count]] of entries.entries()) {
      const y = startY + index * rowHeight
      const color = hexColor(getToneStyle(tone as ToneKey).color)
      const barWidth = Math.max(3, Math.round((count / maximum) * 410))

      context.fillStyle = '#2b2535'
      context.fillRect(184, y, 430, rowHeight - 8)
      context.fillStyle = color
      context.fillRect(184, y, barWidth, rowHeight - 8)
      context.fillStyle = '#f6efff'
      context.font = '16px sans-serif'
      context.fillText(tone, 36, y + rowHeight - 12)
      context.fillStyle = '#d9cfdf'
      context.fillText(String(count), 632, y + rowHeight - 12)
    }

    if (entries.length === 0) {
      context.fillStyle = '#bfb4ca'
      context.font = '18px sans-serif'
      context.fillText('No replies in this window yet.', 36, 132)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats tone chart rendering unavailable')
    return null
  }
}

export async function renderActivitySparkline(dailyCounts: readonly DailyCount[]): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas')
    const width = 720
    const height = 180
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const counts = dailyCounts.map(({ count }) => count)
    const maximum = Math.max(1, ...counts)
    const left = 42
    const right = width - 36
    const top = 38
    const bottom = height - 42
    const span = Math.max(1, dailyCounts.length - 1)

    context.fillStyle = '#17141f'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#f6efff'
    context.font = 'bold 20px sans-serif'
    context.fillText('Activity', 36, 28)
    context.strokeStyle = '#332b40'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(left, bottom)
    context.lineTo(right, bottom)
    context.stroke()

    if (dailyCounts.length > 0) {
      context.strokeStyle = '#ffb3d9'
      context.lineWidth = 3
      context.beginPath()
      dailyCounts.forEach(({ count }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (count / maximum) * (bottom - top)
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()

      dailyCounts.forEach(({ day, count }, index) => {
        const x = left + (index / span) * (right - left)
        const y = bottom - (count / maximum) * (bottom - top)
        context.fillStyle = '#ffb3d9'
        context.beginPath()
        context.arc(x, y, 4, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#bfb4ca'
        context.font = '13px sans-serif'
        context.fillText(day.slice(5), Math.max(left, x - 18), height - 16)
      })
    } else {
      context.fillStyle = '#bfb4ca'
      context.font = '16px sans-serif'
      context.fillText('No replies in this window yet.', left, 96)
    }

    return canvas.toBuffer('image/png')
  } catch (error) {
    logger.debug({ err: error }, 'Stats activity chart rendering unavailable')
    return null
  }
}
