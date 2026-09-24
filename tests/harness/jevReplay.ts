import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { TurnJudgment, TurnJudgmentInput } from '../../src/agent/jev/judgments.js'
import { TONE_PROMPTS, type ToneKey } from '../../src/agent/prompts/tones.js'
import { detectToneWithSource } from '../../src/agent/toneDetector.js'
import type { WindowMessage } from '../../src/session/types.js'

export interface JevReplayTurn {
  source: 'database' | 'transcript'
  channelId: string
  speakerName: string
  message: string
  recentLines: string[]
  ruleTone: ToneKey
  ruleFired: boolean
  containsCjk: boolean
}

export interface JevReplayCutoffRow {
  minimumProbability: number
  n: number
  coverage: number
  agreement: number | null
  firedN: number
  firedAgreement: number | null
  cjkN: number
  cjkAgreement: number | null
}

export interface JevReplayReport {
  totalTurns: number
  missingJudgments: number
  overallAgreement: number | null
  probabilityBins: {
    missing: number
    bins: Array<{ min: number; max: number; count: number }>
  }
  cutoffRows: JevReplayCutoffRow[]
  confusionMatrix: Array<{ ruleTone: ToneKey; counts: Record<ToneKey, number> }>
}

interface SessionHistoryReplayRow {
  channel_id: string
  role: 'user' | 'assistant'
  display_name: string
  content: string
  timestamp: number
}

interface TranscriptReplayRow {
  kind: string
  channelId: string
  displayName: string
  content: string
}

interface ReplayRow {
  turn: JevReplayTurn
  judgment: TurnJudgment | null
}

const TONE_KEYS = Object.keys(TONE_PROMPTS) as ToneKey[]
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u

function validateMaxTurns(maxTurns: number): void {
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) {
    throw new Error('maxTurns must be an integer from 1 through 100')
  }
}

function formatRecentLine(message: WindowMessage): string {
  return `[${message.displayName}]: ${message.content}`
}

function isTranscriptReplayRow(value: unknown): value is TranscriptReplayRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<TranscriptReplayRow>
  return (
    typeof row.kind === 'string' &&
    typeof row.channelId === 'string' &&
    typeof row.displayName === 'string' &&
    typeof row.content === 'string'
  )
}

function buildReplayTurn(
  source: JevReplayTurn['source'],
  channelId: string,
  message: WindowMessage,
  history: WindowMessage[]
): JevReplayTurn {
  const detection = detectToneWithSource([...history, message], 14)
  return {
    source,
    channelId,
    speakerName: message.displayName,
    message: message.content,
    recentLines: history.slice(-3).map(formatRecentLine),
    ruleTone: detection.tone,
    ruleFired: detection.ruleFired,
    containsCjk: CJK_PATTERN.test(message.content)
  }
}

export function loadDatabaseReplayTurns(database: Database.Database, maxTurns: number): JevReplayTurn[] {
  validateMaxTurns(maxTurns)
  const rows = database
    .prepare(
      'SELECT channel_id, role, display_name, content, timestamp FROM session_history ORDER BY channel_id, timestamp, rowid'
    )
    .all() as SessionHistoryReplayRow[]
  const histories = new Map<string, WindowMessage[]>()
  const turns: JevReplayTurn[] = []

  for (const row of rows) {
    const history = histories.get(row.channel_id) ?? []
    const message: WindowMessage = {
      role: row.role,
      displayName: row.role === 'assistant' ? 'Roka' : row.display_name,
      content: row.content,
      timestamp: row.timestamp
    }
    if (row.role === 'user') turns.push(buildReplayTurn('database', row.channel_id, message, history))
    history.push(message)
    histories.set(row.channel_id, history)
  }

  return turns.slice(0, maxTurns)
}

async function loadTranscriptReplayTurns(path: string): Promise<JevReplayTurn[]> {
  const content = await readFile(path, 'utf8')
  const histories = new Map<string, WindowMessage[]>()
  const turns: JevReplayTurn[] = []
  let timestamp = 0

  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    const parsed: unknown = JSON.parse(line)
    if (!isTranscriptReplayRow(parsed) || (parsed.kind !== 'message' && parsed.kind !== 'slash')) continue
    const history = histories.get(parsed.channelId) ?? []
    const message: WindowMessage = {
      role: 'user',
      displayName: parsed.displayName,
      content: parsed.content,
      timestamp: ++timestamp
    }
    turns.push(buildReplayTurn('transcript', parsed.channelId, message, history))
    history.push(message)
    histories.set(parsed.channelId, history)
  }

  return turns
}

export async function loadJevReplayTurns(
  dbPath: string,
  transcriptsDirectory: string,
  maxTurns = 100
): Promise<JevReplayTurn[]> {
  validateMaxTurns(maxTurns)
  const database = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const databaseTurns = loadDatabaseReplayTurns(database, maxTurns)
    const files = (await readdir(transcriptsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => entry.name)
      .sort()
    const transcriptTurns = (
      await Promise.all(files.map((file) => loadTranscriptReplayTurns(join(transcriptsDirectory, file))))
    ).flat()
    const turns: JevReplayTurn[] = []

    for (let index = 0; turns.length < maxTurns; index += 1) {
      const databaseTurn = databaseTurns[index]
      const transcriptTurn = transcriptTurns[index]
      if (databaseTurn) turns.push(databaseTurn)
      if (transcriptTurn && turns.length < maxTurns) turns.push(transcriptTurn)
      if (!databaseTurn && !transcriptTurn) break
    }

    return turns
  } finally {
    database.close()
  }
}

function probabilityOf(judgment: TurnJudgment | null): number | null {
  const probability = judgment?.tone?.probability
  return typeof probability === 'number' && Number.isFinite(probability) && probability >= 0 && probability <= 1
    ? probability
    : null
}

function agreement(rows: ReplayRow[]): number | null {
  if (rows.length === 0) return null
  return rows.filter(({ turn, judgment }) => judgment?.tone?.tone === turn.ruleTone).length / rows.length
}

function buildProbabilityBins(rows: ReplayRow[]): JevReplayReport['probabilityBins'] {
  const counts = Array.from({ length: 20 }, () => 0)
  let missing = 0
  for (const { judgment } of rows) {
    const probability = probabilityOf(judgment)
    if (probability === null) {
      missing += 1
      continue
    }
    counts[Math.min(19, Math.floor(probability * 20))] += 1
  }
  return {
    missing,
    bins: counts.map((count, index) => ({ min: index / 20, max: (index + 1) / 20, count }))
  }
}

function buildConfusionMatrix(rows: ReplayRow[]): JevReplayReport['confusionMatrix'] {
  const matrix = Object.fromEntries(
    TONE_KEYS.map((ruleTone) => [
      ruleTone,
      {
        ruleTone,
        counts: Object.fromEntries(TONE_KEYS.map((jevTone) => [jevTone, 0])) as Record<ToneKey, number>
      }
    ])
  ) as Record<ToneKey, JevReplayReport['confusionMatrix'][number]>

  for (const { turn, judgment } of rows) {
    if (judgment?.tone) matrix[turn.ruleTone].counts[judgment.tone.tone] += 1
  }

  return TONE_KEYS.map((tone) => matrix[tone])
}

function summarizeJevReplay(rows: ReplayRow[]): JevReplayReport {
  const withProbability = rows.filter((row) => probabilityOf(row.judgment) !== null)
  const cutoffRows = Array.from({ length: 21 }, (_, index) => index / 20).map((minimumProbability) => {
    const selected = withProbability.filter(({ judgment }) => (probabilityOf(judgment) ?? -1) >= minimumProbability)
    const fired = selected.filter(({ turn }) => turn.ruleFired)
    const cjk = selected.filter(({ turn }) => turn.containsCjk)
    return {
      minimumProbability,
      n: selected.length,
      coverage: rows.length === 0 ? 0 : selected.length / rows.length,
      agreement: agreement(selected),
      firedN: fired.length,
      firedAgreement: agreement(fired),
      cjkN: cjk.length,
      cjkAgreement: agreement(cjk)
    }
  })

  const judged = rows.filter(({ judgment }) => judgment?.tone)
  return {
    totalTurns: rows.length,
    missingJudgments: rows.length - judged.length,
    overallAgreement: agreement(judged),
    probabilityBins: buildProbabilityBins(rows),
    cutoffRows,
    confusionMatrix: buildConfusionMatrix(rows)
  }
}

export async function runJevReplay(
  turns: JevReplayTurn[],
  judge: (input: TurnJudgmentInput) => Promise<TurnJudgment | null>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
): Promise<JevReplayReport> {
  const rows: ReplayRow[] = []
  for (const [index, turn] of turns.entries()) {
    const judgment = await judge({
      speakerName: turn.speakerName,
      message: turn.message,
      recentLines: turn.recentLines,
      ambiguous: [],
      includeTone: true,
      includeLookup: false
    })
    rows.push({ turn, judgment })
    if (index + 1 < turns.length) await wait(1_000)
  }
  return summarizeJevReplay(rows)
}

function formatAgreement(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

export function renderJevReplayReport(report: JevReplayReport): string {
  const bins = report.probabilityBins.bins.map(({ min, max, count }, index) => {
    const closing = index === report.probabilityBins.bins.length - 1 ? ']' : ')'
    return `[${min.toFixed(2)}, ${max.toFixed(2)}${closing}\t${count}`
  })
  const cutoffRows = report.cutoffRows.map((row) =>
    [
      row.minimumProbability.toFixed(2),
      row.n,
      formatAgreement(row.coverage),
      formatAgreement(row.agreement),
      row.firedN,
      formatAgreement(row.firedAgreement),
      row.cjkN,
      formatAgreement(row.cjkAgreement)
    ].join('\t')
  )
  const confusionRows = report.confusionMatrix.map(({ ruleTone, counts }) =>
    [ruleTone, ...TONE_KEYS.map((tone) => counts[tone])].join('\t')
  )

  return [
    `totalTurns: ${report.totalTurns}`,
    `missingJudgments: ${report.missingJudgments}`,
    `overallRegexBaselineAgreement: ${formatAgreement(report.overallAgreement)}`,
    `Probability bins (top-option probability; missing=${report.probabilityBins.missing}):`,
    ...bins,
    'Cutoff sweep (agreement with regex baseline):',
    'minimumProbability\tn\tcoverage\tagreement\tfiredN\tfiredAgreement\tcjkN\tcjkAgreement',
    ...cutoffRows,
    'Confusion matrix (rule tone x Jev tone; counts only):',
    ['rule\\jev', ...TONE_KEYS].join('\t'),
    ...confusionRows
  ].join('\n')
}
