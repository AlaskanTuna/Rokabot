/** Web search via the Exa API */

import { logger } from '../../../utils/logger.js'
import { SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import { SEARCH_TEXT, type SearchBackend, clipSnippet, failedSearch, wellFormed } from './types.js'

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
      // An empty title is no title, and the reply still has to cite the link it used.
      title: r.title || r.url,
      url: r.url,
      snippet: clipSnippet(r.highlights?.[0] ?? '')
    }))

    logger.debug({ query, resultCount: results.length }, 'Exa search completed')

    return {
      answer: buildAnswer(data.results),
      results,
      resultCount: results.length,
      succeeded: true
    }
  } catch (error) {
    // Only the message: pino prints a plain `error` key as `{}`, so an operator could not see the cause.
    logger.warn({ error: error instanceof Error ? error.message : String(error), query }, 'Exa search error')
    return failedSearch(SEARCH_TEXT.failed)
  }
}

/**
 * Exa generates no answer, so the highlights stand in, joined in rank order and bounded. The raw highlights are
 * used, not the clipped snippets: the fact often sits past character 200 on a real page.
 *
 * The top result takes the larger of half the allowance and its fair share, because the answer sentence sits
 * deep inside a real highlight — about character 450 on the GPT-5.6 page that first exposed this — so an equal
 * share of roughly 300 across a page of results cut the fact away. Later results keep their fair share of what
 * is left, so one long top page cannot crowd them out entirely, and unused share rolls forward to them. A lone
 * result still gets the whole cap.
 */
function buildAnswer(results: readonly ExaResult[]): string {
  // One text per result, not per highlight: a share belongs to a result, so its own highlights stay together.
  const texts = results.map((r) => (r.highlights ?? []).filter(Boolean).join('\n')).filter(Boolean)
  if (texts.length === 0) return SEARCH_TEXT.noSummary

  // Each separator between shares is one character of the cap, so the shares plus the newlines total the cap.
  let left = MAX_ANSWER_CHARS - (texts.length - 1)
  const shares = texts.map((text, index) => {
    const fair = Math.ceil(left / (texts.length - index))
    const kept = cut(text, index === 0 ? Math.max(Math.ceil(left / 2), fair) : fair)
    left -= kept.length
    return kept
  })

  return `${SEARCH_EXCERPTS_UNTRUSTED_DATA_LABEL}\n${shares.join('\n')}`
}

/** Cuts a share inside its allowance, at the last whitespace so a number is not halved, and never mid-surrogate. */
function cut(text: string, allowance: number): string {
  if (text.length <= allowance) return text
  const head = wellFormed(text.slice(0, allowance))
  const whitespace = head.search(/\s\S*$/)
  return whitespace > 0 ? head.slice(0, whitespace) : head
}
