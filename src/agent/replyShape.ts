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
  /** A line that is plainly sweet on them, or teasingly suggestive. */
  flirt: boolean
  /** She calls herself onee-san somewhere in the reply. */
  oneesan: boolean
  /** One big overreaction, then straight back to normal. */
  drama: boolean
  /** The over-the-top threat a saying-no scene is built on. */
  threat?: string
}

const WORDS: Record<'soft' | 'particle' | 'gasp', readonly string[]> = {
  soft: ['Oh,', 'Oh?', 'Hmm,', 'Well,', 'Come on,', 'Now, now,'],
  particle: ['Ara~', 'Mou~', 'Fufu~', 'Heheh~'],
  gasp: ['Huh?', 'Wh-what!?', 'H-hey!', 'Wait,']
}

const COMEDY: readonly string[] = [
  'mock innocence, all wide eyes, as if you had no idea what they meant',
  'a loud comeback at what they just said',
  'a burst of melodramatic self-pity'
]

// v4: a single example threat in the rule turned up in 98% of saying-no replies; drawn here, they rotate.
const THREATS: ReadonlyArray<[string, RegExp]> = [
  ["Dad's broom", /broom/i],
  ['no sweets for a month', /month/i],
  ['tying them to the shop sign', /\bsign\b/i],
  ['sweeping the shrine steps until spring', /shrine|steps/i],
  ['a handful of salt thrown after them', /\bsalt\b/i],
  ['peeling sweet beans until New Year', /\bbeans?\b/i],
  ['telling Koharu every embarrassing thing about them', /koharu/i],
  ['writing their name on the noren in huge letters', /noren/i],
  ['setting her mother loose on them with marriage talk', /mother|\bmom\b/i],
  ['scrubbing every tea tin with a toothbrush', /toothbrush|tea tin/i],
  ['taste-testing the bitterest yomogi mochi she has', /yomogi|bitter/i],
  ['a lifetime ban from her warabi mochi', /warabi/i]
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

function chooseOpener(input: ReplyShapeInput, rng: () => number, edge: Edge): Opener {
  const recent = input.recentReplies.slice(-3)
  const usedWords = new Set(recent.map(key))
  const last = input.recentReplies.at(-1)
  const lastStyle = last === undefined ? undefined : styleOf(last, input.displayName)
  const allowed = (Object.keys(STYLE_OUT_OF) as OpenerStyle[]).filter(
    (style) =>
      !STYLE_OUT_OF[style].includes(input.tone) && !(edge === 'hard' && (style === 'particle' || style === 'comedy'))
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

function chooseFaces(input: ReplyShapeInput, rng: () => number, edge: Edge): string[] {
  // Users echoed her faces back at her; a face they just posted is theirs, not one to copy.
  const pool = (
    edge === 'hard' ? [...FACES.furious, ...FACES.pouty] : TONE_FACES[input.tone].flatMap((group) => FACES[group])
  ).filter((face) => !input.userMessage.includes(face))
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
  const fresh = THREATS.filter(([, used]) => !used.test(recent))
  return pick(fresh.length > 0 ? fresh : THREATS, rng)[0]
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
  // The saying-no scenes carry their own drama; a hard line gets no flirting and no big-sister act.
  const flirt = edge !== 'hard' && rng() < (FLIRT[input.tone] ?? 0)
  const oneesan = edge !== 'hard' && rng() < (ONEESAN[input.tone] ?? 0)
  const drama = edge === 'none' && rng() < (DRAMA[input.tone] ?? 0)
  const threat = edge === 'none' ? undefined : chooseThreat(input.recentReplies, rng)
  return { paragraphs, edge, opener, ending, faces, flirt, oneesan, drama, threat }
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
    'For this reply only; it overrides the general length and opening guidance.',
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
  if (shape.edge === 'lewd')
    lines.push(
      `- This one is lewd bait. Play the flustered scene: a stammer or a gasp, mock outrage and an over-the-top threat built on ${shape.threat}, then dodge it or tease them right back. Keep it suggestive, never explicit, and never announce that you won't answer, explain a rule or lecture.`
    )
  if (shape.edge === 'hard')
    lines.push(
      `- This one crosses a hard line. Refuse it, but as Roka: one burst of real outrage in your own voice, a gasp or a furious scolding and an over-the-top threat built on ${shape.threat}, then move on. Never repeat or describe what they said, never lecture or explain rules, and don't reuse a closing line from your earlier replies.`
    )
  if (shape.opener.style !== 'name') lines.push('- Use their name at most once, and not as your first word.')
  return lines.join('\n')
}

export function buildReplyShapePrompt(input: ReplyShapeInput): string {
  return renderReplyShape(chooseReplyShape(input))
}
