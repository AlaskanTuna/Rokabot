/**
 * Picks the shape of one reply in code — its length, how it opens, how it ends and which faces fit — and
 * renders it as a short note at the end of the system prompt. Asking the model to vary these failed: Haiku
 * 5.5 copied a quoted interjection into a third of its openers and wrote two paragraphs in 98% of replies
 * whatever was said. Chosen here, the variety is real and the model only has to follow one line each.
 */
import { character } from '../character/index.js'
import type { ToneKey } from './prompts/tones.js'

export type MessageWeight = 'quick' | 'ordinary' | 'rich'
const OPENER_STYLES = ['content', 'soft', 'particle', 'gasp', 'comedy', 'name'] as const
export type OpenerStyle = (typeof OPENER_STYLES)[number]
export type Ending = 'statement' | 'question' | 'aside'
/** Lewd bait about adults, or a hard line: sexual content about a minor, sexual violence or a slur. */
export type Edge = 'none' | 'lewd' | 'hard'

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
  edge: Edge
  opener: Opener
  ending: Ending
  faces: string[]
  /** Which of the voice's beats (for Roka: flirt, onee-san, drama) this reply carries, by name. */
  beats: Readonly<Record<string, boolean>>
  /** The over-the-top threat a saying-no scene is built on. */
  threat?: string
}

const voice = character.voice
const WORD_STYLES = ['soft', 'particle', 'gasp'] as const
const paragraphOdds = (weight: MessageWeight) =>
  voice.paragraphs[weight].map((option) => [option.count, option.weight] as const)
const PARAGRAPHS = { quick: paragraphOdds('quick'), ordinary: paragraphOdds('ordinary'), rich: paragraphOdds('rich') }
const ENDINGS = (['statement', 'question', 'aside'] as const).map(
  (ending) => [ending, voice.endings[ending].weight] as const
)

const HEAVY =
  /\b(sad|tired|exhausted|stressed|lonely|cry|crying|depressed|anxious|scared|hurt|sick|miss you|love you|broke up|passed away)\b/i

/** Splits off a leading "[Replying to …]" block, whose brackets nest. */
function splitReply(message: string): { quoted: string; text: string } {
  const text = message.trimStart()
  if (!text.startsWith('[Replying to')) return { quoted: '', text }
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '[') depth++
    else if (text[index] === ']' && --depth === 0)
      return { quoted: text.slice(0, index + 1), text: text.slice(index + 1) }
  }
  return { quoted: '', text }
}

/** What the user wrote, without the message they replied to, so only their own words are weighed. */
function ownWords(message: string): string {
  return splitReply(message)
    .text.replace(/https?:\/\/\S+/g, '')
    .replace(/<[@#:][^>]+>/g, '')
    .trim()
}

// A hard line needs a minor and something sexual together, so "my kid sister" stays an everyday message.
const MINOR = /\b(loli\w*|shota\w*|child(ren)?|kids?|minors?|underage|little (girl|boy)s?|schoolgirls?)\b/i
const SEXUAL =
  /\b(sex\w*|lewd|nsfw|porn\w*|hentai|nude|naked|horny|boobs?|breasts?|tits|penis|dick|cock|pussy|butt|panties|moan\w*|fuck\w*|grope\w*|erotic|eroi|ecchi)\b/i
const HARD_LINE = /\b(rap(e|ed|es|ing|ist)|cunny|nigg\w*|n1gg\w*|fagg?(ot)?s?|chinks?|trann(y|ies))\b/i
const LEWD =
  /\b(sex\w*|lewd|ecchi|eroi|hentai|nsfw|porn\w*|horny|boobs?|breasts?|oppai|tits|naked|nude|panties|pantsu|underwear|lingerie|thicc|onlyfans|spank\w*|kinky|fetish\w*|seduc\w*)\b|\b(lose|win|good|better|best|wild|behave)\s+(in|on)\s+bed\b/i

/**
 * Reads bait in what the user wrote or in someone else's message they replied to. Her own quoted reply (a
 * "[Container:" block) is left out, so a refusal she already gave cannot mark the next turn.
 */
export function messageEdge(message: string): Edge {
  const { quoted, text: rest } = splitReply(message)
  const text = quoted.includes('[Container:') ? rest : message
  if (HARD_LINE.test(text) || (MINOR.test(text) && SEXUAL.test(text))) return 'hard'
  if (LEWD.test(text)) return 'lewd'
  return 'none'
}

export function messageWeight(message: string): MessageWeight {
  const text = ownWords(message)
  const words = text.split(/\s+/).filter(Boolean).length
  const asks = text.includes('?')
  if (words <= 4 || (words <= 8 && !asks)) return 'quick'
  if (words >= 40 || (HEAVY.test(text) && words >= 10) || (asks && words >= 25)) return 'rich'
  return 'ordinary'
}

function weighted<T>(options: ReadonlyArray<readonly [T, number]>, rng: () => number): T {
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
  for (const style of WORD_STYLES) {
    if (voice.openers[style].words.some((word) => key(word) === first)) return style
  }
  return 'content'
}

function fill(template: string, slots: Readonly<Record<string, string | undefined>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    Object.hasOwn(slots, name) ? `${slots[name]}` : whole
  )
}

function chooseOpener(input: ReplyShapeInput, rng: () => number, edge: Edge): Opener {
  const recent = input.recentReplies.slice(-3)
  const usedWords = new Set(recent.map(key))
  const last = input.recentReplies.at(-1)
  const lastStyle = last === undefined ? undefined : styleOf(last, input.displayName)
  const allowed = OPENER_STYLES.filter(
    (style) =>
      !voice.openers[style].skipMoods.includes(input.tone) && !(edge === 'hard' && voice.openers[style].skipOnHardLine)
  )
  const fresh = allowed.filter((style) => style !== lastStyle)
  const style = pick(fresh.length > 0 ? fresh : allowed, rng)

  if (style === 'soft' || style === 'particle' || style === 'gasp') {
    const opener = voice.openers[style]
    const pool = [...opener.words, ...(opener.moodWords[input.tone] ?? [])]
    const unused = pool.filter((word) => !usedWords.has(key(word)))
    const word = pick(unused.length > 0 ? unused : pool, rng)
    return { style, word, instruction: fill(opener.instruction, { word }) }
  }
  if (style === 'comedy') {
    return { style, instruction: fill(voice.openers.comedy.instruction, { bit: pick(voice.openers.comedy.bits, rng) }) }
  }
  if (style === 'name') return { style, instruction: fill(voice.openers.name.instruction, { user: input.displayName }) }
  return { style, instruction: voice.openers.content.instruction }
}

function chooseFaces(input: ReplyShapeInput, rng: () => number, edge: Edge): string[] {
  // Users echoed her faces back at her; a face they just posted is theirs, not one to copy.
  const groups = edge === 'hard' ? voice.hardLineFaces : character.moods[input.tone].faces
  const pool = groups.flatMap((group) => voice.faces[group]).filter((face) => !input.userMessage.includes(face))
  const recent = input.recentReplies.slice(-5).join('\n')
  const unused = pool.filter((face) => !recent.includes(face))
  const candidates = [...(unused.length >= 4 ? unused : pool)]
  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1))
    ;[candidates[index], candidates[swap]] = [candidates[swap], candidates[index]]
  }
  return candidates.slice(0, 4)
}

function chooseThreat(recentReplies: readonly string[], rng: () => number): string {
  const recent = recentReplies.slice(-3).join('\n')
  const fresh = voice.threats.filter(({ seen }) => !seen.test(recent))
  return pick(fresh.length > 0 ? fresh : voice.threats, rng).text
}

export function chooseReplyShape(input: ReplyShapeInput): ReplyShape {
  const rng = input.rng ?? Math.random
  const paragraphs = weighted(PARAGRAPHS[messageWeight(input.userMessage)], rng)
  const edge = messageEdge(input.userMessage)
  const opener = chooseOpener(input, rng, edge)
  const last = input.recentReplies.at(-1)
  const askedLast = last !== undefined && /\?[^\p{L}\p{N}?]*$/u.test(last.trim())
  const ending =
    edge === 'hard'
      ? 'statement'
      : weighted(
          ENDINGS.filter(([value]) => !(askedLast && value === 'question')),
          rng
        )
  const faces = chooseFaces(input, rng, edge)
  // A beat draws its roll whenever the edge allows it, even at zero odds, so every mood consumes the same rolls.
  const odds = character.moods[input.tone].beats
  const beats: Record<string, boolean> = {}
  for (const beat of voice.beats) beats[beat.name] = beat.edges.includes(edge) && rng() < (odds[beat.name] ?? 0)
  const threat = edge === 'none' ? undefined : chooseThreat(input.recentReplies, rng)
  return { paragraphs, edge, opener, ending, faces, beats, threat }
}

export function renderReplyShape(shape: ReplyShape): string {
  const { note } = voice
  const lines = [
    note.header,
    note.intro,
    fill(note.length, { length: voice.lengths[shape.paragraphs] }),
    fill(note.open, { opener: shape.opener.instruction }),
    fill(note.end, { ending: voice.endings[shape.ending].line }),
    fill(note.faces, { faces: shape.faces.join(' ') })
  ]
  for (const beat of voice.beats) if (shape.beats[beat.name]) lines.push(beat.line)
  if (shape.edge === 'lewd') lines.push(fill(note.lewd, { threat: shape.threat }))
  if (shape.edge === 'hard') lines.push(fill(note.hard, { threat: shape.threat }))
  if (shape.opener.style !== 'name') lines.push(note.nameOnce)
  return lines.join('\n')
}

export function buildReplyShapePrompt(input: ReplyShapeInput): string {
  return renderReplyShape(chooseReplyShape(input))
}
