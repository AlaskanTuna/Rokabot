/** Native web search on Claude, run as its own one-shot Messages request with the server-side web search tool. */

import Anthropic from '@anthropic-ai/sdk'
import type { ResolvedModel } from '../../../config.js'
import { logger } from '../../../utils/logger.js'
import type { AnthropicMessagesClient } from '../../llm/anthropicLlm.js'
import { callUsage, classifyAnthropicError, thinkingParams } from '../../llm/anthropicLlm.js'
import { requestTokenEstimate, startCall } from '../../llm/budget.js'
import { ProviderError } from '../../llm/providerError.js'
import { recordUsage } from '../../llm/usage.js'
import type { NativeCall } from './native.js'
import { nativeSearchPrompt } from './native.js'
import { type BackendOutcome, SEARCH_TEXT, clipSnippet, failedSearch } from './types.js'

// One search, one answer. The answer is a short summary, and the chat model writes the reply.
const MAX_TOKENS = 1024

type Params = Anthropic.MessageCreateParamsNonStreaming
type Block = Anthropic.ContentBlockParam

/** How often the model's turn may pause for a server tool before the search counts as failed. */
const MAX_PAUSES = 1

interface SearchOutcome {
  answer: string
  results: { title: string; url: string; snippet: string }[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorContent(content: unknown): content is Anthropic.WebSearchToolResultError {
  return isRecord(content) && typeof content.error_code === 'string'
}

/** A result list block, or nothing when its content is an error object rather than a list. */
function searchResults(block: Anthropic.WebSearchToolResultBlockContent): Anthropic.WebSearchResultBlock[] {
  return isErrorContent(block) ? [] : block
}

/**
 * The cited text for each URL, in the order the citations appeared. Claude marks its own summary with citations
 * rather than returning them beside each result, so this is the only place a result's page text is available.
 */
function citedText(message: Anthropic.Message): Map<string, string> {
  const cited = new Map<string, string>()
  for (const block of message.content) {
    if (block.type !== 'text' || !block.citations) continue
    for (const citation of block.citations) {
      if (citation.type !== 'web_search_result_location') continue
      if (!cited.has(citation.url)) cited.set(citation.url, citation.cited_text)
    }
  }
  return cited
}

/** Every search result block in the message, with its position, so the last one can be found by index. */
function resultBlocks(message: Anthropic.Message): { index: number; block: Anthropic.WebSearchToolResultBlock }[] {
  return message.content.flatMap((block, index) =>
    block.type === 'web_search_tool_result' ? [{ index, block: block as Anthropic.WebSearchToolResultBlock }] : []
  )
}

/**
 * Reads one response. The answer is the text written after the last search result, because the text before it is
 * the model narrating the search it was about to run.
 */
function readResponse(message: Anthropic.Message, maxResults: number): BackendOutcome | { searched: SearchOutcome } {
  const blocks = resultBlocks(message)
  const good = blocks.filter(({ block }) => !isErrorContent(block.content))
  if (good.length === 0) {
    // Only a response with nothing to show for it is a failure: with `max_uses: 1` a second attempt the model makes
    // comes back as a `max_uses_exceeded` error block beside a search that already succeeded and was already paid for.
    const failed = blocks.find(({ block }) => isErrorContent(block.content))
    if (failed) {
      const code = (failed.block.content as Anthropic.WebSearchToolResultError).error_code
      logger.warn({ errorCode: code }, 'Anthropic web search reported an error')
      return failedSearch(code === 'too_many_requests' ? SEARCH_TEXT.quota : SEARCH_TEXT.failed)
    }
  }

  if (message.usage.server_tool_use?.web_search_requests === 0 || blocks.length === 0) {
    // No search ran, so the text is the model's own guess rather than a summary of anything it read.
    return { answer: SEARCH_TEXT.noSummary, results: [], resultCount: 0, succeeded: true }
  }

  const cited = citedText(message)
  const seen = new Set<string>()
  const results: { title: string; url: string; snippet: string }[] = []
  for (const { block } of good) {
    for (const result of searchResults(block.content)) {
      if (seen.has(result.url)) continue
      seen.add(result.url)
      results.push({ title: result.title, url: result.url, snippet: clipSnippet(cited.get(result.url) ?? '') })
    }
  }
  // Cited results first: those are the ones the answer was built on, and the cap can drop the ones after them.
  results.sort((left, right) => Number(cited.has(right.url)) - Number(cited.has(left.url)))

  const last = blocks.at(-1) as { index: number }
  const answer = message.content
    .slice(last.index + 1)
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    // Citations split one sentence across blocks, and the pieces carry their own spacing.
    .join('')
    .trim()
  return { searched: { answer: answer || SEARCH_TEXT.noSummary, results: results.slice(0, maxResults) } }
}

function params(route: ResolvedModel, call: NativeCall, messages: Params['messages']): Params {
  // The profile also carries Gemini's tool name; only an Anthropic route reaches this caller, so the cast is a
  // narrowing of the shared field rather than a claim about a Gemini route.
  const tool: Anthropic.WebSearchTool20250305['type'] = route.profile.nativeSearch
    ? (route.profile.nativeSearch.tool as Anthropic.WebSearchTool20250305['type'])
    : 'web_search_20250305'
  return {
    model: route.model,
    max_tokens: MAX_TOKENS,
    system: nativeSearchPrompt(call.topic),
    messages,
    // One search per call: the chat model can call search_web again when the attempt has time left.
    tools: [{ type: tool, name: 'web_search', max_uses: 1 }],
    ...thinkingParams({ ...route, effort: 'none' }, undefined)
  }
}

/** One request, budgeted and billed on its own, with the answer text and the search results it was built on. */
async function request(
  route: ResolvedModel,
  call: NativeCall,
  client: AnthropicMessagesClient,
  messages: Params['messages']
): Promise<{ message: Anthropic.Message; outcome: BackendOutcome | { searched: SearchOutcome } }> {
  const body = params(route, call, messages)
  const reservation = await startCall({
    provider: 'anthropic',
    model: route.model,
    workload: 'search',
    estTokens: requestTokenEstimate([body.system, call.query]),
    signal: call.signal
  })
  let message: Anthropic.Message
  try {
    message = await client.messages.create(body, { signal: call.signal })
  } catch (error) {
    // A search cut off after it reached the provider may still be billed, and a call that recorded nothing is
    // invisible to the monthly cap.
    if (call.signal.aborted) {
      const aborted = {
        provider: 'anthropic' as const,
        model: route.model,
        workload: 'search' as const,
        inputTokens: 0,
        outputTokens: 0,
        searchRequests: 1
      }
      recordUsage(aborted)
      reservation.release(aborted)
    } else {
      reservation.release()
    }
    throw error
  }
  const usage = callUsage(route.model, 'search', message.usage)
  recordUsage(usage)
  reservation.release(usage)
  if (message.stop_reason === 'refusal') {
    throw new ProviderError({ provider: 'anthropic', kind: 'refusal', message: 'Anthropic refused the search' })
  }
  return { message, outcome: readResponse(message, call.maxResults) }
}

export async function anthropicNativeSearch(
  route: ResolvedModel,
  call: NativeCall,
  client?: AnthropicMessagesClient
): Promise<BackendOutcome> {
  const messagesClient =
    client ??
    new Anthropic({ apiKey: route.apiKey, ...(route.baseUrl ? { baseURL: route.baseUrl } : {}), maxRetries: 0 })
  let messages: Params['messages'] = [{ role: 'user', content: call.query }]

  try {
    for (let pauses = 0; ; pauses += 1) {
      const { message, outcome } = await request(route, call, messagesClient, messages)
      // A pause whose search already failed has nothing left to resume: resending would pay for the same failure.
      // Only a failed outcome counts here, because a pause with no result block reads as a succeeded no-summary.
      if ('succeeded' in outcome && !outcome.succeeded) return outcome
      // A paused turn has not finished searching, so it is resumed before anything is read as an answer.
      if (message.stop_reason === 'pause_turn') {
        // Partial text is never returned as an answer, so a second pause is a failure rather than a thin summary.
        if (pauses >= MAX_PAUSES) {
          logger.warn({ model: route.model }, 'Anthropic web search paused again; giving up')
          return failedSearch(SEARCH_TEXT.failed)
        }
        // A paused turn resumes from the assistant content it stopped on, sent back unchanged. The response's
        // block union is wider than the request's, so the cast narrows it to what a request may carry.
        messages = [...messages, { role: 'assistant', content: message.content as unknown as Block[] }]
        continue
      }
      if ('succeeded' in outcome) return outcome
      return {
        answer: outcome.searched.answer,
        results: outcome.searched.results,
        resultCount: outcome.searched.results.length,
        succeeded: true
      }
    }
  } catch (error) {
    const failure = classifyAnthropicError(error)
    logger.warn({ kind: failure.kind, status: failure.status }, 'Anthropic native search failed')
    // A spent Anthropic account and a spent local minute both read as a quota wall, not as a fault.
    const quota = failure.kind === 'quota_exhausted' || failure.kind === 'billing_exhausted' || failure.status === 429
    return failedSearch(quota ? SEARCH_TEXT.quota : SEARCH_TEXT.failed)
  }
}
