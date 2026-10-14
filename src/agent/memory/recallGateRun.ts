import { createHash, randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { recordJevEvent } from '../../storage/jevEventStore.js'
import { getLocalDate } from '../../utils/timezone.js'
import { RECALL_RUBRIC_VERSION, type RecallJudgmentStatus, judgeRecallCandidates } from '../jev/recallJudgment.js'
import { type RecallInput, type RecallItem, recallGatePool } from './recall.js'
import { buildRecallShortlist, gateKey, selectGatedItems } from './recallGate.js'

export type GateDetail = Readonly<{
  v: 1
  rubric: string
  ref: string
  status: RecallJudgmentStatus
  latencyMs: number
  inputTokens: number
  usageUnknown: boolean
  shortlist: Array<[string, number, number | null]>
  core: Array<[string, number]>
  selected: Array<[string, number]>
  settledAtMs: number
  messageHash: string
}>

const ATTEMPTED: ReadonlySet<RecallJudgmentStatus> = new Set(['ok', 'deadline', 'error', 'invalid'])
const round = (value: number): number => Number(value.toFixed(3))

export async function runRecallGate(args: {
  input: RecallInput
  speakerName: string
  recentLines: readonly string[]
  nameOf: (userId: string) => string
  deadlineAt: number
  mode: 'shadow' | 'unified'
  channelId: string
  guildId: string
}): Promise<{ items: RecallItem[]; detail: GateDetail }> {
  const pool = recallGatePool(args.input)
  const shortlist = buildRecallShortlist(pool, config.memory.recallGateShortlist)
  const judged = await judgeRecallCandidates(
    {
      speakerId: args.input.speakerId,
      speakerName: args.speakerName,
      message: args.input.message,
      recentLines: args.recentLines,
      date: getLocalDate(args.input.now ?? Date.now()),
      shortlist,
      nameOf: args.nameOf
    },
    { timeoutMs: Math.floor(args.deadlineAt - performance.now()) }
  )
  const items = selectGatedItems(pool, shortlist, judged.probabilities, config.memory.recallGateMinNoul)
  const ref = randomUUID().slice(0, 8)
  const coreKeys = new Set(pool.core.map(gateKey))
  if (ATTEMPTED.has(judged.status)) {
    recordJevEvent({
      kind: 'recall',
      guildId: args.guildId,
      channelId: args.channelId,
      question: `recall:${RECALL_RUBRIC_VERSION}:${ref}`,
      answer: JSON.stringify({
        status: judged.status,
        decisions: judged.judgedKeys.map((key) => [key, round(judged.probabilities?.get(key) ?? Number.NaN)]),
        usage_unknown: judged.usageUnknown
      }),
      probability: null,
      confidence: null,
      applied: args.mode === 'unified' && items.some((item) => !coreKeys.has(gateKey(item))),
      latencyMs: Math.round(judged.latencyMs),
      inputTokens: judged.inputTokens
    })
  }
  return {
    items,
    detail: {
      v: 1,
      rubric: RECALL_RUBRIC_VERSION,
      ref,
      status: judged.status,
      latencyMs: Math.round(judged.latencyMs),
      inputTokens: judged.inputTokens,
      usageUnknown: judged.usageUnknown,
      shortlist: shortlist.map(({ key, item }) => {
        const probability = judged.probabilities?.get(key)
        return [item.kind, item.id, probability === undefined ? null : round(probability)]
      }),
      core: pool.core.map((item) => [item.kind, item.id]),
      selected: items.map((item) => [item.kind, item.id]),
      settledAtMs: performance.now(),
      messageHash: createHash('sha256').update(args.input.message).digest('hex').slice(0, 16)
    }
  }
}
