/**
 * Picks the shape of one reply in code — its length, how it opens, how it ends and which faces fit — and
 * renders it as a short note at the end of the system prompt. Asking the model to vary these failed: Haiku
 * 5.5 copied a quoted interjection into a third of its openers and wrote two paragraphs in 98% of replies
 * whatever was said. Chosen here, the variety is real and the model only has to follow one line each.
 */
import { FACES, TONE_FACES } from './prompts/kaomoji.js'
import type { ToneKey } from './prompts/tones.js'

export type MessageWeight = 'quick' | 'ordinary' | 'rich'
export type OpenerStyle = 'content' | 'soft' | 'particle' | 'gasp' | 'comedy' | 'name'
export type Ending = 'statement' | 'question' | 'aside'

export interface ReplyShapeInput {
  userMessage: string
  tone: ToneKey
  /** This channel's recent replies from Roka, oldest first. */
  recentReplies: readonly string[]
  displayName: string
  rng?: () => number
}

export interface Opener {
  style: OpenerStyle
  /** The exact word to open with, for the styles that have one. */
  word?: string
  instruction: string
}

export interface ReplyShape {
  paragraphs: 1 | 2 | 3
  opener: Opener
  ending: Ending
  faces: string[]
  /** A line that is plainly sweet on them, or teasingly suggestive. */
  flirt: boolean
  /** She calls herself onee-san somewhere in the reply. */
  oneesan: boolean
  /** One big overreaction, then straight back to normal. */
  drama: boolean
}

const WORDS: Record<'soft' | 'particle' | 'gasp', readonly string[]> = {
  soft: ['Oh,', 'Oh?', 'Hmm,', 'Well,', 'Come on,', 'Now, now,'],
  particle: ['Ara~', 'Mou~', 'Fufu~', 'Heheh~'],
  gasp: ['Huh?', 'Wh-what!?', 'H-hey!', 'Wait,']
}

const COMEDY: readonly string[] = [
  'mock shop politeness, as if they were a difficult customer',
  'a loud comeback at what they just said',
  'a burst of melodramatic self-pity'
]

const QUIET: readonly ToneKey[] = ['sincere', 'tender', 'nostalgic']

const STYLE_OUT_OF: Record<OpenerStyle, readonly ToneKey[]> = {
  content: [],
  soft: [],
  particle: QUIET,
  gasp: [...QUIET, 'sleepy'],
  comedy: [...QUIET, 'sleepy'],
  name: QUIET
}

const PARAGRAPHS: Record<MessageWeight, ReadonlyArray<[1 | 2 | 3, number]>> = {
  quick: [
    [1, 0.65],
    [2, 0.35]
  ],
  ordinary: [
    [1, 0.15],
    [2, 0.7],
    [3, 0.15]
  ],
  rich: [
    [2, 0.35],
    [3, 0.65]
  ]
}

// Haiku flirted in 8-11% of replies where Flash Lite did in a third, on identical prompts; drawing the beat in
// code sets the same floor on any main model. Quiet moods never get one.
const FLIRT: Partial<Record<ToneKey, number>> = {
  playful: 0.55,
  flustered: 0.55,
  mischievous: 0.55,
  domestic: 0.55,
  confident: 0.55,
  annoyed: 0.4,
  competitive: 0.4,
  tender: 0.35,
  sleepy: 0.35,
  curious: 0.25
}

const ONEESAN: Partial<Record<ToneKey, number>> = {
  playful: 0.25,
  confident: 0.25,
  annoyed: 0.25,
  domestic: 0.25,
  mischievous: 0.25,
  competitive: 0.2,
  curious: 0.15
}

// Judges rated v3's drama 2.8 of 5 against Flash Lite's 3.2: one-paragraph replies left no room for a scene.
const DRAMA: Partial<Record<ToneKey, number>> = {
  flustered: 0.45,
  competitive: 0.45,
  annoyed: 0.4,
  mischievous: 0.35,
  playful: 0.3,
  confident: 0.2,
  curious: 0.2,
  domestic: 0.15
}

const ENDINGS: ReadonlyArray<[Ending, number]> = [
  ['statement', 0.55],
  ['question', 0.25],
  ['aside', 0.2]
]

const HEAVY =
  /\b(sad|tired|exhausted|stressed|lonely|cry|crying|depressed|anxious|scared|hurt|sick|miss you|love you|broke up|passed away)\b/i

/** Drops a leading "[Replying to …]" block, whose brackets nest, so only what the user wrote is weighed. */
function ownWords(message: string): string {
  let text = message.trimStart()
  if (text.startsWith('[Replying to')) {
    let depth = 0
    for (let index = 0; index < text.length; index++) {
      if (text[index] === '[') depth++
      else if (text[index] === ']' && --depth === 0) {
        text = text.slice(index + 1)
        break
      }
    }
  }
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[@#:][^>]+>/g, '')
    .trim()
}

export function messageWeight(message: string): MessageWeight {
  const text = ownWords(message)
  const words = text.split(/\s+/).filter(Boolean).length
  const asks = text.includes('?')
  if (words <= 4 || (words <= 8 && !asks)) return 'quick'
  if (words >= 40 || (HEAVY.test(text) && words >= 10) || (asks && words >= 25)) return 'rich'
  return 'ordinary'
}

function weighted<T>(options: ReadonlyArray<[T, number]>, rng: () => number): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll < 0) return value
  }
  return options[options.length - 1][0]
}

function pick<T>(options: readonly T[], rng: () => number): T {
  return options[Math.min(Math.floor(rng() * options.length), options.length - 1)]
}

function key(text: string): string {
  return text
    .replace(/^[\s*_"'>]+/, '')
    .split(/\s+/)[0]
    .replace(/[^\p{L}-]/gu, '')
    .toLowerCase()
}

function styleOf(reply: string, displayName: string): OpenerStyle {
  const first = key(reply)
  if (first && first === key(displayName)) return 'name'
  for (const style of ['soft', 'particle', 'gasp'] as const) {
    if (WORDS[style].some((word) => key(word) === first)) return style
  }
  return 'content'
}

function chooseOpener(input: ReplyShapeInput, rng: () => number): Opener {
  const recent = input.recentReplies.slice(-3)
  const usedWords = new Set(recent.map(key))
  const last = input.recentReplies.at(-1)
  const lastStyle = last === undefined ? undefined : styleOf(last, input.displayName)
  const allowed = (Object.keys(STYLE_OUT_OF) as OpenerStyle[]).filter(
    (style) => !STYLE_OUT_OF[style].includes(input.tone)
  )
  const fresh = allowed.filter((style) => style !== lastStyle)
  const style = pick(fresh.length > 0 ? fresh : allowed, rng)

  if (style === 'soft' || style === 'particle' || style === 'gasp') {
    const pool = style === 'soft' && input.tone === 'sleepy' ? [...WORDS.soft, 'Nn...'] : WORDS[style]
    const unused = pool.filter((word) => !usedWords.has(key(word)))
    const word = pick(unused.length > 0 ? unused : pool, rng)
    return { style, word, instruction: `Open with "${word}".` }
  }
  if (style === 'comedy') return { style, instruction: `Open with ${pick(COMEDY, rng)}.` }
  if (style === 'name') return { style, instruction: `Open with their name, "${input.displayName}", as the hook.` }
  return { style, instruction: 'Open straight with your reaction or answer: no interjection and no name first.' }
}

function chooseFaces(input: ReplyShapeInput, rng: () => number): string[] {
  const pool = TONE_FACES[input.tone].flatMap((group) => FACES[group])
  const recent = input.recentReplies.slice(-5).join('\n')
  const unused = pool.filter((face) => !recent.includes(face))
  const candidates = [...(unused.length >= 4 ? unused : pool)]
  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1))
    ;[candidates[index], candidates[swap]] = [candidates[swap], candidates[index]]
  }
  return candidates.slice(0, 4)
}

export function chooseReplyShape(input: ReplyShapeInput): ReplyShape {
  const rng = input.rng ?? Math.random
  const paragraphs = weighted(PARAGRAPHS[messageWeight(input.userMessage)], rng)
  const opener = chooseOpener(input, rng)
  const last = input.recentReplies.at(-1)
  const askedLast = last !== undefined && /\?[^\p{L}\p{N}?]*$/u.test(last.trim())
  const ending = weighted(
    ENDINGS.filter(([value]) => !(askedLast && value === 'question')),
    rng
  )
  const faces = chooseFaces(input, rng)
  const flirt = rng() < (FLIRT[input.tone] ?? 0)
  const oneesan = rng() < (ONEESAN[input.tone] ?? 0)
  const drama = rng() < (DRAMA[input.tone] ?? 0)
  return { paragraphs, opener, ending, faces, flirt, oneesan, drama }
}

const LENGTH: Record<1 | 2 | 3, string> = {
  1: 'one short paragraph, a few quick sentences.',
  2: 'two short paragraphs.',
  3: 'up to three short paragraphs; this one deserves the room.'
}

const END: Record<Ending, string> = {
  statement: 'on a statement, a tease or an aside, not a question.',
  question: 'with one question back to them.',
  aside: 'on a short aside in italics, like an inner thought.'
}

export function renderReplyShape(shape: ReplyShape): string {
  const lines = [
    '## Reply Shape',
    'For this reply only; it overrides the general length and opening guidance. If you look something up or watch media this turn, those rules win.',
    `- Length: ${LENGTH[shape.paragraphs]}`,
    `- Open: ${shape.opener.instruction}`,
    `- End: ${END[shape.ending]}`,
    `- Faces that fit: ${shape.faces.join(' ')}. Use one, or two when you're flustered or excited; a sincere moment may need none.`
  ]
  if (shape.flirt)
    lines.push('- Slip in one line that is plainly sweet on them or teasingly suggestive, then play it off.')
  if (shape.oneesan) lines.push('- Call yourself onee-san somewhere in this reply.')
  if (shape.drama)
    lines.push(
      '- Go big once: a dramatic overreaction (a gasp, a wail, mock outrage or a stammering avalanche), then snap straight back to normal.'
    )
  if (shape.opener.style !== 'name') lines.push('- Use their name at most once, and not as your first word.')
  return lines.join('\n')
}

export function buildReplyShapePrompt(input: ReplyShapeInput): string {
  return renderReplyShape(chooseReplyShape(input))
}
