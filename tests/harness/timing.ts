import type { CaptureRecord } from './captureSink.js'

export interface TurnTiming {
  handlerTotal: number
  llm: number
  discordOverhead: number
  timeToFirstSend: number | null
  sendSpan: number | null
}

interface MutableTurnTiming {
  handlerStartedAt: number
  handlerStartedWallTime: number
  handlerTotal?: number
  llmStartedAt?: number
  llm?: number
}

export function startTurnTiming(): MutableTurnTiming {
  return {
    handlerStartedAt: performance.now(),
    handlerStartedWallTime: Date.now()
  }
}

export function startLlmTiming(timing: MutableTurnTiming): void {
  timing.llmStartedAt = performance.now()
}

export function finishLlmTiming(timing: MutableTurnTiming): void {
  if (timing.llmStartedAt !== undefined) {
    timing.llm = performance.now() - timing.llmStartedAt
  }
}

export function finishTurnTiming(timing: MutableTurnTiming, records: readonly CaptureRecord[]): TurnTiming {
  timing.handlerTotal = performance.now() - timing.handlerStartedAt

  const firstRecord = records[0]
  const lastRecord = records.at(-1)
  const llm = timing.llm ?? 0

  return {
    handlerTotal: timing.handlerTotal,
    llm,
    discordOverhead: timing.handlerTotal - llm,
    timeToFirstSend: firstRecord ? firstRecord.ts - timing.handlerStartedWallTime : null,
    sendSpan: firstRecord && lastRecord ? lastRecord.ts - firstRecord.ts : null
  }
}

function formatMs(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(2)}ms`
}

/** Render the harness-controlled latency measurements for each transcript turn. */
export function renderTimingTable(rows: readonly { turn: number; kind: string; timing: TurnTiming }[]): string {
  const headers = ['Turn', 'Kind', 'handler_total', 'llm', 'discord_overhead', 'time_to_first_send', 'send_span']
  const values = rows.map(({ turn, kind, timing }) => [
    String(turn),
    kind,
    formatMs(timing.handlerTotal),
    formatMs(timing.llm),
    formatMs(timing.discordOverhead),
    formatMs(timing.timeToFirstSend),
    formatMs(timing.sendSpan)
  ])
  const widths = headers.map((header, index) => Math.max(header.length, ...values.map((row) => row[index].length)))
  const renderRow = (row: string[]) => row.map((value, index) => value.padEnd(widths[index])).join(' | ')

  return [renderRow(headers), widths.map((width) => '-'.repeat(width)).join('-|-'), ...values.map(renderRow)].join('\n')
}
