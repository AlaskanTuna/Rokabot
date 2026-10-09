import '../env.js'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExtractionOp } from '../../../src/agent/memory/extractionSchema.js'
import { extractEpisode } from '../../../src/agent/memory/extractor.js'
import { assertClaim } from '../../../src/agent/memory/memoryClaims.js'
import { closeDb } from '../../../src/storage/database.js'
import type { ExtractionEpisode } from '../../../src/storage/extractionQueue.js'

// Spends real Gemini calls (12 per run) on synthetic text only. Needs ROKABOT_HARNESS_LIVE=1 so tests/harness/env.ts
// swaps in GRAPHIFY_GEMINI_API_KEY, never the bot's own key; `npm run test:live` sets it.
const live = process.env.ROKABOT_HARNESS_LIVE === '1' && Boolean(process.env.GRAPHIFY_GEMINI_API_KEY)

const CHANNEL = 'live-channel'
const ALICE = 'alice-id'
const RUNS = 2
const MAX_OUTPUT_TOKENS = 700

type Want = { op: 'add' | 'retract'; predicate?: string; value: RegExp; tense?: 'current' | 'past' }

function has(ops: readonly ExtractionOp[], want: Want): boolean {
  return ops.some(
    (op) =>
      op.op === want.op &&
      'subject' in op &&
      op.subject.kind === 'user' &&
      'predicate' in op &&
      (!want.predicate || op.predicate === want.predicate) &&
      want.value.test(op.value) &&
      (!want.tense || ('tense' in op && op.tense === want.tense))
  )
}

type Case = {
  name: string
  text: string
  seed?: { predicate: string; value: string }
  check: (ops: readonly ExtractionOp[]) => boolean
}

const CASES: ReadonlyArray<Case> = [
  {
    name: 'a new job and a quit one: current teacher, nurse retracted or past',
    text: "I'm a teacher now, quit nursing last year",
    check: (ops) =>
      has(ops, { op: 'add', predicate: 'general_occupation', value: /teach/i, tense: 'current' }) &&
      (has(ops, { op: 'retract', predicate: 'general_occupation', value: /nurs/i }) ||
        has(ops, { op: 'add', predicate: 'general_occupation', value: /nurs/i, tense: 'past' }))
  },
  {
    name: 'a past-only mention is past and adds no current job',
    text: 'back when I was a nurse we worked nights',
    check: (ops) =>
      has(ops, { op: 'add', predicate: 'general_occupation', value: /nurs/i, tense: 'past' }) &&
      !has(ops, { op: 'add', predicate: 'general_occupation', value: /./, tense: 'current' })
  },
  {
    name: 'a quit with no fact in the prompt is a retract of the hobby',
    text: 'I quit chess',
    check: (ops) => has(ops, { op: 'retract', predicate: 'hobby', value: /chess/i })
  },
  {
    name: 'a switch is a retract of the old value plus a current add of the new one',
    text: 'switched from chess to go',
    check: (ops) =>
      has(ops, { op: 'retract', value: /chess/i }) && has(ops, { op: 'add', value: /\bgo\b/i, tense: 'current' })
  },
  {
    name: 'a quit of a listed fact retracts it under its listed predicate',
    text: 'I quit chess',
    seed: { predicate: 'favorite_game', value: 'chess' },
    check: (ops) => has(ops, { op: 'retract', predicate: 'favorite_game', value: /chess/i })
  },
  {
    name: 'an everyday activity is a hobby, not misc',
    text: 'I draw on weekends',
    check: (ops) =>
      has(ops, { op: 'add', predicate: 'hobby', value: /draw/i }) &&
      !has(ops, { op: 'add', predicate: 'misc', value: /./ })
  }
]

function episodeOf(text: string): ExtractionEpisode {
  const timestamp = Date.UTC(2026, 9, 9, 6, 0, 0)
  return {
    messages: [{ messageId: 'm1', userId: ALICE, displayName: 'Alice', content: text, timestamp, isBot: false }],
    context: [],
    startedAt: timestamp,
    endedAt: timestamp
  }
}

function describeOp(op: ExtractionOp): string {
  if (op.op === 'noop') return 'noop'
  const tense = 'tense' in op ? ` ${op.tense}` : ''
  return `${op.op} ${op.predicate}=${op.value}${tense}`
}

type Usage = { finishReason?: string; output: number; thoughts: number }
const usage: Usage[] = []

describe.skipIf(!live)('correct-facts extraction (live)', () => {
  beforeAll(() => {
    const realFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await realFetch(input, init)
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        candidates?: Array<{ finishReason?: string }>
        usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number }
      } | null
      if (body?.usageMetadata) {
        usage.push({
          finishReason: body.candidates?.[0]?.finishReason,
          output: body.usageMetadata.candidatesTokenCount ?? 0,
          thoughts: body.usageMetadata.thoughtsTokenCount ?? 0
        })
      }
      return response
    })
  })

  afterAll(() => {
    vi.restoreAllMocks()
    const peak = Math.max(0, ...usage.map(({ output, thoughts }) => output + thoughts))
    console.info(
      'Correct-facts live output tokens',
      JSON.stringify({ calls: usage.length, peak, limit: MAX_OUTPUT_TOKENS, usage })
    )
    closeDb()
  })

  it.each(CASES)(
    '$name',
    async ({ name, text, seed, check }) => {
      const guildId = `live-guild-${CASES.findIndex((entry) => entry.name === name)}`
      if (seed) assertClaim({ guildId, subjectUserId: ALICE, sourceKind: 'passive', channelId: CHANNEL, ...seed })

      const runs: Array<{ pass: boolean; ops: string[] }> = []
      for (let run = 0; run < RUNS; run++) {
        const { ops } = await extractEpisode({ guildId, channelId: CHANNEL, episode: episodeOf(text) })
        runs.push({ pass: check(ops), ops: ops.map(describeOp) })
      }
      console.info('Correct-facts live results', JSON.stringify({ text, runs }))

      expect(
        runs.some(({ pass }) => pass),
        `"${text}" failed every run: ${JSON.stringify(runs)}`
      ).toBe(true)
    },
    60_000
  )
})
