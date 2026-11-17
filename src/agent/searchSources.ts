/** Turn-scoped registry mapping stable source ids (s1, s2, ...) to the URLs the turn may read or cite. */

import { AsyncLocalStorage } from 'node:async_hooks'

export type SourceOrigin = 'message' | 'embed' | 'search'

interface SourceEntry {
  id: string
  url: string
  origin: SourceOrigin
}

interface SourceRegistry {
  byId: Map<string, SourceEntry>
  byUrl: Map<string, SourceEntry>
}

const sourcesForTurn = new AsyncLocalStorage<SourceRegistry>()

/** Opens one turn's source registry. Entered beside withSearchCitations in turnPipeline.ts. */
export function withSearchSources<T>(run: () => T): T {
  return sourcesForTurn.run({ byId: new Map(), byUrl: new Map() }, run)
}

/**
 * Registers URLs and returns one stable id per URL in order. A URL registered twice keeps its first id
 * and origin: the message's own link and a search result pointing at the same page are the same source.
 */
export function registerSources(urls: readonly string[], origin: SourceOrigin): string[] {
  const registry = sourcesForTurn.getStore()
  if (!registry) return []
  return urls.map((url) => {
    const known = registry.byUrl.get(url)
    if (known) return known.id
    const id = `s${registry.byId.size + 1}`
    const entry = { id, url, origin }
    registry.byId.set(id, entry)
    registry.byUrl.set(url, entry)
    return id
  })
}

/** Resolves a source id to its URL, or undefined when the id is unknown or no turn scope is open. */
export function resolveSource(id: string): string | undefined {
  return sourcesForTurn.getStore()?.byId.get(id)?.url
}

const URL_PATTERN = /https?:\/\/[^\s<>\]`]+/g

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** Trailing sentence punctuation is not the URL; a closing paren stays only when the URL opened one. */
function trimUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?'"\]*]+$/, '')
  while (url.endsWith(')') && count(url, '(') < count(url, ')')) url = url.slice(0, -1)
  return url
}

/** The http(s) URLs in a text, de-duplicated in order. */
export function extractUrls(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    if (url) found.add(url)
  }
  return [...found]
}

/**
 * Registers the URLs in the triggering message text. Embed titles, descriptions and fields are already
 * inlined into that text upstream, so one pass covers the message and its embeds together.
 */
export function registerMessageSources(text: string): string[] {
  return registerSources(extractUrls(text), 'message')
}
