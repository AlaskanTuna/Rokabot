/** Web search, dispatched to the backend config.yml selects */

import type { SearchProvider } from '../../config.js'
import { searchIsAvailable, searchProviderSetting } from '../../searchSettings.js'
import { logger } from '../../utils/logger.js'
import { recordSearchCitations } from '../searchCitations.js'
import { tavilySearch } from './search/tavily.js'
import {
  type BackendOutcome,
  SEARCH_TEXT,
  type SearchBackend,
  type SearchResult,
  type SearchWebParams,
  failedSearch
} from './search/types.js'

export type { SearchWebParams } from './search/types.js'

/** Placeholders until Task 3 (exa) and Task 7 (native) fill them in. */
const noBackend: SearchBackend = async () => failedSearch(SEARCH_TEXT.notConfigured)

const BACKENDS: Record<SearchProvider, SearchBackend> = {
  off: noBackend,
  native: noBackend,
  tavily: tavilySearch,
  exa: noBackend
}

/** Search the web through the configured backend and return a summary plus top results */
export async function searchWeb(params: SearchWebParams): Promise<SearchResult> {
  if (!searchIsAvailable()) {
    const failed = failedSearch(SEARCH_TEXT.notConfigured)
    return { answer: failed.answer, results: failed.results, resultCount: failed.resultCount }
  }

  const provider = searchProviderSetting()
  const startedAtMs = Date.now()
  let outcome: BackendOutcome
  try {
    outcome = await BACKENDS[provider](params)
  } catch (error) {
    logger.warn({ error, provider }, 'Web search backend threw')
    outcome = failedSearch(SEARCH_TEXT.failed)
  }

  logger.info(
    {
      provider,
      elapsedMs: Date.now() - startedAtMs,
      resultCount: outcome.resultCount,
      succeeded: outcome.succeeded
    },
    'Web search finished'
  )

  // A failed search leaves the citations a successful earlier search in the same turn recorded, so the reply
  // still cites the sources it was actually built on.
  if (outcome.succeeded) {
    // The model receives these as text; the reply surface needs the URLs to cite them.
    recordSearchCitations(outcome.results.map(({ title, url }) => ({ title, url })))
  }

  return { answer: outcome.answer, results: outcome.results, resultCount: outcome.resultCount }
}
