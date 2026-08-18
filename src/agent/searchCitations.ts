/** Per-turn capture of the sources search_web returned, so the reply can cite what it was built on. */

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

/** Replaces rather than appends: a retried turn should cite the search it actually answered from. */
export function recordSearchCitations(citations: readonly SearchCitation[]): void {
  const sink = citationsForTurn.getStore()
  if (!sink) return
  sink.length = 0
  sink.push(...citations)
}
