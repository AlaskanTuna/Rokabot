/** Native web search on Gemini, run as its own one-shot generateContent request with the Google Search tool. */

import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai'
import { GoogleGenAI } from '@google/genai'
import type { ResolvedModel } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import { requestTokenEstimate, startCall } from '../../llm/budget.js'
import { ProviderError } from '../../llm/providerError.js'
import { geminiUsage, recordUsage } from '../../llm/usage.js'
import { SAFETY_SETTINGS } from '../../safetySettings.js'
import type { NativeCall } from './native.js'
import { nativeSearchPrompt } from './native.js'
import { type BackendOutcome, SEARCH_TEXT, clipSnippet, failedSearch } from './types.js'

// One search, one answer. The answer is a short summary, and the chat model writes the reply.
const MAX_TOKENS = 1024

/** The subset of the SDK client this caller uses, so a test can hand it a fake. */
export interface GeminiGenerateClient {
  models: { generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> }
}

interface SearchOutcome {
  answer: string
  results: { title: string; url: string; snippet: string }[]
}

function params(route: ResolvedModel, call: NativeCall): GenerateContentParameters {
  return {
    model: route.model,
    contents: call.query,
    config: {
      systemInstruction: nativeSearchPrompt(call.topic),
      // Only the search tool: this request's whole job is one grounded answer, not a chat turn.
      tools: [{ googleSearch: {} }],
      maxOutputTokens: MAX_TOKENS,
      safetySettings: SAFETY_SETTINGS,
      abortSignal: call.signal
    }
  }
}

/** The snippets the model attributed to each chunk, by that chunk's index in the original array. */
function supportTexts(metadata: NonNullable<GenerateContentResponse['candidates']>[number]['groundingMetadata']) {
  const snippets = new Map<number, string>()
  for (const support of metadata?.groundingSupports ?? []) {
    const text = support.segment?.text
    if (!text) continue
    for (const index of support.groundingChunkIndices ?? []) {
      // The first support that names a chunk wins: a later one only repeats the same claim's text.
      if (!snippets.has(index)) snippets.set(index, text)
    }
  }
  return snippets
}

/** The answer and the results it was built on. A response with no search ran is not a summary of anything read. */
function readResponse(response: GenerateContentResponse, maxResults: number, searched: boolean): SearchOutcome {
  const candidate = response.candidates?.[0]
  const metadata = candidate?.groundingMetadata
  const answer = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim()

  // Nothing was searched, so any text is the model's own guess rather than a summary of what it read.
  if (!searched) return { answer: SEARCH_TEXT.noSummary, results: [] }

  // Read every support before skipping chunks, because its indices point into the array as it arrived.
  const snippets = supportTexts(metadata)
  const seen = new Set<string>()
  const results: { title: string; url: string; snippet: string }[] = []
  for (const [index, chunk] of (metadata?.groundingChunks ?? []).entries()) {
    const url = chunk.web?.uri
    if (!url || seen.has(url)) continue
    seen.add(url)
    results.push({
      title: chunk.web?.title || url,
      url,
      snippet: clipSnippet(snippets.get(index) ?? '')
    })
  }

  return { answer: answer || SEARCH_TEXT.noSummary, results: results.slice(0, maxResults) }
}

/** One request, budgeted and billed on its own, with the answer text and the results it was built on. */
async function request(route: ResolvedModel, call: NativeCall, client: GeminiGenerateClient): Promise<SearchOutcome> {
  const body = params(route, call)
  const reservation = await startCall({
    provider: 'gemini',
    model: route.model,
    workload: 'search',
    estTokens: requestTokenEstimate([body.config?.systemInstruction, call.query]),
    signal: call.signal
  })
  try {
    const response = await client.models.generateContent(body)
    // Each query the provider reports is one billed search; a blank entry is not a query.
    const searches = (response.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? []).filter(
      (query) => query.trim() !== ''
    ).length
    const outcome = readResponse(response, call.maxResults, searches > 0)
    // A search that ran is billed even when the provider reports no metadata for it.
    const usage = {
      ...geminiUsage(route.model, 'search', response.usageMetadata ?? {}),
      ...(searches > 0 ? { searchRequests: searches } : {})
    }
    recordUsage(usage)
    reservation.release(usage)
    return outcome
  } catch (error) {
    reservation.release()
    throw error
  }
}

/** A spent account and a spent local minute both read as a quota wall, not as a fault. */
function quotaFailure(error: unknown): boolean {
  if (error instanceof ProviderError) return error.kind === 'quota_exhausted' || error.kind === 'billing_exhausted'
  return (error as { status?: unknown } | null)?.status === 429
}

export async function geminiNativeSearch(
  route: ResolvedModel,
  call: NativeCall,
  client?: GeminiGenerateClient
): Promise<BackendOutcome> {
  try {
    // A spent attempt or an abandoned request must not spend a provider call at all.
    call.signal.throwIfAborted()
    // Lazily built: a route without a Gemini key is never reached, because createNativeSearch only calls its own
    // provider's caller, and this constructor would otherwise throw on a keyless client at import time.
    const generateClient = client ?? new GoogleGenAI({ apiKey: route.apiKey })
    const outcome = await request(route, call, generateClient)
    return { ...outcome, resultCount: outcome.results.length, succeeded: true }
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status
    const kind = error instanceof ProviderError ? error.kind : undefined
    logger.warn({ kind, status }, 'Gemini native search failed')
    return failedSearch(quotaFailure(error) ? SEARCH_TEXT.quota : SEARCH_TEXT.failed)
  }
}
