import { logger } from '../utils/logger.js'
import type { TurnJudgment } from './jev/judgments.js'
import { searchWeb } from './tools/searchWeb.js'

export const PREFETCH_TOOL_NAME = 'search_web'

const MAX_ANSWER_CHARS = 1200
const MAX_SOURCE_CHARS = 200
const MAX_BLOCK_CHARS = 2000
const MAX_SOURCES = 3

export type JevPrefetchMode = 'off' | 'shadow' | 'on'

export type PrefetchDecision = {
  fire: boolean
  reason: 'off' | 'below_threshold' | 'no_judgment' | 'no_noul' | 'fired' | 'shadow_would_fire'
}

export type PrefetchOutcome =
  | { status: 'ready'; text: string; sources: ReadonlyArray<{ title: string; url: string }> }
  | { status: 'empty' }
  | { status: 'failed'; error: string }
  | { status: 'aborted' }
  | { status: 'canceled' }

export interface PrefetchContext {
  mode: JevPrefetchMode
  minimumNoul: number
  channelId: string
}

export interface PrefetchResult {
  decision: PrefetchDecision
  outcome: PrefetchOutcome | null
}

export function decidePrefetch(
  judgment: TurnJudgment | null,
  mode: JevPrefetchMode,
  minimumNoul: number
): PrefetchDecision {
  if (mode === 'off') return { fire: false, reason: 'off' }
  if (!judgment) return { fire: false, reason: 'no_judgment' }
  if (judgment.needsLookup === null) return { fire: false, reason: 'no_noul' }
  if (judgment.needsLookup < minimumNoul) return { fire: false, reason: 'below_threshold' }
  return mode === 'on' ? { fire: true, reason: 'fired' } : { fire: false, reason: 'shadow_would_fire' }
}

export async function startSearchPrefetch(options: {
  query: string
  signal: AbortSignal
  search?: typeof searchWeb
}): Promise<PrefetchOutcome> {
  if (options.signal.aborted) return { status: 'canceled' }
  const run = options.search ?? searchWeb
  try {
    const result = await run({ query: options.query, signal: options.signal })
    if (options.signal.aborted) return { status: 'aborted' }
    if (result.resultCount === 0 || !result.answer || result.answer.trim() === 'No summary available.') {
      return { status: 'empty' }
    }
    return {
      status: 'ready',
      text: result.answer,
      sources: result.results.map(({ title, url }) => ({ title, url }))
    }
  } catch (error) {
    const name = (error as { name?: string }).name
    if (name === 'AbortError' || options.signal.aborted) return { status: 'aborted' }
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function buildLookedUpBlock(outcome: Extract<PrefetchOutcome, { status: 'ready' }>): string {
  const lines = [
    '## Looked It Up',
    'These are search results fetched for this message before you answered. Treat them as the source you should answer from, the same as when you call `search_web` yourself. If they are thin or off-topic, search again with `search_web`.',
    '',
    clip(outcome.text, MAX_ANSWER_CHARS)
  ]
  for (const source of outcome.sources.slice(0, MAX_SOURCES)) {
    lines.push(clip(`- ${source.title} — ${source.url}`, MAX_SOURCE_CHARS))
  }
  const block = lines.join('\n')
  return block.length > MAX_BLOCK_CHARS ? `${block.slice(0, MAX_BLOCK_CHARS - 1)}…` : block
}

export async function settlePrefetch<T>(prefetch: Promise<T> | undefined, waitMs: number): Promise<T | null> {
  if (!prefetch || waitMs <= 0) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const giveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs)
  })
  try {
    return await Promise.race([prefetch, giveUp])
  } catch {
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function runPrefetchForJudgment(
  judgment: TurnJudgment | null,
  context: PrefetchContext,
  options: { query: string; signal: AbortSignal; search?: typeof searchWeb }
): Promise<PrefetchResult> {
  const decision = decidePrefetch(judgment, context.mode, context.minimumNoul)
  if (!decision.fire) {
    if (context.mode !== 'off') {
      logger.info(
        {
          channelId: context.channelId,
          prefetchMode: context.mode,
          needsLookup: judgment?.needsLookup ?? null,
          threshold: context.minimumNoul,
          searched: false,
          status: decision.reason
        },
        'Jev search prefetch'
      )
    }
    return { decision, outcome: null }
  }
  const outcome = await startSearchPrefetch(options)
  logger.info(
    {
      channelId: context.channelId,
      prefetchMode: context.mode,
      needsLookup: judgment?.needsLookup ?? null,
      threshold: context.minimumNoul,
      searched: true,
      status: outcome.status,
      sources: outcome.status === 'ready' ? outcome.sources.length : 0
    },
    'Jev search prefetch'
  )
  return { decision, outcome }
}
