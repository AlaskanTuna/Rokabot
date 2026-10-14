/**
 * Per-kind Jev cutoffs under the owner's enable rule (#262, 2026-10-15):
 * provisional at >= 25 selected labels over >= 20 turns with precision >= 88%;
 * confirmed at >= 50 over >= 30 turns with a 95% turn-cluster bootstrap lower bound >= 80%.
 * A kind with >= 50 selected labels over >= 30 turns is confirmation-eligible and is judged on the bootstrap bound
 * alone: failing it disables the kind (its cutoff returns to null) and does not fall back to provisional.
 *
 * The cutoff is chosen on the development half (last turnRef hex digit even) and the untouched holdout half
 * (odd) is scored once at that cutoff, so the holdout never steers the choice.
 *
 * Pairs the two judges split on are settled by the optional adjudicated-labels file (same {pairId, relevant} shape as
 * the judges' labels). A disagreed pair nobody adjudicated counts as not relevant: scoring only the agreed pairs would
 * overstate precision (spec line 152), so the conservative reading is the default.
 *
 * Usage: npx tsx scripts/recall-gate-thresholds.ts <key.jsonl> <labels-a.jsonl> <labels-b.jsonl> [adjudicated.jsonl]
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { seededRandom } from './recall-calibration-sample.js'
import { cohensKappa, parseLabels, parseRows } from './recall-calibration-thresholds.js'

export type ScoredPair = Readonly<{
  pairId: string
  turnRef: string
  kind: string
  probability: number
  relevant: boolean
}>
type Status = 'confirmed' | 'provisional' | 'disabled'
type Basis = 'agreed' | 'adjudicated' | 'missed'
export type KeyRow = Pick<ScoredPair, 'pairId' | 'turnRef' | 'kind' | 'probability'>
export type SettledPair = ScoredPair & Readonly<{ basis: Basis }>
type Labels = ReadonlyMap<string, Readonly<{ relevant: boolean }>>

const KINDS = ['fact', 'server_fact', 'conversation', 'media']

const BOOTSTRAP_RESAMPLES = 2000

function bootstrapLowerBound(selected: readonly ScoredPair[], rng: () => number): number {
  const byTurn = new Map<string, ScoredPair[]>()
  for (const row of selected) byTurn.set(row.turnRef, [...(byTurn.get(row.turnRef) ?? []), row])
  const turns = [...byTurn.values()]
  const estimates: number[] = []
  for (let draw = 0; draw < BOOTSTRAP_RESAMPLES; draw++) {
    let hits = 0
    let total = 0
    for (let pick = 0; pick < turns.length; pick++) {
      const turn = turns[Math.floor(rng() * turns.length)]
      total += turn.length
      hits += turn.filter(({ relevant }) => relevant).length
    }
    estimates.push(total === 0 ? 0 : hits / total)
  }
  estimates.sort((left, right) => left - right)
  return estimates[Math.floor(0.025 * estimates.length)]
}

export function kindStatus(rows: readonly ScoredPair[], cutoff: number, rng: () => number) {
  const selected = rows.filter(({ probability }) => probability >= cutoff)
  const turns = new Set(selected.map(({ turnRef }) => turnRef)).size
  const precision = selected.length === 0 ? 0 : selected.filter(({ relevant }) => relevant).length / selected.length
  const lowerBound = selected.length === 0 ? 0 : bootstrapLowerBound(selected, rng)
  const confirmationEligible = selected.length >= 50 && turns >= 30
  const status: Status = confirmationEligible
    ? lowerBound >= 0.8
      ? 'confirmed'
      : 'disabled'
    : selected.length >= 25 && turns >= 20 && precision >= 0.88
      ? 'provisional'
      : 'disabled'
  return { selected: selected.length, turns, precision, lowerBound, status }
}

export type KindResult = ReturnType<typeof kindStatus>

export type Recommendation = {
  cutoff: number | null
  status: Status
  /** The cutoff development chose, kept when the holdout rejects it; null when no development cutoff qualifies. */
  developmentCutoff: number | null
  /** Development's status at that cutoff, or its best status (disabled) when none qualifies. */
  developmentStatus: Status
  /** The holdout result scored at the development cutoff; null when none was scored. */
  holdout: KindResult | null
}

const isHoldout = ({ turnRef }: ScoredPair): boolean => Number.parseInt(turnRef.at(-1) ?? '0', 16) % 2 === 1
const RANK: Record<Status, number> = { confirmed: 2, provisional: 1, disabled: 0 }

/**
 * The lowest development cutoff with the best development status, scored once on the holdout.
 * Null when no development cutoff rises above disabled, or when the holdout is disabled at the chosen one.
 */
export function recommend(rows: readonly ScoredPair[], rng: () => number): Recommendation {
  const development = rows.filter((row) => !isHoldout(row))
  const holdout = rows.filter(isHoldout)
  const cutoffs = [...new Set(development.map(({ probability }) => probability))].sort((left, right) => left - right)
  let best: { cutoff: number; status: Status } | null = null
  for (const cutoff of cutoffs) {
    const { status } = kindStatus(development, cutoff, rng)
    if (RANK[status] > RANK[best?.status ?? 'disabled']) best = { cutoff, status }
  }
  if (!best)
    return { cutoff: null, status: 'disabled', developmentCutoff: null, developmentStatus: 'disabled', holdout: null }
  const result = kindStatus(holdout, best.cutoff, rng)
  const { cutoff: developmentCutoff, status: developmentStatus } = best
  return {
    cutoff: result.status === 'disabled' ? null : developmentCutoff,
    status: result.status,
    developmentCutoff,
    developmentStatus,
    holdout: result
  }
}

export const formatKappa = (kappa: number | null): string => (kappa === null ? 'n/a' : kappa.toFixed(3))

export function reportKind(
  kind: string,
  agreed: number,
  disagreed: number,
  pick: Recommendation,
  adjudicated = 0
): string {
  const head = `${kind}: ${agreed} agreed, ${disagreed} disagreed (${adjudicated} adjudicated, ${disagreed - adjudicated} counted as misses);`
  if (pick.developmentCutoff === null)
    return `${head} no cutoff, no development cutoff qualifies (best development status ${pick.developmentStatus})`
  const tail = `development ${pick.developmentStatus}; holdout ${JSON.stringify(pick.holdout)}`
  return pick.cutoff === null
    ? `${head} no cutoff, holdout rejected cutoff ${pick.developmentCutoff}; ${tail}`
    : `${head} recommend ${pick.cutoff} (${pick.status}); ${tail}`
}

export function dedupeKeys<T extends { pairId: string }>(keys: readonly T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of keys) {
    if (seen.has(row.pairId)) continue
    seen.add(row.pairId)
    unique.push(row)
  }
  return unique
}

export function tally(rows: readonly SettledPair[]): Record<Basis, number> {
  const counts: Record<Basis, number> = { agreed: 0, adjudicated: 0, missed: 0 }
  for (const { basis } of rows) counts[basis] += 1
  return counts
}

/**
 * The relevance each labelled pair is scored on: the shared label when the judges agree, the adjudicator's label when
 * they split and one exists, otherwise not relevant. An adjudicator never overrides an agreed pair.
 */
export function settleLabels(keys: readonly KeyRow[], a: Labels, b: Labels, adjudicated: Labels = new Map()) {
  const rows: SettledPair[] = []
  for (const row of keys) {
    const first = a.get(row.pairId)
    const second = b.get(row.pairId)
    if (!first || !second) continue
    if (first.relevant === second.relevant) {
      rows.push({ ...row, relevant: first.relevant, basis: 'agreed' })
      continue
    }
    const ruling = adjudicated.get(row.pairId)
    rows.push(
      ruling
        ? { ...row, relevant: ruling.relevant, basis: 'adjudicated' }
        : { ...row, relevant: false, basis: 'missed' }
    )
  }
  return { rows, judged: rows.length, ...tally(rows) }
}

export function thresholdLines(keys: readonly KeyRow[], a: Labels, b: Labels, adjudicated?: Labels): string[] {
  const unique = dedupeKeys(keys)
  const settled = settleLabels(unique, a, b, adjudicated)
  const labelled = (labels: Labels) => settled.rows.map(({ pairId }) => labels.get(pairId)?.relevant === true)
  const lines = [
    `pairs ${unique.length}; both judges ${settled.judged}; kappa ${formatKappa(cohensKappa(labelled(a), labelled(b)))}; ` +
      `disagreed ${settled.adjudicated + settled.missed}: ${settled.adjudicated} adjudicated, ${settled.missed} counted as not relevant`
  ]
  for (const kind of KINDS) {
    const rows = settled.rows.filter((row) => row.kind === kind)
    const counts = tally(rows)
    lines.push(
      reportKind(
        kind,
        counts.agreed,
        counts.adjudicated + counts.missed,
        recommend(rows, seededRandom(262)),
        counts.adjudicated
      )
    )
  }
  return lines
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [keyPath, labelsA, labelsB, adjudicatedPath] = process.argv.slice(2)
  if (!keyPath || !labelsA || !labelsB)
    throw new Error('Usage: recall-gate-thresholds <key.jsonl> <labels-a> <labels-b> [adjudicated]')
  const keys = parseRows(readFileSync(keyPath, 'utf8'), keyPath) as KeyRow[]
  const adjudicated = adjudicatedPath ? parseLabels(readFileSync(adjudicatedPath, 'utf8'), adjudicatedPath) : undefined
  const lines = thresholdLines(
    keys,
    parseLabels(readFileSync(labelsA, 'utf8'), labelsA),
    parseLabels(readFileSync(labelsB, 'utf8'), labelsB),
    adjudicated
  )
  for (const line of lines) console.log(line)
}
