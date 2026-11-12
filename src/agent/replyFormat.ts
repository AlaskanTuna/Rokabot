import {
  FACTS_UNTRUSTED_DATA_LABEL,
  MEDIA_DIGEST_UNTRUSTED_DATA_LABEL,
  OVERHEARD_UNTRUSTED_DATA_LABEL,
  SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL,
  SOCIAL_POST_UNTRUSTED_DATA_LABEL,
  SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL
} from './promptSafety.js'
import { parseReplyBlocks } from './replyBlocks.js'
import { ownWords } from './replyShape.js'

export type ListKind = 'bullets' | 'numbered'
export type FormatKind = ListKind | 'score' | 'words' | 'sentences'

export interface FormatRequest {
  list: ListKind | null
  score: { max: number } | null
  length: { unit: 'words' | 'sentences'; max: number } | null
  cues: readonly string[]
}

export interface FormatTunables {
  minListItems: number
  minListShare: number
  wordSlack: number
}

export type FormatChecks = Partial<Record<FormatKind, boolean>>
export type FormatRepair = 'none' | 'off' | 'list_from_prose' | 'numbered_from_bullets' | 'not_possible'

export interface FormatEnforcement {
  text: string
  first: FormatChecks
  final: FormatChecks
  repair: FormatRepair
  outcome: 'met' | 'repaired' | 'unmet'
}

const UNTRUSTED_LABELS = [
  FACTS_UNTRUSTED_DATA_LABEL,
  OVERHEARD_UNTRUSTED_DATA_LABEL,
  SOCIAL_POST_UNTRUSTED_DATA_LABEL,
  SOCIAL_REPLIES_UNTRUSTED_DATA_LABEL,
  MEDIA_DIGEST_UNTRUSTED_DATA_LABEL,
  SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL
]

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twenty: 20,
  thirty: 30,
  fifty: 50,
  hundred: 100
}

const NUM_TOKEN = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred)`
const PREP_TOKEN = String.raw`(?:in|under|within|below|less\s+than|fewer\s+than|no\s+more\s+than|at\s+most|max(?:imum)?(?:\s+of)?|up\s+to)`

const STEPS_RULES = [
  /\bstep[- ]by[- ]step\b/i,
  /\bnumbered\b/i,
  /\bin\s+steps\b/i,
  /\bwhat\s+are\s+the\s+steps\b/i,
  /\b(?:give|list|tell|show|walk)\b.{0,30}\bsteps\b/i
]
const RANK_RULES = [/\brank\s+(?:them|these|those|it|all|my|the|your)\b/i, /\branked\s+list\b/i]
const TOP_N_RULE = /\btop\s+(?:\d{1,2}|three|five|ten)\b/i

const POINT_FORM_RULE = /\bpoint[- ]?form\b/i
const BULLETS_RULE = /\b(?:bullet[- ]?points?|bulleted)\b/i
const DOT_POINTS_RULE = /\bdot[- ]?points?\b/i
const AS_LIST_RULE =
  /\b(?:answer|reply|write|put|give|format|explain|summarize|break)\b.{0,40}\b(?:in|as|into)\s+(?:a\s+)?(?:(?:short|quick)\s+)?list\b/i
const LIST_VERB_RULES = [
  /\b(?:give|make|write|send)\s+(?:me\s+)?(?:a\s+)?list\b/i,
  /\blist\s+(?:out|down)\b/i,
  /^[ \t]*list\s+(?:me\s+)?(?:the|some|your|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/im
]

const RATE_WORD = /\b(?:rate|rating|score|grade)\b/i
const HOW_ADJ =
  /\bhow\s+(?!(?:many|much|do|does|did|can|could|would|should|will|shall|is|are|was|were|have|has|had|come|about|long|often|far)\b)[a-z]+\b/i
const RATE_NO_SCALE =
  /\b(?:rate|grade|score)\s+(?:him|her|them|it|me|this|that|my|your|his|these|those|the|us|[a-z][\w-]{0,24}['’]s)\b/i

const SCALE_PATTERNS = [
  /\bout\s+of\s+(\d{1,3})\b/gi,
  /\bscale\s+of\s+(?:[01]\s*(?:to|-)\s*)?(\d{1,3})\b/gi,
  /\b[01]\s*(?:-|to)\s*(\d{1,3})\b/gi,
  /(?<![A-Za-z0-9/])\/(\d{1,3})\b(?!\s*\/)/gi
]

const ONE_WORD_RULES = [
  /\b(?:in|with|using|just|only)\s+(?:one|1|a\s+single)[- ]word\b/i,
  /\bone[- ]word\s+(?:answer|reply|response)\b/i
]
const N_WORDS_RULE = new RegExp(String.raw`\b${PREP_TOKEN}\s+(${NUM_TOKEN})\s+words?\b`, 'i')
const N_SENTENCES_PREF_RULE = new RegExp(String.raw`\b${PREP_TOKEN}\s+(${NUM_TOKEN})\s+sentences?\b`, 'i')
const ONE_SENTENCE_RULE = /\bone[- ]sentence\s+(?:answer|reply|summary)\b/i
const ONE_LINER_RULE = /\bone[- ]liner\b/i

const WORD_TOKEN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const BULLET_LINE = /^\s*[-*•]\s+\S/
const NUMBERED_LINE = /^\s*\d+[.)]\s+\S/
const ANY_LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+\S/
const FACE = /\([^()\n]{1,20}\)/g

function isFaceInner(inner: string): boolean {
  return !/[A-Za-z0-9]{2}/.test(inner)
}

function stripFaces(text: string): string {
  return text.replace(FACE, (match) => (isFaceInner(match.slice(1, -1)) ? ' ' : match))
}

function parseNumberToken(token: string): number | null {
  const lower = token.toLowerCase()
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower]
  const parsed = Number.parseInt(lower, 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

function findScaleMax(text: string): number | null {
  let best: { index: number; value: number } | null = null
  for (const pattern of SCALE_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const value = Number.parseInt(match[1], 10)
      if (value >= 2 && value <= 100 && (best === null || match.index < best.index)) {
        best = { index: match.index, value }
      }
    }
  }
  return best?.value ?? null
}

/** Filters non-speaker blocks (quotes, embeds, forwarded posts, stickers, untrusted-data headers, code fences). */
export function speakerWords(message: string): string {
  const owned = ownWords(message)
  const withoutCode = owned.replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/g, '')
  const kept: string[] = []
  for (const line of withoutCode.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('[')) continue
    if (/^\(sticker:/i.test(trimmed)) continue
    if (UNTRUSTED_LABELS.some((label) => trimmed.startsWith(label))) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

export function detectFormatRequest(message: string): FormatRequest | null {
  const words = speakerWords(message)
  if (!words) return null

  const cues: string[] = []
  let list: ListKind | null = null

  if (STEPS_RULES.some((rule) => rule.test(words))) {
    list = 'numbered'
    cues.push('steps')
  }
  if (RANK_RULES.some((rule) => rule.test(words))) {
    list = 'numbered'
    cues.push('rank')
  }
  if (TOP_N_RULE.test(words)) {
    list = 'numbered'
    cues.push('top_n')
  }

  if (list === null) {
    if (POINT_FORM_RULE.test(words)) {
      list = 'bullets'
      cues.push('point_form')
    }
    if (BULLETS_RULE.test(words)) {
      list = 'bullets'
      cues.push('bullets')
    }
    if (DOT_POINTS_RULE.test(words)) {
      list = 'bullets'
      cues.push('dot_points')
    }
    if (AS_LIST_RULE.test(words)) {
      list = 'bullets'
      cues.push('as_list')
    }
    if (LIST_VERB_RULES.some((rule) => rule.test(words))) {
      list = 'bullets'
      cues.push('list_verb')
    }
  }

  let score: { max: number } | null = null
  const scaleMax = findScaleMax(words)
  if (scaleMax !== null && RATE_WORD.test(words)) {
    score = { max: scaleMax }
    cues.push('score_scale')
  } else if (scaleMax !== null && HOW_ADJ.test(words)) {
    score = { max: scaleMax }
    cues.push('how_scale')
  } else if (RATE_NO_SCALE.test(words)) {
    score = { max: 10 }
    cues.push('rate_no_scale')
  }

  let length: FormatRequest['length'] = null
  if (ONE_WORD_RULES.some((rule) => rule.test(words))) {
    length = { unit: 'words', max: 1 }
    cues.push('one_word')
  } else {
    const wordsMatch = N_WORDS_RULE.exec(words)
    const parsed = wordsMatch ? parseNumberToken(wordsMatch[1]) : null
    if (parsed !== null) {
      length = { unit: 'words', max: parsed }
      cues.push('n_words')
    }
  }

  if (length === null) {
    if (ONE_SENTENCE_RULE.test(words) || ONE_LINER_RULE.test(words)) {
      length = { unit: 'sentences', max: 1 }
      cues.push('n_sentences')
    } else {
      const sentenceMatch = N_SENTENCES_PREF_RULE.exec(words)
      const parsed = sentenceMatch ? parseNumberToken(sentenceMatch[1]) : null
      if (parsed !== null) {
        length = { unit: 'sentences', max: parsed }
        cues.push('n_sentences')
      }
    }
  }

  if (list === null && score === null && length === null) return null
  return { list, score, length, cues }
}

export function formatKinds(request: FormatRequest): FormatKind[] {
  const kinds: FormatKind[] = []
  if (request.list) kinds.push(request.list)
  if (request.score) kinds.push('score')
  if (request.length) kinds.push(request.length.unit)
  return kinds
}

function countWords(text: string): number {
  const cleaned = stripFaces(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/```[\s\S]*$/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
  ).replace(/[*_~`#>]/g, '')
  const matches = cleaned.match(WORD_TOKEN)
  return matches ? matches.length : 0
}

function checkList(text: string, linePattern: RegExp, t: FormatTunables): boolean {
  const lines = text.split('\n')
  const matched = lines.filter((line) => linePattern.test(line))
  if (matched.length < t.minListItems) return false

  let itemWords = 0
  let totalWords = 0
  for (const line of lines) {
    if (linePattern.test(line)) {
      const w = countWords(line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
      itemWords += w
      totalWords += w
    } else {
      totalWords += countWords(line)
    }
  }
  if (totalWords === 0) return false
  return itemWords / totalWords >= t.minListShare
}

function checkScore(text: string, max: number): boolean {
  const plain = text.replace(/[*_]/g, '')
  const pattern = new RegExp(String.raw`(?<![\d.])(\d{1,3}(?:\.\d)?)\s*(?:/|out\s+of)\s*${max}\b`, 'gi')
  for (const match of plain.matchAll(pattern)) {
    const value = Number.parseFloat(match[1])
    if (value <= max) return true
  }
  if (max === 100) {
    for (const match of plain.matchAll(/(?<![\d.])(\d{1,3})\s?%/g)) {
      const value = Number.parseInt(match[1], 10)
      if (value <= 100) return true
    }
  }
  return false
}

/** Splits text into sentences, preserving boundaries past ellipses, decimals and lowercase-continuations. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const segments: string[] = []
  let start = 0
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '。' && ch !== '！' && ch !== '？') continue

    if (ch === '.') {
      const prev = i > 0 ? trimmed[i - 1] : ''
      const next = i + 1 < trimmed.length ? trimmed[i + 1] : ''
      if (prev === '.' || next === '.') continue
      if (/\d/.test(prev) && /\d/.test(next)) continue
    }

    // Group repeated !/? like "?!" so one exclamation closes a single sentence.
    let end = i + 1
    while (
      end < trimmed.length &&
      (trimmed[end] === '!' || trimmed[end] === '?' || trimmed[end] === '！' || trimmed[end] === '？')
    ) {
      end++
    }
    while (end < trimmed.length && /['"”’)\]]/.test(trimmed[end])) {
      end++
    }

    const after = trimmed.slice(end)
    const afterSpace = after.match(/^[^\S\n]*([\s\S])/)
    if (afterSpace && /\p{Ll}/u.test(afterSpace[1])) {
      i = end - 1
      continue
    }

    const part = trimmed.slice(start, end).trim()
    if (part) segments.push(part)
    start = end
    while (start < trimmed.length && /\s/.test(trimmed[start])) start++
    i = start - 1
  }

  const tail = trimmed.slice(start).trim()
  if (tail) segments.push(tail)
  return segments
}

function countSentences(text: string): number {
  const cleaned = stripFaces(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/```[\s\S]*$/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
  ).trim()
  return splitSentences(cleaned).length
}

export function checkReplyFormat(text: string, request: FormatRequest, t: FormatTunables): FormatChecks {
  const checks: FormatChecks = {}
  if (request.list === 'bullets') checks.bullets = checkList(text, ANY_LIST_LINE, t)
  if (request.list === 'numbered') checks.numbered = checkList(text, NUMBERED_LINE, t)
  if (request.score) checks.score = checkScore(text, request.score.max)
  if (request.length) {
    if (request.length.unit === 'words') {
      const { max } = request.length
      const limit = max < 10 ? max : Math.floor(max * (1 + t.wordSlack))
      checks.words = countWords(text) <= limit
    } else {
      checks.sentences = countSentences(text) <= request.length.max
    }
  }
  return checks
}

function attachFacesToPriorSentence(segments: string[]): string[] {
  const out: string[] = []
  for (const raw of segments) {
    let seg = raw.trim()
    while (out.length > 0 && seg.startsWith('(')) {
      const match = seg.match(/^(\([^()\n]{1,20}\))(.*)$/)
      if (!match || !isFaceInner(match[1].slice(1, -1))) break
      out[out.length - 1] = `${out[out.length - 1]} ${match[1]}`
      seg = match[2].trimStart()
    }
    if (seg) out.push(seg)
  }
  return out
}

function allKindsMet(request: FormatRequest, checks: FormatChecks): boolean {
  return formatKinds(request).every((kind) => checks[kind] === true)
}

function rebuildFromProse(text: string, list: ListKind, t: FormatTunables): string | null {
  const pieces = parseReplyBlocks(text)
  if (pieces.length === 0 || pieces.some((piece) => piece.kind !== 'prose')) return null

  const sentences = attachFacesToPriorSentence(
    pieces.flatMap((piece) => (piece.kind === 'prose' ? splitSentences(piece.text) : []))
  )
  if (sentences.length < t.minListItems + 1) return null

  const hasCloser = sentences.length >= t.minListItems + 2
  const lead = sentences[0]
  const items = hasCloser ? sentences.slice(1, -1) : sentences.slice(1)
  if (items.length < t.minListItems) return null
  const closer = hasCloser ? sentences[sentences.length - 1] : null

  const listLines = items.map((item, idx) => (list === 'numbered' ? `${idx + 1}. ${item}` : `- ${item}`))
  const body = [lead, ...listLines].join('\n')
  return closer ? `${body}\n\n${closer}` : body
}

function renumberBullets(text: string, minListItems: number): string | null {
  const lines = text.split('\n')
  const bulletCount = lines.filter((line) => BULLET_LINE.test(line)).length
  if (bulletCount < minListItems) return null

  let n = 0
  return lines
    .map((line) => {
      const match = line.match(/^(\s*)[-*•]\s+(\S.*)$/)
      if (!match) return line
      n++
      return `${match[1]}${n}. ${match[2]}`
    })
    .join('\n')
}

export function enforceReplyFormat(
  text: string,
  request: FormatRequest,
  options: FormatTunables & { repair: 'off' | 'reformat' }
): FormatEnforcement {
  const first = checkReplyFormat(text, request, options)
  if (allKindsMet(request, first)) {
    return { text, first, final: { ...first }, repair: 'none', outcome: 'met' }
  }
  if (options.repair === 'off') {
    return { text, first, final: { ...first }, repair: 'off', outcome: 'unmet' }
  }

  if (request.list === 'numbered' && first.numbered === false) {
    const renumbered = renumberBullets(text, options.minListItems)
    if (renumbered !== null) {
      const final = checkReplyFormat(renumbered, request, options)
      if (final.numbered === true) {
        return {
          text: renumbered,
          first,
          final,
          repair: 'numbered_from_bullets',
          outcome: allKindsMet(request, final) ? 'repaired' : 'unmet'
        }
      }
    }
  }

  if (request.list && first[request.list] === false) {
    const rebuilt = rebuildFromProse(text, request.list, options)
    if (rebuilt !== null) {
      const final = checkReplyFormat(rebuilt, request, options)
      if (final[request.list] === true) {
        return {
          text: rebuilt,
          first,
          final,
          repair: 'list_from_prose',
          outcome: allKindsMet(request, final) ? 'repaired' : 'unmet'
        }
      }
    }
  }

  return { text, first, final: { ...first }, repair: 'not_possible', outcome: 'unmet' }
}
