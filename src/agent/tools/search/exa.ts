/** Web search via the Exa API */

import { logger } from '../../../utils/logger.js'
import { SEARCH_TEXT, type SearchBackend, clipSnippet, failedSearch } from './types.js'

interface ExaResult {
  title?: string | null
  url: string
  highlights?: string[] | null
}

interface ExaResponse {
  results?: ExaResult[] | null
}

/** One turn's answer is read by a model with a bounded context, so the joined highlights are capped. */
const MAX_ANSWER_CHARS = 1500

export const exaSearch: SearchBackend = async (params) => {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return failedSearch(SEARCH_TEXT.notConfigured)
  }

  const { query, max_results, signal } = params
  // Exa bills per result above 10, and the tool's schema states 1-10 without enforcing it.
  const numResults = Math.min(10, Math.max(1, Math.trunc(max_results ?? 5)))

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      ...(signal ? { signal } : {}),
      // Only these four fields go out, following Exa's integration guidance. `topic` is dropped rather than
      // translated to `category: news` — Exa's guidance calls that mapping a mistake — and the query stays
      // verbatim, so no recency words are appended (issue #19).
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults,
        contents: { highlights: true }
      })
    })

    if (!response.ok) {
      const status = response.status
      logger.warn({ status, query }, 'Exa search request failed')
      // 402 covers both exhausted credit and an exceeded budget, so it reads as a quota wall, not a fault.
      if (status === 402 || status === 429) {
        return failedSearch(SEARCH_TEXT.quota)
      }
      return failedSearch(SEARCH_TEXT.failed)
    }

    const data = (await response.json()) as ExaResponse
    if (!Array.isArray(data.results)) {
      logger.warn({ query }, 'Exa search returned no result list')
      return failedSearch(SEARCH_TEXT.failed)
    }

    const results = data.results.map((r) => ({
      // A result with no title still carries the link the reply cites.
      title: r.title ?? r.url,
      url: r.url,
      snippet: clipSnippet(r.highlights?.[0] ?? '')
    }))

    logger.debug({ query, resultCount: results.length }, 'Exa search completed')

    return {
      answer: buildAnswer(results),
      results,
      resultCount: results.length,
      succeeded: true
    }
  } catch (error) {
    logger.warn({ error, query }, 'Exa search error')
    return failedSearch(SEARCH_TEXT.failed)
  }
}

/** Exa generates no answer, so the highlights stand in, joined in rank order and bounded. */
function buildAnswer(results: readonly { snippet: string }[]): string {
  const joined: string[] = []
  let length = 0
  for (const { snippet } of results) {
    if (!snippet) continue
    const next = length + snippet.length + (joined.length === 0 ? 0 : 1)
    if (next > MAX_ANSWER_CHARS) break
    joined.push(snippet)
    length = next
  }

  return joined.length === 0 ? SEARCH_TEXT.noSummary : joined.join(' ')
}
