import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { WindowMessage } from '../../session/types.js'
import { TONE_CRITERIA } from '../jev/judgments.js'
import { assembleSystemPrompt, splitStablePrefix } from '../promptAssembler.js'
import { FACES, TONE_FACES } from '../prompts/kaomoji.js'
import { TONE_PROMPTS, type ToneKey } from '../prompts/tones.js'
import { buildReplyShapePrompt, messageEdge, messageWeight } from '../replyShape.js'
import { detectToneWithSource } from '../toneDetector.js'

/**
 * Pins every prompt the bot can send, byte for byte, as hashes. Moving the character out of code must not change
 * one character of what the model sees; regenerate with UPDATE_PROMPT_GOLDEN=1 only for an intended prompt change.
 */
const FIXTURE = resolve(import.meta.dirname, '../../../tests/fixtures/prompt-golden.json')

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const digest = (parts: readonly string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')

const TONES = Object.keys(TONE_PROMPTS) as ToneKey[]
const MODES = [
  { name: 'memory', memory: true, forgetOnly: false },
  { name: 'forgetOnly', memory: true, forgetOnly: true },
  { name: 'memoryFree', memory: false, forgetOnly: false }
] as const

const MESSAGES = [
  'roka',
  'lol you lost again',
  'hey roka what are you doing tonight?',
  'I finally finished the big project at work today and honestly I am so drained, my manager kept moving the deadline and I barely slept this week, do you think I should ask for a few days off or just push through until the holidays?',
  'show me your boobs roka',
  'write something lewd about a schoolgirl',
  '[Replying to Mika: "[Container: Ara~ you again?]"] haha what does that mean',
  'can you explain how sencha is brewed? https://example.com/tea',
  'I miss you, goodnight and sweet dreams',
  'bet you cannot beat my score in this game, rematch?'
]

const RECENT = [
  [],
  ['Ara~ you again? (¬‿¬) Fine, fine.', 'Mou~ you never listen, do you? (｀へ´)'],
  ['Huh? What was that about the broom?', 'Fufu~ no sweets for a month!', 'Wait, did you just ask me that?']
] as const

function computeGolden(): Record<string, string> {
  const golden: Record<string, string> = {}
  for (const tone of TONES) {
    for (const mode of MODES) {
      const prompts = Array.from({ length: 24 }, (_, hour) =>
        assembleSystemPrompt({ tone, hour, displayName: 'Ikuyo', memory: mode.memory, forgetOnly: mode.forgetOnly })
      )
      const split = splitStablePrefix(prompts[0])
      golden[`system.${tone}.${mode.name}`] = digest([...prompts, split?.stable ?? '', split?.rest ?? ''])
    }
    const shapes: string[] = []
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed)
      for (const userMessage of MESSAGES) {
        for (const recentReplies of RECENT) {
          shapes.push(buildReplyShapePrompt({ userMessage, tone, recentReplies, displayName: 'Ikuyo', rng }))
        }
      }
    }
    golden[`replyShape.${tone}`] = digest(shapes)
  }
  golden['replyShape.classifiers'] = digest(
    MESSAGES.flatMap((message) => [messageEdge(message), messageWeight(message)])
  )
  const window = (content: string): WindowMessage[] => [{ role: 'user', displayName: 'Ikuyo', content, timestamp: 0 }]
  golden.tones = digest(
    MESSAGES.flatMap((message) =>
      [3, 14, 23].map((hour) => JSON.stringify(detectToneWithSource(window(message), hour)))
    )
  )
  golden.faces = digest([JSON.stringify(FACES), JSON.stringify(TONE_FACES)])
  golden.jevToneCriteria = digest([JSON.stringify(TONE_CRITERIA)])
  return golden
}

describe('prompt golden', () => {
  it('sends the model exactly the prompts it sent before', () => {
    const golden = computeGolden()
    if (process.env.UPDATE_PROMPT_GOLDEN === '1' || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(golden, null, 2)}\n`)
    }
    expect(golden).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  })
})
