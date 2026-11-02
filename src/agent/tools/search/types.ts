/** The contract every search backend satisfies, so searchWeb() dispatches without knowing the provider. */

export interface SearchWebParams {
  query: string
  topic?: 'general' | 'news'
  max_results?: number
  signal?: AbortSignal
}

export interface SearchResult {
  answer: string
  results: { title: string; url: string; snippet: string }[]
  resultCount: number
}

/** `succeeded` stays off SearchResult: it gates citation recording, while the model reads the answer text. */
export interface BackendOutcome extends SearchResult {
  succeeded: boolean
}

export type SearchBackend = (params: SearchWebParams) => Promise<BackendOutcome>

export const SEARCH_TEXT = {
  notConfigured: 'Web search is not configured.',
  quota: 'Search quota exceeded. Try again later.',
  failed: 'Search request failed.',
  noSummary: 'No summary available.'
}

export function failedSearch(answer: string): BackendOutcome {
  return { answer, results: [], resultCount: 0, succeeded: false }
}

/** Drops a high surrogate left at the end of a cut, so a half-straddled emoji never reaches the model. */
export function wellFormed(text: string): string {
  return /[\uD800-\uDBFF]$/.test(text) ? text.slice(0, -1) : text
}

/** Bounds one result's snippet, so a long page cannot flood the model context. Text inside the bound is untouched. */
export function clipSnippet(text: string): string {
  return text.length > 200 ? `${wellFormed(text.substring(0, 200))}...` : text
}
