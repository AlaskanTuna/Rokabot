/** Per-turn capture of the sources a lookup returned, so the reply can cite what it was built on. */

import { AsyncLocalStorage } from 'node:async_hooks'

export interface SearchCitation {
  title: string
  url: string
}

const citationsForTurn = new AsyncLocalStorage<SearchCitation[]>()

/**
 * Runs one turn with a citation sink in scope. searchWeb writes into it from deep inside ADK's tool
 * execution; the same async-context propagation the tool-name tracking in roka.ts already relies on.
 */
export async function withSearchCitations<T>(run: () => Promise<T>): Promise<[T, SearchCitation[]]> {
  const sink: SearchCitation[] = []
  const result = await citationsForTurn.run(sink, run)
  return [result, sink]
}

/** Appends, skipping URLs already cited: one attempt may look twice, and a retried attempt starts empty. */
function appendUnique(citations: readonly SearchCitation[]): void {
  const sink = citationsForTurn.getStore()
  if (!sink) return
  const seen = new Set(sink.map(({ url }) => url))
  for (const citation of citations) {
    if (seen.has(citation.url)) continue
    seen.add(citation.url)
    sink.push(citation)
  }
}

/** Records the URLs a search answered from. A failed search records nothing, leaving earlier citations. */
export function recordSearchCitations(citations: readonly SearchCitation[]): void {
  appendUnique(citations)
}

/** Records the pages a page read returned, into the same sink the reply cites. */
export function recordPageCitations(citations: readonly SearchCitation[]): void {
  appendUnique(citations)
}

/** Empties the sink when a new reply attempt starts, so a retried turn cites only what that attempt used. */
export function resetSearchCitations(): void {
  const sink = citationsForTurn.getStore()
  if (!sink) return
  sink.length = 0
}
