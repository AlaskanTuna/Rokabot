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
 * Usage: npx tsx scripts/recall-gate-thresholds.ts <key.jsonl> <labels-a.jsonl> <labels-b.jsonl>
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

const isHoldout = ({ turnRef }: ScoredPair): boolean => Number.parseInt(turnRef.at(-1) ?? '0', 16) % 2 === 1
const RANK: Record<Status, number> = { confirmed: 2, provisional: 1, disabled: 0 }

/**
 * The lowest development cutoff with the best development status, scored once on the holdout.
 * Null when no development cutoff rises above disabled, or when the holdout is disabled at the chosen one.
 */
export function recommend(rows: readonly ScoredPair[], rng: () => number): { cutoff: number | null; status: Status } {
  const development = rows.filter((row) => !isHoldout(row))
  const holdout = rows.filter(isHoldout)
  const cutoffs = [...new Set(development.map(({ probability }) => probability))].sort((left, right) => left - right)
  let best: { cutoff: number; rank: number } | null = null
  for (const cutoff of cutoffs) {
    const rank = RANK[kindStatus(development, cutoff, rng).status]
    if (rank > (best?.rank ?? 0)) best = { cutoff, rank }
  }
  if (!best) return { cutoff: null, status: 'disabled' }
  const { status } = kindStatus(holdout, best.cutoff, rng)
  return status === 'disabled' ? { cutoff: null, status } : { cutoff: best.cutoff, status }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [keyPath, labelsA, labelsB] = process.argv.slice(2)
  if (!keyPath || !labelsA || !labelsB)
    throw new Error('Usage: recall-gate-thresholds <key.jsonl> <labels-a> <labels-b>')
  const keys = parseRows(readFileSync(keyPath, 'utf8'), keyPath) as Array<{
    pairId: string
    turnRef: string
    kind: string
    probability: number
  }>
  const a = parseLabels(readFileSync(labelsA, 'utf8'), labelsA)
  const b = parseLabels(readFileSync(labelsB, 'utf8'), labelsB)
  const both = keys.filter(({ pairId }) => a.has(pairId) && b.has(pairId))
  console.log(
    `pairs ${keys.length}; both judges ${both.length}; kappa ${cohensKappa(
      both.map(({ pairId }) => a.get(pairId)?.relevant ?? false),
      both.map(({ pairId }) => b.get(pairId)?.relevant ?? false)
    )?.toFixed(3)}`
  )
  const agreed: ScoredPair[] = both
    .filter(({ pairId }) => a.get(pairId)?.relevant === b.get(pairId)?.relevant)
    .map((row) => ({ ...row, relevant: a.get(row.pairId)?.relevant ?? false }))
  for (const kind of ['fact', 'server_fact', 'conversation', 'media']) {
    const rows = agreed.filter((row) => row.kind === kind)
    const pick = recommend(rows, seededRandom(262))
    const detail =
      pick.cutoff === null
        ? ''
        : ` ${JSON.stringify(kindStatus(rows.filter(isHoldout), pick.cutoff, seededRandom(262)))}`
    console.log(`${kind}: ${rows.length} agreed; recommend ${pick.cutoff ?? 'null'} (${pick.status})${detail}`)
  }
}
