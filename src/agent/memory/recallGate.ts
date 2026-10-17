import { config } from '../../config.js'
import { getAllUserNames } from '../../storage/userNames.js'
import { estimateTokens } from '../../utils/tokens.js'
import {
  type GatePool,
  type GatePoolEntry,
  type RecallItem,
  type RecallItemKind,
  formatRecallBlock,
  packRecallItems
} from './recall.js'

export type ShortlistEntry = GatePoolEntry & Readonly<{ key: string }>

const LANE_ORDER: readonly RecallItemKind[] = ['fact', 'server_fact', 'conversation', 'media']

export const gateKey = (item: Pick<RecallItem, 'kind' | 'id'>): string => `${item.kind}:${item.id}`

/** Per-kind lanes, interleaved fact → server → conversation → media; slots a lane cannot use go to the best rest. */
export function buildRecallShortlist(pool: GatePool, lanes: Record<RecallItemKind, number>): ShortlistEntry[] {
  const names = getAllUserNames()
  const fitsAlone = (entry: GatePoolEntry): boolean =>
    estimateTokens(formatRecallBlock([entry.item], names)) <= config.memory.recallTokenBudget
  const usable = pool.entries.filter(fitsAlone)
  const byKind = new Map<RecallItemKind, GatePoolEntry[]>(LANE_ORDER.map((kind) => [kind, []]))
  for (const entry of usable) byKind.get(entry.item.kind)?.push(entry)
  // Keyword-matched facts name what the message asks about, so they are offered before closer embeddings.
  byKind.get('fact')?.sort((left, right) => Number(right.keyword) - Number(left.keyword))

  const taken = LANE_ORDER.map((kind) => (byKind.get(kind) ?? []).slice(0, lanes[kind]))
  const interleaved: GatePoolEntry[] = []
  for (let index = 0; taken.some((lane) => index < lane.length); index++) {
    for (const lane of taken) if (index < lane.length) interleaved.push(lane[index])
  }
  const total = LANE_ORDER.reduce((sum, kind) => sum + lanes[kind], 0)
  const chosen = new Set(interleaved)
  const lent = usable.filter((entry) => !chosen.has(entry)).slice(0, Math.max(0, total - interleaved.length))
  return [...interleaved, ...lent].map((entry) => ({ ...entry, key: gateKey(entry.item) }))
}

/** Core facts always; a shortlisted item only when Jev's probability meets its kind's cutoff. */
export function selectGatedItems(
  pool: GatePool,
  shortlist: readonly ShortlistEntry[],
  probabilities: ReadonlyMap<string, number> | null,
  cutoffs: Record<RecallItemKind, number | null>
): RecallItem[] {
  const passing = probabilities
    ? shortlist.flatMap((entry) => {
        const probability = probabilities.get(entry.key)
        const cutoff = cutoffs[entry.item.kind]
        return probability !== undefined && cutoff !== null && probability >= cutoff ? [{ entry, probability }] : []
      })
    : []
  passing.sort(
    (left, right) =>
      right.probability - left.probability ||
      right.entry.at - left.entry.at ||
      left.entry.item.kind.localeCompare(right.entry.item.kind) ||
      left.entry.item.id - right.entry.item.id
  )
  return packRecallItems(
    pool.core,
    passing.map(({ entry }) => entry.item)
  )
}
