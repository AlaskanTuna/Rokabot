/** Web search via the Tavily API */

import { logger } from '../../../utils/logger.js'
import { SEARCH_TEXT, type SearchBackend, clipSnippet, failedSearch } from './types.js'

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  answer?: string
  results: TavilyResult[]
  response_time: number
}

export const tavilySearch: SearchBackend = async (params) => {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return failedSearch(SEARCH_TEXT.notConfigured)
  }

  const { query, topic = 'general', max_results = 5, signal } = params

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      ...(signal ? { signal } : {}),
      // The query is sent verbatim. Appending a date and the configured location used to seem helpful and
      // measurably was not: the location token pulled back region-local pages and the date token pulled back
      // same-day pages, both regardless of subject. Recency belongs in Tavily's own parameters, not in the query
      // text — but `days` measured as a net negative too (issue #19), so nothing replaces them until there is a
      // per-call signal worth keying on.
      //
      // Both 'advanced' settings are load-bearing and fix different layers (issue #19):
      // search_depth governs which sources come back — on basic it surfaced fan wikis and returned two different
      // wrong voice actresses for the same character, where advanced surfaced vndb/tvtropes and the corroborated
      // one. include_answer governs the synthesis over those sources — on basic it attributed OpenAI's models to
      // Amazon. A better synthesiser cannot repair bad sources, so neither setting substitutes for the other.
      body: JSON.stringify({
        query,
        topic,
        max_results,
        search_depth: 'advanced',
        include_answer: 'advanced'
      })
    })

    if (!response.ok) {
      const status = response.status
      logger.warn({ status, query }, 'Tavily search request failed')
      if (status === 429 || status === 432) {
        return failedSearch(SEARCH_TEXT.quota)
      }
      return failedSearch(SEARCH_TEXT.failed)
    }

    const data = (await response.json()) as TavilyResponse

    const results = data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: clipSnippet(r.content)
    }))

    logger.debug({ query, resultCount: results.length, responseTime: data.response_time }, 'Tavily search completed')

    return {
      answer: data.answer || SEARCH_TEXT.noSummary,
      results,
      resultCount: results.length,
      succeeded: true
    }
  } catch (error) {
    logger.warn({ error, query }, 'Tavily search error')
    return failedSearch(SEARCH_TEXT.failed)
  }
}
