/** The bounded depth loop inside search_web: a second search and page reads that fill what snippets cannot. */

import { config } from '../../../config.js'
import { PAGE_UNTRUSTED_DATA_LABEL, SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import { lookupSourceUrl, resolveSource } from '../../searchSources.js'
import { parseSocialPostUrl } from '../../social/urls.js'
import { type Passage, assessField, fieldKind, relevantBlocks } from './coverage.js'
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

/** The attempt time left past the reply reserve still funds another lookup; null with no attempt in scope. */
function timeRemains(): boolean {
  const left = timeLeftForLookupMs()
  return left === null || left > 0
}

/** The label lines readPages and the backends prepend, dropped before coverage sees the blocks. */
function bodyBlocks(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block.length > 0 && block !== PAGE_UNTRUSTED_DATA_LABEL && block !== SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL
    )
}

/**
 * One search outcome as coverable passages: one per result, heading excluded — a title like "See our menu"
 * carries no items — plus the provider answer. The answer blends every result's text, so only "other"
 * fields may use it; lists and prices need per-source attribution for the branch scopes.
 */
function outcomePassages(outcome: BackendOutcome): { sources: Passage[]; answer: Passage[] } {
  const sources = outcome.results.map((result) => ({
    sourceId: lookupSourceUrl(result.url)?.id ?? result.url,
    heading: result.title,
    body: result.text || result.snippet
  }))
  const answer: Passage[] =
    outcome.succeeded && outcome.answer ? [{ sourceId: '', heading: '', body: outcome.answer }] : []
  return { sources, answer }
}

/**
 * Whether each field is covered yet. Lists and prices read the per-source passages only; other fields read
 * one passage body at a time, never titles and snippets pooled together.
 */
function missingAfter(fields: readonly string[], sources: readonly Passage[], answer: readonly Passage[]): string[] {
  return fields.filter((field) => {
    const passages = fieldKind(field) === 'other' ? [...answer, ...sources] : sources
    return !assessField(field, passages).covered
  })
}

/** Paths that suggest a page holds the missing details: menus, prices, hours, drinks, or the local shop guides. */
const MENU_PATH_HINT = /menu|メニュー|drink|price|料金|値段/i

/** Menu-specific results first — by URL path or title — so the top-host bonus never outranks a menu page. */
function rankCandidates(results: ReadonlyArray<{ title: string; url: string; snippet: string }>): string[] {
  const urls = [...new Set(results.map((result) => result.url))]
  const hostOf = (url: string): string => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }
  const titles = new Map(results.map((result) => [result.url, result.title]))
  const topHost = urls.length > 0 ? hostOf(urls[0] as string) : ''
  const menuSpecific = (url: string): boolean => {
    try {
      if (MENU_PATH_HINT.test(new URL(url).pathname)) return true
    } catch {
      // A relative URL carries no path to test; the title still decides below.
    }
    return MENU_PATH_HINT.test(titles.get(url) ?? '')
  }
  return urls
    .map((url, index) => ({
      url,
      score: (menuSpecific(url) ? 2 : 0) + (hostOf(url) !== '' && hostOf(url) === topHost ? 1 : 0),
      index
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map(({ url }) => url)
}

interface BriefSupport {
  id: string
  title: string
  kept: string
}

/**
 * Each field's support passages with their source ids, then the provider answer, then what is still missing.
 * Support is cut at a line boundary so a list entry never breaks mid-entry; the missing line survives the cap.
 */
/** Text clipped to a length, at an entry boundary unless that throws away most of the room: one huge line is better clipped than lost. */
function clipAtEntry(text: string, room: number): string {
  if (text.length <= room) return text
  const cut = text.slice(0, Math.max(0, room))
  const at = cut.lastIndexOf('\n')
  return (at > room / 2 ? cut.slice(0, at) : cut).trimEnd()
}

function buildBrief(answers: readonly string[], supports: readonly BriefSupport[], missing: readonly string[]): string {
  const max = config.search.maxBriefChars
  const tail = missing.length > 0 ? `Still missing: ${missing.join(', ')}.` : ''
  const room = max - (tail ? tail.length + 2 : 0)
  if (room <= 0) return tail.slice(0, max)
  // Each cited source gets an even share, so one long review never crowds out the others.
  const share = supports.length > 0 ? Math.floor(room / supports.length) : room
  const cited = supports.map((page) => clipAtEntry(`[${page.id}] ${page.title}\n${page.kept}`, share - 2))
  // Cited support leads: the provider answer often restates the same excerpts, so the cap trims it first.
  const head = clipAtEntry([...cited, ...answers].filter(Boolean).join('\n\n'), room)
  if (!tail) return head
  return head ? `${head}\n\n${tail}` : tail
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

  const passage: Passage = { sourceId: resolved.id, heading: page.title, body: bodyBlocks(page.text).join('\n\n') }
  const missing = missingAfter(fields, [passage], [])
  const kept =
    fields.length > 0
      ? fields.flatMap((field) => relevantBlocks(field, passage.body)).join('\n')
      : bodyBlocks(page.text).join('\n')
  const brief = buildBrief([], [{ id: resolved.id, title: page.title, kept }], missing)
  return {
    answer: brief,
    results: [{ title: page.title, url: resolved.url, snippet: clipSnippet(page.text) }],
    resultCount: 1
  }
}

/**
 * The bounded loop: search, check coverage of each field, run local_query as the second search, then
 * read up to the top 2 result URLs most likely to hold the missing fields. Stops when every field is
 * covered, the turn budget is spent, or the attempt has no time left past the reply reserve. When fields
 * are given and something is still missing, the returned answer is the brief with the cited partial
 * evidence — even when no second search or page read succeeded.
 */
export async function runLookup(params: SearchWebParams, search: SingleSearch): Promise<SearchResult> {
  const fields = (params.fields ?? []).map((field) => field.trim()).filter(Boolean)
  if (params.source) return runSourceLookup(params, fields, params.source)

  const first = await search(params)
  let results = first.results
  const firstPassages = outcomePassages(first)
  const sources: Passage[] = [...firstPassages.sources]
  const answers = first.succeeded ? [first.answer] : []
  let missing = missingAfter(fields, sources, firstPassages.answer)

  const localQuery = params.local_query?.trim()
  let secondRan = false
  if (missing.length > 0 && localQuery && timeRemains()) {
    secondRan = true
    const second = await search({ ...params, query: localQuery })
    if (second.succeeded) answers.push(second.answer)
    const secondPassages = outcomePassages(second)
    sources.push(...secondPassages.sources)
    firstPassages.answer.push(...secondPassages.answer)
    const seen = new Set(results.map((result) => result.url))
    for (const result of second.results) {
      if (!seen.has(result.url)) {
        seen.add(result.url)
        results = [...results, result]
      }
    }
    missing = missingAfter(fields, sources, firstPassages.answer)
  }

  let readRan = false
  if (results.length > 0) {
    for (const url of rankCandidates(results)) {
      if (missing.length === 0 || !timeRemains()) break
      const known = lookupSourceUrl(url)
      readRan = true
      const [page] = await readPages([{ id: known?.id ?? url, url }], {
        ...(params.signal ? { signal: params.signal } : {})
      })
      if (!page || !page.ok) {
        // A spent budget ends the loop with a partial brief; any other failure tries the next candidate.
        if (page?.error === SEARCH_TEXT.budgetSpent) break
        continue
      }
      sources.push({ sourceId: known?.id ?? url, heading: page.title, body: bodyBlocks(page.text).join('\n\n') })
      results = [...results, { title: page.title, url, snippet: clipSnippet(page.text) }]
      missing = missingAfter(fields, sources, firstPassages.answer)
    }
  }

  // Nothing past the first search ran and every field held: it stands exactly as a plain call would return it.
  if (!secondRan && !readRan && missing.length === 0) {
    return { answer: first.answer, results: first.results, resultCount: first.resultCount }
  }
  // One entry per source, its blocks merged across fields, so a page supporting two fields keeps both.
  const bySource = new Map<string, { title: string; blocks: Set<string> }>()
  const answerAndSources = [...firstPassages.answer, ...sources]
  for (const field of fields) {
    for (const passage of assessField(field, answerAndSources).support) {
      if (passage.sourceId === '') continue
      const entry = bySource.get(passage.sourceId) ?? { title: passage.heading, blocks: new Set<string>() }
      for (const block of relevantBlocks(field, passage.body)) entry.blocks.add(block)
      bySource.set(passage.sourceId, entry)
    }
  }
  const supports: BriefSupport[] = [...bySource]
    .filter(([, entry]) => entry.blocks.size > 0)
    .map(([id, entry]) => ({ id, title: entry.title, kept: [...entry.blocks].join('\n') }))
  return { answer: buildBrief(answers, supports, missing), results, resultCount: results.length }
}
