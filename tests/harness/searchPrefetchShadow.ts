import type Database from 'better-sqlite3'

export type SearchPrefetchRow = {
  needsLookup: number | null
  prefetchMode: 'off' | 'shadow' | 'on'
  threshold: number
  prefetchStatus: string | null
  toolCalled: boolean
}

export interface PrefetchShadowReport {
  totalTurns: number
  judgedTurns: number
  missingNoul: number
  wouldHaveSearched: number
  searched: number
  statusCounts: Record<string, number>
  precisionByThreshold: Array<{
    minimumNoul: number
    n: number
    wouldHaveSearched: number
    geminiSearched: number
    agreement: number | null
  }>
}

const DEFAULT_PREFETCH_THRESHOLD = 0.7

type StoredTurn = {
  channel_id: string
  answer: string | null
  question: string | null
  tools_used: string | null
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function needsLookupValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function prefetchModeValue(value: unknown): SearchPrefetchRow['prefetchMode'] {
  return value === 'shadow' || value === 'on' || value === 'off' ? value : 'off'
}

function toolWasCalled(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const tools: unknown = JSON.parse(value)
    return Array.isArray(tools) && tools.includes('search_web')
  } catch {
    return false
  }
}

export function readSearchPrefetchRows(database: Database.Database, sinceMs: number): SearchPrefetchRow[] {
  try {
    const turns = database
      .prepare(
        `SELECT j.channel_id, j.answer, j.question,
          (SELECT r.tools_used FROM response_events AS r
           WHERE r.channel_id = j.channel_id AND r.created_at >= j.created_at
           ORDER BY r.created_at ASC, r.id ASC LIMIT 1) AS tools_used
         FROM jev_events AS j
         WHERE j.kind = 'turn' AND j.created_at >= ?
         ORDER BY j.created_at ASC`
      )
      .all(sinceMs) as StoredTurn[]

    return turns.map((turn) => {
      const answer = parseObject(turn.answer)
      const question = parseObject(turn.question)
      const status = answer?.prefetchStatus
      return {
        needsLookup: needsLookupValue(answer?.needsLookup),
        prefetchMode: prefetchModeValue(question?.prefetch),
        threshold: DEFAULT_PREFETCH_THRESHOLD,
        prefetchStatus: typeof status === 'string' ? status : null,
        toolCalled: toolWasCalled(turn.tools_used)
      }
    })
  } catch {
    return []
  }
}

export function scorePrefetchShadow(rows: SearchPrefetchRow[]): PrefetchShadowReport {
  const judged = rows.filter((row) => row.needsLookup !== null)
  const statusCounts: Record<string, number> = {}
  for (const row of rows) {
    const status = row.prefetchStatus ?? 'unknown'
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
  }
  const precisionByThreshold = Array.from({ length: 20 }, (_, index) => index / 20).map((minimumNoul) => {
    const selected = judged.filter((row) => row.needsLookup !== null && row.needsLookup >= minimumNoul)
    const matched = selected.filter((row) => row.toolCalled)
    return {
      minimumNoul,
      n: selected.length,
      wouldHaveSearched: selected.length,
      geminiSearched: matched.length,
      agreement: selected.length === 0 ? null : matched.length / selected.length
    }
  })

  return {
    totalTurns: rows.length,
    judgedTurns: judged.length,
    missingNoul: rows.length - judged.length,
    wouldHaveSearched: judged.filter((row) => row.needsLookup !== null && row.needsLookup >= row.threshold).length,
    searched: rows.filter((row) => row.prefetchStatus === 'ready').length,
    statusCounts,
    precisionByThreshold
  }
}

export function renderPrefetchShadowReport(report: PrefetchShadowReport): string {
  const statuses = Object.entries(report.statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`)
    .join(' ')
  const lines = [
    'Search Prefetch Shadow',
    `totalTurns=${report.totalTurns}`,
    `judgedTurns=${report.judgedTurns}`,
    `missingNoul=${report.missingNoul}`,
    `wouldHaveSearched=${report.wouldHaveSearched}`,
    `searched=${report.searched}`,
    `statusCounts ${statuses || 'none'}`,
    'thresholdSweep'
  ]

  for (const row of report.precisionByThreshold) {
    const agreement = row.agreement === null ? 'null' : row.agreement.toFixed(3)
    lines.push(
      `${row.minimumNoul.toFixed(2)} n=${row.n} wouldHaveSearched=${row.wouldHaveSearched} ` +
        `geminiSearched=${row.geminiSearched} agreement=${agreement}`
    )
  }

  return lines.join('\n')
}
