/** Reads whole pages back through the search provider, for the follow-up reads a summary cannot answer. */

import Anthropic from '@anthropic-ai/sdk'
import type { ResolvedModel, SearchProvider } from '../../../config.js'
import { config } from '../../../config.js'
import { searchProviderSetting } from '../../../searchSettings.js'
import { logger } from '../../../utils/logger.js'
import {
  type AnthropicMessagesClient,
  callUsage,
  classifyAnthropicError,
  thinkingParams
} from '../../llm/anthropicLlm.js'
import { requestTokenEstimate, startCall } from '../../llm/budget.js'
import { ProviderError } from '../../llm/providerError.js'
import { recordUsage } from '../../llm/usage.js'
import { resolvesToPublicAddress } from '../../media/mediaRules.js'
import { PAGE_UNTRUSTED_DATA_LABEL } from '../../promptSafety.js'
import { recordPageCitations } from '../../searchCitations.js'
import { currentSearchAttempt } from './attemptBudget.js'
import { timeLeftForLookupMs, trySpend } from './turnBudget.js'
import { SEARCH_TEXT, wellFormed } from './types.js'

export interface PageSource {
  id: string
  url: string
}

export interface PageResult {
  id: string
  url: string
  title: string
  text: string
  truncated: boolean
  ok: boolean
  error?: string
}

export interface ReadPagesOptions {
  signal?: AbortSignal
  client?: AnthropicMessagesClient
}

export const PAGE_TEXT = {
  unavailable: 'Page reading is not available with the current search provider.',
  failed: 'Page reading failed.',
  refused: 'That page cannot be read.'
}

type Params = Anthropic.MessageCreateParamsNonStreaming

// One page per request, like the native search: the chat model calls again when it wants another page.
const FETCH_MAX_TOKENS = 1024

function failed(source: PageSource, error: string): PageResult {
  return { id: source.id, url: source.url, title: '', text: '', truncated: false, ok: false, error }
}

function capped(source: PageSource, title: string, text: string): PageResult {
  const max = config.search.maxPageChars
  const truncated = text.length > max
  const kept = truncated ? wellFormed(text.slice(0, max)) : text
  return { id: source.id, url: source.url, title, text: `${PAGE_UNTRUSTED_DATA_LABEL}\n${kept}`, truncated, ok: true }
}

/** The Pi fetches a sender-chosen host here, so the same SSRF guard as media links applies. Reads nothing. */
async function refusalFor(url: string): Promise<string | undefined> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return PAGE_TEXT.refused
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return PAGE_TEXT.refused
  try {
    if (!(await resolvesToPublicAddress(parsed.hostname))) return PAGE_TEXT.refused
  } catch {
    return PAGE_TEXT.refused
  }
  return undefined
}

interface ExaContentResult {
  url?: string
  title?: string | null
  text?: string | null
}

async function exaReadPage(source: PageSource, signal?: AbortSignal): Promise<PageResult> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return failed(source, PAGE_TEXT.unavailable)

  try {
    // A spent attempt must not spend a provider call at all.
    signal?.throwIfAborted()
    const response = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({ urls: [source.url], text: { maxCharacters: config.search.maxPageChars } })
    })

    if (!response.ok) {
      const status = response.status
      logger.warn({ status, url: source.url }, 'Exa page read failed')
      return failed(source, status === 402 || status === 429 ? SEARCH_TEXT.quota : PAGE_TEXT.failed)
    }

    const data = (await response.json()) as { results?: ExaContentResult[] | null }
    const page = Array.isArray(data.results)
      ? (data.results.find((result) => result.url === source.url) ?? data.results[0])
      : undefined
    if (!page || typeof page.text !== 'string' || page.text === '') {
      logger.warn({ url: source.url }, 'Exa page read returned no text')
      return failed(source, PAGE_TEXT.failed)
    }
    return capped(source, page.title || source.url, page.text)
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), url: source.url }, 'Exa page error')
    return failed(source, PAGE_TEXT.failed)
  }
}

interface TavilyExtractResult {
  url?: string
  title?: string | null
  content?: string | null
}

async function tavilyReadPage(source: PageSource, signal?: AbortSignal): Promise<PageResult> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return failed(source, PAGE_TEXT.unavailable)

  try {
    // A spent attempt must not spend a provider call at all.
    signal?.throwIfAborted()
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({ urls: [source.url] })
    })

    if (!response.ok) {
      const status = response.status
      logger.warn({ status, url: source.url }, 'Tavily page read failed')
      return failed(source, status === 402 || status === 429 ? SEARCH_TEXT.quota : PAGE_TEXT.failed)
    }

    const data = (await response.json()) as {
      results?: TavilyExtractResult[] | null
      failed_results?: Array<{ url?: string }> | null
    }
    const page = Array.isArray(data.results)
      ? (data.results.find((result) => result.url === source.url) ?? data.results[0])
      : undefined
    if (!page || typeof page.content !== 'string' || page.content === '') {
      logger.warn({ url: source.url }, 'Tavily page read returned no text')
      return failed(source, PAGE_TEXT.failed)
    }
    return capped(source, page.title || source.url, page.content)
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), url: source.url }, 'Tavily page error')
    return failed(source, PAGE_TEXT.failed)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const FETCH_RESULT_TYPE = 'web_fetch_tool_result'

/** The title the fetch reports for the page, or nothing when it reports only text. */
function fetchTitle(blocks: Array<Record<string, unknown>>): string | undefined {
  for (const block of blocks) {
    if (typeof block.title === 'string' && block.title !== '') return block.title
    const content = block.content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (isRecord(item) && typeof item.title === 'string' && item.title !== '') return item.title
      }
    }
  }
  return undefined
}

/** Every text item the fetch returned, in order; an error object carries none. */
function fetchTexts(blocks: Array<Record<string, unknown>>): string[] {
  const texts: string[] = []
  for (const block of blocks) {
    const content = block.content
    if (!Array.isArray(content)) continue
    for (const item of content) {
      if (isRecord(item) && typeof item.text === 'string' && item.text !== '') texts.push(item.text)
    }
  }
  return texts
}

function fetchErrorCode(blocks: Array<Record<string, unknown>>): string | undefined {
  for (const block of blocks) {
    const content = block.content
    if (isRecord(content) && typeof content.error_code === 'string') return content.error_code
  }
  return undefined
}

/**
 * Reads one fetch response: the page text from the tool results, the title beside it. A reported error
 * maps like the provider errors elsewhere — quota reads as quota, anything else as a failed read.
 */
function readFetchResponse(source: PageSource, message: Anthropic.Message): PageResult {
  // The block union is read opaquely: only the tool type string and the text inside are load-bearing, and
  // the SDK version pins the first while the second is plain strings either way.
  const blocks = (message.content as unknown as unknown[]).filter(
    (block): block is Record<string, unknown> => isRecord(block) && block.type === FETCH_RESULT_TYPE
  )

  const errorCode = fetchErrorCode(blocks)
  if (errorCode) {
    logger.warn({ errorCode, url: source.url }, 'Anthropic page fetch reported an error')
    return failed(source, errorCode === 'too_many_requests' ? SEARCH_TEXT.quota : PAGE_TEXT.failed)
  }

  const texts = fetchTexts(blocks)
  if (texts.length === 0) {
    logger.warn({ url: source.url }, 'Anthropic page fetch returned no text')
    return failed(source, PAGE_TEXT.failed)
  }
  return capped(source, fetchTitle(blocks) ?? source.url, texts.join('\n'))
}

function fetchParams(route: ResolvedModel, url: string): Params {
  return {
    model: route.model,
    max_tokens: FETCH_MAX_TOKENS,
    system:
      'Fetch the page at the URL below with the web_fetch tool and reply with its text. Reply with only the page text, nothing else.',
    messages: [{ role: 'user', content: `Fetch this page: ${url}` }],
    // One page per call: the chat model calls again when the attempt has more pages in it.
    tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 1 }],
    ...thinkingParams({ ...route, effort: 'none' }, undefined)
  }
}

/** One request, budgeted and billed on its own, with the page text the fetch returned. */
async function requestFetch(
  route: ResolvedModel,
  source: PageSource,
  client: AnthropicMessagesClient,
  signal?: AbortSignal
): Promise<Anthropic.Message> {
  const body = fetchParams(route, source.url)
  const reservation = await startCall({
    provider: 'anthropic',
    model: route.model,
    workload: 'search',
    estTokens: requestTokenEstimate([body.system, source.url]),
    ...(signal ? { signal } : {})
  })
  try {
    return await client.messages.create(body, { signal })
  } catch (error) {
    // A fetch cut off after it reached the provider may still be billed for tokens, and a call that recorded
    // nothing is invisible to the monthly cap. web_fetch itself carries no per-use fee.
    if (signal?.aborted) {
      const aborted = {
        provider: 'anthropic' as const,
        model: route.model,
        workload: 'search' as const,
        inputTokens: 0,
        outputTokens: 0
      }
      recordUsage(aborted)
      reservation.release(aborted)
    } else {
      reservation.release()
    }
    throw error
  }
}

async function anthropicFetchPage(
  route: ResolvedModel,
  source: PageSource,
  opts: { signal?: AbortSignal; client?: AnthropicMessagesClient }
): Promise<PageResult> {
  // Lazily built: a route without an Anthropic key is never reached, because only an Anthropic main calls
  // it, and this constructor would otherwise throw on a keyless client at import time.
  const client =
    opts.client ??
    new Anthropic({ apiKey: route.apiKey, ...(route.baseUrl ? { baseURL: route.baseUrl } : {}), maxRetries: 0 })
  try {
    // A spent attempt or an abandoned request must not spend a provider call at all.
    opts.signal?.throwIfAborted()
    const message = await requestFetch(route, source, client, opts.signal)
    const usage = callUsage(route.model, 'search', message.usage)
    recordUsage(usage)
    if (message.stop_reason === 'refusal') {
      throw new ProviderError({ provider: 'anthropic', kind: 'refusal', message: 'Anthropic refused the page fetch' })
    }
    return readFetchResponse(source, message)
  } catch (error) {
    const failure = classifyAnthropicError(error)
    logger.warn({ kind: failure.kind, status: failure.status, url: source.url }, 'Anthropic page fetch failed')
    // A spent Anthropic account and a spent local minute both read as a quota wall, not as a fault.
    const quota = failure.kind === 'quota_exhausted' || failure.kind === 'billing_exhausted' || failure.status === 429
    return failed(source, quota ? SEARCH_TEXT.quota : PAGE_TEXT.failed)
  }
}

/** Reads one page through the main model itself. Exported so tests can drive a non-Anthropic route. */
export function nativeReadPage(
  route: ResolvedModel,
  source: PageSource,
  opts: { signal?: AbortSignal; client?: AnthropicMessagesClient }
): Promise<PageResult> {
  // Only an Anthropic main carries a page-fetching tool; other native mains cannot read pages at all.
  if (route.provider !== 'anthropic') return Promise.resolve(failed(source, PAGE_TEXT.unavailable))
  return anthropicFetchPage(route, source, opts)
}

/**
 * Reads each page through the active search provider. Refused URLs and a spent turn budget fail that page
 * without a provider call; provider failures fail it with a quota or failed message. Never throws.
 */
export async function readPages(sources: readonly PageSource[], opts: ReadPagesOptions = {}): Promise<PageResult[]> {
  const provider: SearchProvider = searchProviderSetting()
  const attempt = currentSearchAttempt()
  const signal = opts.signal ?? attempt?.signal
  const results: PageResult[] = []

  for (const source of sources) {
    try {
      const refused = await refusalFor(source.url)
      if (refused) {
        results.push(failed(source, refused))
        continue
      }
      const timeLeftMs = timeLeftForLookupMs()
      if ((timeLeftMs !== null && timeLeftMs <= 0) || !trySpend('pageRead')) {
        logger.debug({ url: source.url }, 'Page read skipped: turn budget spent')
        results.push(failed(source, SEARCH_TEXT.budgetSpent))
        continue
      }

      if (provider === 'exa') results.push(await exaReadPage(source, signal))
      else if (provider === 'tavily') results.push(await tavilyReadPage(source, signal))
      else if (provider === 'native')
        results.push(await nativeReadPage(config.llm.main, source, { signal, client: opts.client }))
      else results.push(failed(source, PAGE_TEXT.unavailable))
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error), url: source.url }, 'Page read error')
      results.push(failed(source, PAGE_TEXT.failed))
    }
  }

  const read = results.filter((result) => result.ok)
  if (read.length > 0) {
    recordPageCitations(read.map(({ title, url }) => ({ title, url })))
  }
  return results
}
