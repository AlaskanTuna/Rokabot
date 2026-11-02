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

/** `succeeded` stays off SearchResult: the model is never told apart a failure from an empty result. */
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

/** Bounds one result's snippet, so a long page cannot flood the model context. */
export function clipSnippet(text: string): string {
  return text.length > 200 ? `${text.substring(0, 200)}...` : text
}
