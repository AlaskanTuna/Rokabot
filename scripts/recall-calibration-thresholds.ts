/**
 * Turns two blind judges' labels on `pairs.jsonl` into a per-kind similarity floor (#262).
 *
 * Usage: npx tsx scripts/recall-calibration-thresholds.ts <pairs.jsonl> <labels-a.jsonl> <labels-b.jsonl>
 *
 * On a similarity ranking, lowering the floor only adds the next candidate, so recall never falls as the floor
 * drops: the lowest floor that still holds precision at `TARGET_PRECISION` is the best recall that keeps the
 * precision bar. Only the pairs both judges label the same way are scored, and a kind under `MIN_AGREED_PAIRS`
 * gets no floor at all.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from '../src/config.js'

export const TARGET_PRECISION = 0.8
export const MIN_AGREED_PAIRS = 15

export type Pair = Readonly<{
  pairId: string
  kind: string
  similarity: number
  keptByCurrentFloor: boolean
}>

export type Label = Readonly<{ pairId: string; relevant: boolean; reason: string }>

export type Scored = Readonly<{ precision: number; recall: number }>

export type KindReport = Readonly<{
  kind: string
  agreed: Pair[]
  relevant: ReadonlySet<string>
  currentFloor: number
  atCurrentFloor: Scored
  recommended: (Scored & { floor: number }) | null
}>

export function parseRows(text: string, source: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`Invalid JSON in ${source} line ${index + 1}`)
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${source} line ${index + 1} is not a JSON object`)
    }
    rows.push(value as Record<string, unknown>)
  }
  return rows
}

export function parsePairs(text: string, source = 'pairs.jsonl'): Pair[] {
  return parseRows(text, source).map((row) => {
    const { pairId, kind, similarity, keptByCurrentFloor } = row
    if (typeof pairId !== 'string' || typeof kind !== 'string') {
      throw new Error(`${source} has a pair without pairId or kind`)
    }
    if (typeof similarity !== 'number' || !Number.isFinite(similarity)) {
      throw new Error(`${source} has a pair without a numeric similarity`)
    }
    return { pairId, kind, similarity, keptByCurrentFloor: keptByCurrentFloor === true }
  })
}

export function parseLabels(text: string, source: string): Map<string, Label> {
  const labels = new Map<string, Label>()
  for (const row of parseRows(text, source)) {
    const { pairId, relevant, reason } = row
    if (typeof pairId !== 'string' || typeof relevant !== 'boolean') {
      throw new Error(`${source} has a label without pairId or relevant`)
    }
    labels.set(pairId, { pairId, relevant, reason: String(reason ?? '') })
  }
  return labels
}

/** Cohen's kappa on the shared pairs. Null when there is nothing to compare or no expected disagreement. */
export function cohensKappa(left: readonly boolean[], right: readonly boolean[]): number | null {
  const pairs = Math.min(left.length, right.length)
  if (pairs === 0) return null
  let observed = 0
  let leftYes = 0
  let rightYes = 0
  for (let index = 0; index < pairs; index++) {
    if (left[index] === right[index]) observed += 1
    if (left[index]) leftYes += 1
    if (right[index]) rightYes += 1
  }
  const expected = (leftYes / pairs) * (rightYes / pairs) + (1 - leftYes / pairs) * (1 - rightYes / pairs)
  return expected === 1 ? null : (observed / pairs - expected) / (1 - expected)
}

export function scoreAt(pairs: readonly Pair[], relevant: ReadonlySet<string>, floor: number): Scored {
  const above = pairs.filter((pair) => pair.similarity > floor)
  const truePositives = above.filter((pair) => relevant.has(pair.pairId)).length
  return {
    precision: above.length === 0 ? 0 : truePositives / above.length,
    recall: relevant.size === 0 ? 0 : truePositives / relevant.size
  }
}

/** The lowest similarity that holds precision at the target, or null when even the top pair falls short. */
export function chooseFloor(
  pairs: readonly Pair[],
  relevant: ReadonlySet<string>
): (Scored & { floor: number }) | null {
  const candidates = [...new Set(pairs.map((pair) => pair.similarity))].sort((left, right) => left - right)
  for (const floor of candidates) {
    const scored = scoreAt(pairs, relevant, floor)
    if (scored.precision >= TARGET_PRECISION) return { floor, ...scored }
  }
  return null
}

function currentFloorOf(kind: string): number {
  if (kind === 'server_fact') return config.memory.serverFactMinSimilarity
  if (kind === 'fact') return config.memory.factMinSimilarity
  if (kind === 'conversation') return config.memory.episodeMinSimilarity
  return config.memory.mediaMinSimilarity
}

/** Only the pairs both judges label the same way reach the floor: a disagreement has no ground truth to score. */
export function reportKinds(
  pairs: readonly Pair[],
  labelsA: ReadonlyMap<string, Label>,
  labelsB: ReadonlyMap<string, Label>
): KindReport[] {
  const byKind = new Map<string, Pair[]>()
  for (const pair of pairs) {
    const bucket = byKind.get(pair.kind)
    if (bucket) bucket.push(pair)
    else byKind.set(pair.kind, [pair])
  }

  const reports: KindReport[] = []
  for (const [kind, kindPairs] of [...byKind].sort(([left], [right]) => left.localeCompare(right))) {
    const agreed = kindPairs.filter((pair) => {
      const left = labelsA.get(pair.pairId)
      const right = labelsB.get(pair.pairId)
      return left !== undefined && right !== undefined && left.relevant === right.relevant
    })
    const relevant = new Set(
      agreed.filter((pair) => labelsA.get(pair.pairId)?.relevant === true).map(({ pairId }) => pairId)
    )
    const currentFloor = currentFloorOf(kind)
    reports.push({
      kind,
      agreed,
      relevant,
      currentFloor,
      atCurrentFloor: scoreAt(agreed, relevant, currentFloor),
      recommended: agreed.length < MIN_AGREED_PAIRS ? null : chooseFloor(agreed, relevant)
    })
  }
  return reports
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

export function main(
  pairsText: string,
  labelsAText: string,
  labelsBText: string,
  print: (line: string) => void = console.log
): KindReport[] {
  const pairs = parsePairs(pairsText)
  const labelsA = parseLabels(labelsAText, 'labels-a')
  const labelsB = parseLabels(labelsBText, 'labels-b')
  const ids = new Set(pairs.map(({ pairId }) => pairId))
  const coverage = (labels: ReadonlyMap<string, Label>): number =>
    [...labels.keys()].filter((pairId) => ids.has(pairId)).length

  print(`pairs: ${pairs.length}`)
  print(`judge A coverage: ${coverage(labelsA)}/${pairs.length} (${percent(coverage(labelsA) / (pairs.length || 1))})`)
  print(`judge B coverage: ${coverage(labelsB)}/${pairs.length} (${percent(coverage(labelsB) / (pairs.length || 1))})`)

  const both = [...ids].filter((pairId) => labelsA.has(pairId) && labelsB.has(pairId)).sort()
  const kappa = cohensKappa(
    both.map((pairId) => labelsA.get(pairId)?.relevant === true),
    both.map((pairId) => labelsB.get(pairId)?.relevant === true)
  )
  print(`judges both labelled: ${both.length}; Cohen's kappa: ${kappa === null ? 'undefined' : kappa.toFixed(3)}`)
  print('')

  const reports = reportKinds(pairs, labelsA, labelsB)
  for (const { kind, agreed, relevant, currentFloor, atCurrentFloor, recommended } of reports) {
    print(`## ${kind}: ${agreed.length} agreed pairs, ${relevant.size} relevant`)
    if (agreed.length < MIN_AGREED_PAIRS) {
      print(`  insufficient data: ${agreed.length} agreed pairs, ${MIN_AGREED_PAIRS} required`)
    } else if (recommended === null) {
      print(`  no floor reaches precision ${TARGET_PRECISION}`)
    } else {
      print(
        `  minimum floor for precision >= ${TARGET_PRECISION}: ${recommended.floor.toFixed(3)}` +
          ` (precision ${percent(recommended.precision)}, recall ${percent(recommended.recall)})`
      )
    }
    print(
      `  today's floor ${currentFloor.toFixed(3)}: precision ${percent(atCurrentFloor.precision)},` +
        ` recall ${percent(atCurrentFloor.recall)}`
    )
    print('')
  }
  return reports
}

async function cli(): Promise<void> {
  const [pairsPath, labelsAPath, labelsBPath] = process.argv.slice(2)
  if (!pairsPath || !labelsAPath || !labelsBPath) {
    throw new Error('Usage: recall-calibration-thresholds <pairs.jsonl> <labels-a.jsonl> <labels-b.jsonl>')
  }
  const [pairsText, labelsAText, labelsBText] = await Promise.all([
    readFile(resolve(pairsPath), 'utf8'),
    readFile(resolve(labelsAPath), 'utf8'),
    readFile(resolve(labelsBPath), 'utf8')
  ])
  main(pairsText, labelsAText, labelsBText)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
