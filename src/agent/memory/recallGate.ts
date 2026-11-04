import { createHash, randomInt } from 'node:crypto'
import { config } from '../../config.js'
import { getAllUserNames } from '../../storage/userNames.js'
import { estimateTokens } from '../../utils/tokens.js'
import { type RecallJudgmentStatus } from '../jev/recallJudgment.js'
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

/** First 8 hex of the memory text's SHA-256, so telemetry can name a text that may later change. */
export const gateTextHash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 8)

/** Per-kind counts from pool to judgment: [pool, tooLong, shortlisted, overBudget]. */
export type GateFunnel = Record<RecallItemKind, [number, number, number, number]>

export type ShortlistResult = Readonly<{ shortlist: ShortlistEntry[]; tooLong: GatePoolEntry[] }>

/** Per-kind lanes, interleaved fact → server → conversation → media; slots a lane cannot use go to the best rest. */
export function buildRecallShortlist(pool: GatePool, lanes: Record<RecallItemKind, number>): ShortlistResult {
  const names = getAllUserNames()
  const fitsAlone = (entry: GatePoolEntry): boolean =>
    estimateTokens(formatRecallBlock([entry.item], names)) <= config.memory.recallTokenBudget
  const usable: GatePoolEntry[] = []
  const tooLong: GatePoolEntry[] = []
  for (const entry of pool.entries) (fitsAlone(entry) ? usable : tooLong).push(entry)
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
  return {
    shortlist: [...interleaved, ...lent].map((entry) => ({ ...entry, key: gateKey(entry.item) })),
    tooLong
  }
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

/** Funnel counts per kind. Over-budget counts only on ok: only it names every candidate the token budget allowed. */
export function buildGateFunnel(
  pool: GatePool,
  shortlist: readonly ShortlistEntry[],
  tooLong: readonly GatePoolEntry[],
  judged: Readonly<{ status: RecallJudgmentStatus; judgedKeys: readonly string[] }>
): GateFunnel {
  const funnel: GateFunnel = {
    fact: [0, 0, 0, 0],
    server_fact: [0, 0, 0, 0],
    conversation: [0, 0, 0, 0],
    media: [0, 0, 0, 0]
  }
  for (const { item } of pool.entries) funnel[item.kind][0] += 1
  for (const { item } of tooLong) funnel[item.kind][1] += 1
  const judgedKeys = judged.status === 'ok' ? new Set(judged.judgedKeys) : null
  for (const { key, item } of shortlist) {
    funnel[item.kind][2] += 1
    if (judgedKeys !== null && !judgedKeys.has(key)) funnel[item.kind][3] += 1
  }
  return funnel
}

/** Up to 8 pool entries that fit but missed the shortlist, for labelling what it missed. Uniform, without replacement. */
export function sampleOutside(
  pool: GatePool,
  shortlist: readonly ShortlistEntry[],
  tooLong: readonly GatePoolEntry[]
): Array<[string, number, string]> {
  const shortlisted = new Set(shortlist.map(({ key }) => key))
  const oversized = new Set(tooLong.map(({ item }) => gateKey(item)))
  const remaining = pool.entries.filter(({ item }) => !oversized.has(gateKey(item)) && !shortlisted.has(gateKey(item)))
  const picked: GatePoolEntry[] = []
  while (picked.length < 8 && remaining.length > 0) {
    const [next] = remaining.splice(randomInt(remaining.length), 1)
    if (next !== undefined) picked.push(next)
  }
  return picked.map(({ item }) => [item.kind, item.id, gateTextHash(item.text)])
}
