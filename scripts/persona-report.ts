/**
 * Measures Roka's voice in a set of replies: paragraph counts, openers, the tics users complained about (Ehh~,
 * Ahaha, meal fussing, question endings), flirting, onee-san, inner-thought asides, drama and kaomoji variety.
 * These are the markers that diagnosed the v2 regression and validated v3 (docs/research/roka-voice-v3.md).
 *
 * Usage:
 *   npx tsx scripts/persona-report.ts <results.jsonl>... [--by arm|arm,window|arm,history|arm,kinds]
 *   npx tsx scripts/persona-report.ts --production <db-copy.sqlite> --window <name>=<from>..<to> [--window ...]
 *
 * Results files come from scripts/persona-replay.ts. `--production` measures what production actually replied in
 * each window, on the same turns a replay would pick.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { countSlurRepetitions } from './persona-replay.js'
import { type Window, chatTurns, mulberry32, parseWindow } from './persona-turns.js'

const FACE = /[(（][^()（）\n]{1,18}[)）]/g
const ITALIC = /(?<![*\w])\*(?!\*)([^*\n]+?)(?<!\s)\*(?!\*)|(?<![_\w])_([^_\n]+?)_(?![_\w])/g
const ACTION =
  /^\s*(?:yawn(?:s|ed|ing)?|sob(?:s|bed|bing)?|sigh(?:s|ed|ing)?|gasp(?:s|ed|ing)?|giggl?(?:e|es|ed|ing)|ahem|cough(?:s|ed|ing)?|pout(?:s|ed|ing)?|huff(?:s|ed|ing)?|blush(?:es|ed|ing)?|smirk(?:s|ed|ing)?|wink(?:s|ed|ing)?|stretch(?:es|ed|ing)?|mumble(?:s|d|ing)?|whisper(?:s|ed|ing)?|sniff(?:s|ed|ing)?|hmph|nn+)\b/i
const THOUGHT = /(\bI\b|\bI'm\b|\bI'd\b|\bI'll\b|\bmy\b|\bme\b|\.\.\.|…|not that|maybe|hmm|wonder|honestly|really)/i

const MARKERS = {
  ehh: /\bEh+~/i,
  ahaha: /\bA+ha(ha)+/i,
  meal: /\b(eat|eaten|ate|dinner|lunch|breakfast|miso|meal|hungry)\b/i,
  flirt:
    /(♡|💕|favorite|\bdate\b|bride|\blove|blush|cute|handsome|sweet on|for you|miss(ed)? you|heart|kiss|hold(ing)? (your|my) hand|jealous|charm|captivat|flatter|figure|cuddle|hug|wink|pretty|beautiful|adorable|tempt)/i,
  oneesan: /\b(onee-san|big sis)\b/i,
  disclaimer:
    /\b(couldn't|could not|can't|cannot|unable to)\s+(?:confirm|tell|verify|know)|\bnot enough (?:information|context)\b/i,
  customer: /\bcustomers?\b/i,
  moderator: /\b(?:policy|rules?|inappropriate|as an ai|moderator|boundar(?:y|ies)|can't engage|won't answer)\b/i,
  // Case-sensitive on purpose: a run of capitals is shouting, "?!" a gasp, a dash an interruption, "W-wh" a stammer.
  drama: /(\?!|!\?|!!|\b[A-Z]{3,}\b|—|\b[A-Z]-[a-z])/
} as const

export function paragraphs(text: string): number {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((block) => block.trim()).length
}

export function faces(text: string): string[] {
  return (text.match(FACE) ?? []).filter((face) => /[^\w\s,.'*:\-?!]/.test(face) && !/^\([\w\s,.'-]+\)$/.test(face))
}

export function innerThoughts(text: string): string[] {
  return [...text.matchAll(ITALIC)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .filter((span) => span.split(/\s+/).length >= 3 && !ACTION.test(span) && THOUGHT.test(span))
}

function firstWord(text: string): string {
  const match = /[A-Za-z][\w'~-]*/.exec(text.trim().replace(/^[*_"\s]+/, ''))
  return (match?.[0] ?? '').replace(/[!?.,…]+$/, '').toLowerCase()
}

const share = (texts: readonly string[], test: (text: string, index: number) => boolean) =>
  texts.length === 0 ? 0 : texts.filter(test).length / texts.length

export type Summary = Readonly<{
  n: number
  paragraphs: Readonly<{ one: number; two: number; three: number }>
  medianWords: number
  exclaims: number
  endsOnQuestion: number
  openerVariety: number
  topOpener: Readonly<{ word: string; share: number }>
  ehh: number
  ahaha: number
  meal: number
  flirt: number
  oneesan: number
  disclaimer: number
  customer: number
  moderator: number
  slurRepetitions: number
  inner: number
  drama: number
  /** Distinct kaomoji in 50 replies, averaged over seeded draws; null under 50 replies. */
  facesPer50: number | null
  topFiveFaceShare: number
}>

export function summarize(
  texts: readonly string[],
  metadata: Readonly<{ edgy?: readonly boolean[]; slurRepetitions?: readonly number[] }> = {}
): Summary {
  const n = texts.length
  const counts = texts.map((text) => Math.min(paragraphs(text), 3))
  const words = texts.map((text) => text.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
  const openers = new Map<string, number>()
  for (const text of texts) openers.set(firstWord(text), (openers.get(firstWord(text)) ?? 0) + 1)
  let top = { word: '', share: 0 }
  for (const [word, count] of openers) if (count / n > top.share) top = { word, share: count / n }

  const perReply = texts.map(faces)
  const faceCounts = new Map<string, number>()
  for (const face of perReply.flat()) faceCounts.set(face, (faceCounts.get(face) ?? 0) + 1)
  const totalFaces = perReply.flat().length
  const topFive = [...faceCounts.values()].sort((a, b) => b - a).slice(0, 5)
  let facesPer50: number | null = null
  if (n >= 50) {
    const rand = mulberry32(1)
    let sum = 0
    const draws = 200
    for (let draw = 0; draw < draws; draw++) {
      const picked = new Set<string>()
      const pool = perReply.map((_, index) => index)
      for (let take = 0; take < 50; take++) {
        const index = pool.splice(Math.floor(rand() * pool.length), 1)[0]
        for (const face of perReply[index]) picked.add(face)
      }
      sum += picked.size
    }
    facesPer50 = Math.round((sum / draws) * 10) / 10
  }

  return {
    n,
    paragraphs: {
      one: counts.filter((count) => count === 1).length / n,
      two: counts.filter((count) => count === 2).length / n,
      three: counts.filter((count) => count === 3).length / n
    },
    medianWords: words[Math.floor(words.length / 2)] ?? 0,
    exclaims: share(texts, (text) => text.includes('!')),
    endsOnQuestion: share(texts, (text) => /\?\W{0,20}$/.test(text.trim())),
    openerVariety: openers.size / n,
    topOpener: top,
    ehh: share(texts, (text) => MARKERS.ehh.test(text)),
    ahaha: share(texts, (text) => MARKERS.ahaha.test(text)),
    meal: share(texts, (text) => MARKERS.meal.test(text)),
    flirt: share(texts, (text) => MARKERS.flirt.test(text)),
    oneesan: share(texts, (text) => MARKERS.oneesan.test(text)),
    disclaimer: share(texts, (text) => MARKERS.disclaimer.test(text)),
    customer: share(texts, (text) => MARKERS.customer.test(text)),
    moderator: share(texts, (text, index) => Boolean(metadata.edgy?.[index]) && MARKERS.moderator.test(text)),
    slurRepetitions: metadata.slurRepetitions?.reduce((sum, count) => sum + count, 0) ?? 0,
    inner: share(texts, (text) => innerThoughts(text).length > 0),
    drama: share(texts, (text) => MARKERS.drama.test(text)),
    facesPer50,
    topFiveFaceShare: totalFaces === 0 ? 0 : topFive.reduce((sum, count) => sum + count, 0) / totalFaces
  }
}

const pct = (value: number) => `${Math.round(value * 100)}%`.padStart(5)

export function formatTable(groups: ReadonlyMap<string, Summary>): string {
  const head = `${'group'.padEnd(24)}${'n'.padStart(5)}   1p   2p   3p  !    endQ  ehh~ ahaha meal flirt onee inner drama disc cust mod slur faces/50 openerShare`
  const rows = [...groups].map(
    ([name, s]) =>
      `${name.padEnd(24)}${String(s.n).padStart(5)}${pct(s.paragraphs.one)}${pct(s.paragraphs.two)}${pct(s.paragraphs.three)}${pct(s.exclaims)}${pct(s.endsOnQuestion)}${pct(s.ehh)}${pct(s.ahaha)}${pct(s.meal)}${pct(s.flirt)}${pct(s.oneesan)}${pct(s.inner)}${pct(s.drama)}${pct(s.disclaimer)}${pct(s.customer)}${pct(s.moderator)}${String(s.slurRepetitions).padStart(5)}${String(s.facesPer50 ?? '-').padStart(9)} ${pct(s.topOpener.share).trim()}`
  )
  return [head, ...rows].join('\n')
}

function main(argv: readonly string[]): void {
  const groups = new Map<string, Array<{ text: string; edgy: boolean; slurRepetitions: number }>>()
  const add = (key: string, row: { text: string; edgy?: boolean; slurRepetitions?: number }) =>
    groups.set(key, [
      ...(groups.get(key) ?? []),
      { text: row.text, edgy: row.edgy ?? false, slurRepetitions: row.slurRepetitions ?? 0 }
    ])
  const productionAt = argv.indexOf('--production')
  if (productionAt !== -1) {
    const windows: Window[] = []
    for (let index = 0; index < argv.length; index++)
      if (argv[index] === '--window') windows.push(parseWindow(argv[++index]))
    if (windows.length === 0) throw new Error('--production needs at least one --window')
    const db = new Database(argv[productionAt + 1], { readonly: true })
    for (const turn of chatTurns(db, windows, { seed: 42, timeZone: 'UTC' }))
      for (const kind of turn.kinds)
        add(`production:${turn.window}:${kind}`, {
          text: turn.reply,
          edgy: kind === 'edgy',
          slurRepetitions: countSlurRepetitions(turn.user, turn.reply, kind === 'edgy')
        })
  } else {
    const byAt = argv.indexOf('--by')
    const keys = (byAt === -1 ? 'arm' : argv[byAt + 1]).split(',')
    const files = argv.filter((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--by')
    if (files.length === 0) throw new Error('usage: persona-report.ts <results.jsonl>... [--by arm,kinds]')
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        const row = JSON.parse(line)
        if (row.error || !row.text) continue
        const base = keys
          .filter((key) => key !== 'kinds')
          .map((key) => row[key] ?? '?')
          .join(':')
        const kinds = keys.includes('kinds') ? (row.kinds ?? ['?']) : ['all']
        for (const kind of kinds)
          add(`${base}:${kind}`, {
            text: row.text,
            edgy: kind === 'edgy',
            slurRepetitions: kind === 'edgy' ? row.slurRepetitions : 0
          })
      }
    }
  }
  const summaries = new Map(
    [...groups].map(
      ([key, rows]) =>
        [
          key,
          summarize(
            rows.map((row) => row.text),
            {
              edgy: rows.map((row) => row.edgy),
              slurRepetitions: rows.map((row) => row.slurRepetitions)
            }
          )
        ] as const
    )
  )
  console.log(formatTable(summaries))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))
