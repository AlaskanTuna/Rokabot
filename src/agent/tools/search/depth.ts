/** The bounded depth loop inside search_web: a second search and page reads that fill what snippets cannot. */

import { config } from '../../../config.js'
import { lookupSourceUrl, resolveSource } from '../../searchSources.js'
import { parseSocialPostUrl } from '../../social/urls.js'
import { PAGE_TEXT, readPages } from './readPages.js'
import { timeLeftForLookupMs } from './turnBudget.js'
import { type BackendOutcome, SEARCH_TEXT, type SearchResult, type SearchWebParams, clipSnippet } from './types.js'

/** One ordinary search, with the budget spend, citations and source registration searchWeb always does. */
export type SingleSearch = (params: SearchWebParams) => Promise<BackendOutcome>

export const LOOKUP_TEXT = {
  unknownSource:
    'That link is not one I can open: it was neither shared in this conversation nor returned by a search. Say so plainly instead of guessing.',
  socialSource:
    'That post was already read and is quoted in the conversation. Answer from that quote instead of opening it again.'
}

/**
 * Hint terms that count as covering a field. Currency marks cover a price field, the local words cover
 * menu, hours and drink fields — a Japanese page carries the fact without ever using the English word.
 */
const FIELD_HINTS: Record<string, string[]> = {
  price: ['¥', '円', '$', 'rm', 'yen', 'price'],
  menu: ['メニュー', 'menu'],
  hours: ['営業時間', 'open', 'hours'],
  drink: ['coffee', 'ドリンク', 'ブレンド', 'blend', 'tea', 'drink']
}

/** A hint found in the text: plain Latin words need word boundaries (so the RM in "firm" never pays), symbols and CJK match by inclusion. */
function hintFound(hint: string, hay: string): boolean {
  if (/^[a-z]+$/.test(hint)) return new RegExp(`\\b${hint}\\b`).test(hay)
  return hay.includes(hint)
}

/** Filler words that never decide coverage: the field's load-bearing words name the price, menu or hours kind. */
const FIELD_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'and',
  'or',
  'items',
  'item',
  'list',
  'lists',
  'details',
  'detail',
  'number',
  'numbers',
  'specific',
  'several',
  'full'
])

/** Whether one field word is covered by the text. */
function wordCovered(word: string, hay: string): boolean {
  if (FIELD_STOPWORDS.has(word)) return true
  if (hintFound(word, hay)) return true
  for (const [kind, hints] of Object.entries(FIELD_HINTS)) {
    // An inflected form names the kind too: "opening" carries the "open" hint, "prices" the price kind.
    const names = word.includes(kind) || hints.some((hint) => hint.length >= 3 && word.includes(hint))
    if (names && hints.some((hint) => hintFound(hint, hay))) return true
  }
  return false
}

/**
 * Whether a field is covered by the text: every load-bearing word is. A word is covered when it appears
 * itself, when the kind it names has a hint present ("prices" is covered by ¥, "opening" by the "open"
 * hint of hours), or when it is filler ("menu items" needs only the menu). Decides only whether to dig
 * further, never what to answer.
 */
export function fieldCovered(field: string, text: string): boolean {
  const hay = text.toLowerCase()
  const words = field
    .toLowerCase()
    .split(/[^a-z0-9぀-ヿ一-龯]+/)
    .filter(Boolean)
  return words.length > 0 && words.every((word) => wordCovered(word, hay))
}

/** The fields no collected text covers yet. */
function missingFields(fields: readonly string[], text: string): string[] {
  return fields.filter((field) => !fieldCovered(field, text))
}

/** A search outcome as one coverable text: the provider answer plus every result's title and snippet. */
function corpusOf(outcome: BackendOutcome): string {
  return [outcome.answer, ...outcome.results.flatMap((result) => [result.title, result.snippet])].join('\n')
}

/** The attempt time left past the reply reserve still funds another lookup; null with no attempt in scope. */
function timeRemains(): boolean {
  const left = timeLeftForLookupMs()
  return left === null || left > 0
}

/** Paths that suggest a page holds the missing details: menus, prices, hours, drinks, or the local shop guides. */
const PAGE_PATH_HINT = /menu|price|pricing|hour|drink|coffee|tea|food|shop|store|料金|メニュー|営業時間|ドリンク/i

/** The two result URLs most likely to hold the missing fields: the top result's host first, telling paths next. */
function rankCandidates(results: ReadonlyArray<{ title: string; url: string; snippet: string }>): string[] {
  const urls = [...new Set(results.map((result) => result.url))]
  const hostOf = (url: string): string => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }
  const topHost = urls.length > 0 ? hostOf(urls[0] as string) : ''
  const pathHints = (url: string): boolean => {
    try {
      return PAGE_PATH_HINT.test(new URL(url).pathname)
    } catch {
      return false
    }
  }
  return urls
    .map((url, index) => ({
      url,
      score: (hostOf(url) !== '' && hostOf(url) === topHost ? 2 : 0) + (pathHints(url) ? 1 : 0),
      index
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map(({ url }) => url)
}

/** The page paragraphs that mention a field term; the untrusted-data label stays on top. */
function paragraphsForFields(pageText: string, fields: readonly string[]): string {
  const [label, ...rest] = pageText.split('\n')
  const lines = rest.map((line) => line.trim()).filter(Boolean)
  const kept = lines.filter((line) => fields.some((field) => fieldCovered(field, line)))
  return `${label}\n${kept.join('\n')}`
}

interface BriefPage {
  id: string
  title: string
  kept: string
}

/** The provider answer, then each read page's title, source id and field paragraphs, then what is still missing. The missing line survives the cap: it is the point of the brief. */
function buildBrief(answer: string, pages: readonly BriefPage[], missing: readonly string[]): string {
  const max = config.search.maxBriefChars
  const head = [answer, ...pages.map((page) => `[${page.id}] ${page.title}\n${page.kept}`)].filter(Boolean).join('\n\n')
  if (missing.length === 0) return head.length > max ? head.slice(0, max) : head
  const tail = `Still missing: ${missing.join(', ')}.`
  const full = head ? `${head}\n\n${tail}` : tail
  if (full.length <= max) return full
  const keep = max - tail.length - 2
  return keep <= 0 ? tail.slice(0, max) : `${head.slice(0, keep)}\n\n${tail}`
}

/** A refused source: no provider call, just the reason as the answer. */
function refused(answer: string): SearchResult {
  return { answer, results: [], resultCount: 0 }
}

function resolveLookupSource(source: string): { url: string; id: string } | { refused: string } {
  const trimmed = source.trim()
  if (/^s\d+$/i.test(trimmed)) {
    const id = trimmed.toLowerCase()
    const url = resolveSource(id)
    if (!url) return { refused: LOOKUP_TEXT.unknownSource }
    if (parseSocialPostUrl(url)) return { refused: LOOKUP_TEXT.socialSource }
    return { url, id }
  }
  // A raw URL is only openable when the turn already knows it from the message or its embeds.
  let normalized = trimmed
  try {
    normalized = new URL(trimmed).toString()
  } catch {
    return { refused: LOOKUP_TEXT.unknownSource }
  }
  const known = lookupSourceUrl(trimmed) ?? lookupSourceUrl(normalized)
  if (!known || (known.origin !== 'message' && known.origin !== 'embed')) {
    return { refused: LOOKUP_TEXT.unknownSource }
  }
  if (parseSocialPostUrl(trimmed) ?? parseSocialPostUrl(normalized)) return { refused: LOOKUP_TEXT.socialSource }
  const url = resolveSource(known.id) ?? trimmed
  return { url, id: known.id }
}

/** "Look into this link": resolve the source, refuse what is not openable, read the page and brief it. */
async function runSourceLookup(params: SearchWebParams, fields: string[], source: string): Promise<SearchResult> {
  const resolved = resolveLookupSource(source)
  if ('refused' in resolved) return refused(resolved.refused)

  const [page] = await readPages([{ id: resolved.id, url: resolved.url }], {
    ...(params.signal ? { signal: params.signal } : {})
  })
  if (!page || !page.ok) return refused(page?.error ?? PAGE_TEXT.failed)

  const missing = missingFields(fields, page.text)
  const brief =
    fields.length > 0
      ? buildBrief('', [{ id: resolved.id, title: page.title, kept: paragraphsForFields(page.text, fields) }], missing)
      : buildBrief('', [{ id: resolved.id, title: page.title, kept: page.text }], missing)
  return {
    answer: brief,
    results: [{ title: page.title, url: resolved.url, snippet: clipSnippet(page.text) }],
    resultCount: 1
  }
}

/**
 * The bounded loop: search, check coverage of each field, run local_query as the second search, then
 * read up to the top 2 result URLs most likely to hold the missing fields. Stops when every field is
 * covered, the turn budget is spent, or the attempt has no time left past the reply reserve.
 */
export async function runLookup(params: SearchWebParams, search: SingleSearch): Promise<SearchResult> {
  const fields = (params.fields ?? []).map((field) => field.trim()).filter(Boolean)
  if (params.source) return runSourceLookup(params, fields, params.source)

  const first = await search(params)
  let results = first.results
  const answers = first.succeeded ? [first.answer] : []
  const texts = [corpusOf(first)]
  let missing = missingFields(fields, texts.join('\n'))

  const localQuery = params.local_query?.trim()
  let secondRan = false
  if (missing.length > 0 && localQuery && timeRemains()) {
    secondRan = true
    const second = await search({ ...params, query: localQuery })
    if (second.succeeded) answers.push(second.answer)
    texts.push(corpusOf(second))
    const seen = new Set(results.map((result) => result.url))
    for (const result of second.results) {
      if (!seen.has(result.url)) {
        seen.add(result.url)
        results = [...results, result]
      }
    }
    missing = missingFields(fields, texts.join('\n'))
  }

  const pages: BriefPage[] = []
  if (results.length > 0) {
    for (const url of rankCandidates(results)) {
      if (missing.length === 0 || !timeRemains()) break
      const known = lookupSourceUrl(url)
      const [page] = await readPages([{ id: known?.id ?? url, url }], {
        ...(params.signal ? { signal: params.signal } : {})
      })
      if (!page || !page.ok) {
        // A spent budget ends the loop with a partial brief; any other failure tries the next candidate.
        if (page?.error === SEARCH_TEXT.budgetSpent) break
        continue
      }
      texts.push(page.text)
      const id = known?.id ?? url
      pages.push({ id, title: page.title, kept: paragraphsForFields(page.text, missing) })
      results = [...results, { title: page.title, url, snippet: clipSnippet(page.text) }]
      missing = missingFields(fields, texts.join('\n'))
    }
  }

  // Nothing past the first search ran: it stands exactly as a plain call would return it.
  if (!secondRan && pages.length === 0) {
    return { answer: first.answer, results: first.results, resultCount: first.resultCount }
  }
  const answer = answers.length > 0 ? answers.join('\n\n') : first.answer
  return { answer: buildBrief(answer, pages, missing), results, resultCount: results.length }
}
