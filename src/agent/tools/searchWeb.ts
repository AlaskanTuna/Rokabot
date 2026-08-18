/** Web search via the Tavily API */

import { logger } from '../../utils/logger.js'

export interface SearchWebParams {
  query: string
  topic?: 'general' | 'news'
  max_results?: number
}

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

/** Search the web via Tavily and return a summary plus top results */
export async function searchWeb(
  params: SearchWebParams
): Promise<{ answer: string; results: { title: string; url: string; snippet: string }[]; resultCount: number }> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return { answer: 'Web search is not configured.', results: [], resultCount: 0 }
  }

  const { query, topic = 'general', max_results = 5 } = params

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      // The query is sent verbatim. Appending a date and the configured location used to seem helpful and
      // measurably was not: the location token pulled back region-local pages and the date token pulled back
      // same-day pages, both regardless of subject, and Tavily's synthesiser then wrote confident answers off
      // those sources. Recency belongs in Tavily's own parameters, not in the query text — but `days` measured
      // as a net negative too (issue #19), so nothing is passed until there is a per-call signal worth keying on.
      body: JSON.stringify({
        query,
        topic,
        max_results,
        include_answer: 'basic'
      })
    })

    if (!response.ok) {
      const status = response.status
      logger.warn({ status, query }, 'Tavily search request failed')
      if (status === 429 || status === 432) {
        return { answer: 'Search quota exceeded. Try again later.', results: [], resultCount: 0 }
      }
      return { answer: 'Search request failed.', results: [], resultCount: 0 }
    }

    const data = (await response.json()) as TavilyResponse

    const results = data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.length > 200 ? r.content.substring(0, 200) + '...' : r.content
    }))

    logger.debug({ query, resultCount: results.length, responseTime: data.response_time }, 'Tavily search completed')

    return {
      answer: data.answer || 'No summary available.',
      results,
      resultCount: results.length
    }
  } catch (error) {
    logger.warn({ error, query }, 'Tavily search error')
    return { answer: 'Search request failed.', results: [], resultCount: 0 }
  }
}
