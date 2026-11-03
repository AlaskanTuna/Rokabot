import '../tests/harness/env.js'
// Reads .env into process.env, so a real key is found without exporting it. The harness import above still owns
// GEMINI_API_KEY, which it sets to the harness key under --live.
import 'dotenv/config'
import { profileFor } from '../src/agent/llm/profiles.js'
import type { CallUsage } from '../src/agent/llm/usage.js'
import type { BackendOutcome, SearchWebParams } from '../src/agent/tools/search/types.js'
import type { ResolvedModel } from '../src/config.js'

/** How long one trial may take. The production attempt budget is 8 s; this measures the search itself. */
const TRIAL_TIMEOUT_MS = 60_000

/** The keys each backend reads its credential from. Never printed; only whether it is set. */
const KEY_ENV: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  exa: 'EXA_API_KEY'
}

/** The model each backend measures: a tested profile, so the native tool is the one the bot would send. */
const MODEL: Record<'anthropic' | 'gemini', string> = {
  anthropic: 'claude-haiku-5-5',
  gemini: 'gemini-3.5-flash-lite'
}

const QUERIES = [
  'What is the capital of Australia?',
  'How tall is Mount Fuji?',
  'When did the Berlin Wall fall?',
  'Who wrote the novel Norwegian Wood?',
  'What is the boiling point of water at sea level in Celsius?',
  'Which planet has the most moons?',
  'What year was the first iPhone released?',
  'How long is the English Channel tunnel?',
  'What is the currency of Switzerland?',
  'Who painted the ceiling of the Sistine Chapel?'
]

type Provider = 'anthropic' | 'gemini' | 'exa'

interface Options {
  provider: Provider
  trials: number
  model?: string
}

interface Trial {
  query: string
  trial: number
  elapsedMs: number
  succeeded: boolean
  resultCount: number
  firstUrl: string | null
  answerExcerpt: string
  usage: CallUsage | null
}

function parseOptions(args: string[]): Options {
  let provider: Provider | undefined
  let trials = 3
  let model: string | undefined

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--live') {
      // Read by tests/harness/env.ts, which picks the harness Gemini key from process.argv.
    } else if (argument === '--provider') {
      const value = args[++index]
      if (value !== 'anthropic' && value !== 'gemini' && value !== 'exa') {
        throw new Error('--provider must be anthropic, gemini or exa')
      }
      provider = value
    } else if (argument === '--model') {
      model = args[++index]
    } else if (argument === '--trials') {
      const value = Number(args[++index])
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('--trials must be a positive integer')
      trials = value
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!provider) throw new Error('--provider is required')
  return { provider, trials, model }
}

/** The route a native caller bills and reads its tool from. Exa is a plain HTTP backend and needs none. */
function nativeRoute(provider: 'anthropic' | 'gemini', override?: string): ResolvedModel {
  const model = override ?? MODEL[provider]
  const profile = profileFor(provider, model)
  if (!profile) throw new Error(`No ${provider} profile for ${model}`)
  return {
    key: 'measure',
    provider,
    model,
    profile,
    apiKey: process.env[KEY_ENV[provider]] ?? '',
    timeoutMs: TRIAL_TIMEOUT_MS,
    maxOutputTokens: 1024
  }
}

function requireKey(provider: Provider): void {
  if (!process.env[KEY_ENV[provider]]) {
    console.error(`Missing ${KEY_ENV[provider]} for a --provider ${provider} run`)
    process.exit(1)
  }
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)] ?? null
}

function describeUsage(usage: CallUsage | null): string {
  if (!usage) return 'usage=none'
  return (
    `inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} ` +
    `reasoningTokens=${usage.reasoningTokens ?? 0} searchRequests=${usage.searchRequests ?? 0}`
  )
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  requireKey(options.provider)
  process.env.LOG_LEVEL = 'error'

  const [{ anthropicNativeSearch }, { geminiNativeSearch }, { exaSearch }, { onUsage }] = await Promise.all([
    import('../src/agent/tools/search/nativeAnthropic.js'),
    import('../src/agent/tools/search/nativeGemini.js'),
    import('../src/agent/tools/search/exa.js'),
    import('../src/agent/llm/usage.js')
  ])

  const route = options.provider === 'exa' ? null : nativeRoute(options.provider, options.model)
  const outcomes: CallUsage[] = []
  const unsubscribe = onUsage((usage) => outcomes.push(usage))

  const run = async (query: string): Promise<BackendOutcome> => {
    const params: SearchWebParams = {
      query,
      topic: 'general',
      max_results: 5,
      signal: AbortSignal.timeout(TRIAL_TIMEOUT_MS)
    }
    if (options.provider === 'anthropic') {
      return anthropicNativeSearch(route as ResolvedModel, {
        query,
        topic: 'general',
        maxResults: 5,
        signal: params.signal as AbortSignal
      })
    }
    if (options.provider === 'gemini') {
      return geminiNativeSearch(route as ResolvedModel, {
        query,
        topic: 'general',
        maxResults: 5,
        signal: params.signal as AbortSignal
      })
    }
    return exaSearch(params)
  }

  const trials: Trial[] = []
  for (let trial = 0; trial < options.trials; trial++) {
    const query = QUERIES[trial % QUERIES.length] as string
    outcomes.length = 0
    const started = Date.now()
    let outcome: BackendOutcome
    try {
      outcome = await run(query)
    } catch (error) {
      outcome = {
        answer: error instanceof Error ? error.message : String(error),
        results: [],
        resultCount: 0,
        succeeded: false
      }
    }
    const record: Trial = {
      query,
      trial: trial + 1,
      elapsedMs: Date.now() - started,
      succeeded: outcome.succeeded,
      resultCount: outcome.resultCount,
      firstUrl: outcome.results[0]?.url ?? null,
      answerExcerpt: outcome.answer.slice(0, 200),
      usage: outcomes.at(-1) ?? null
    }
    trials.push(record)
    console.log(
      `[measure:native] ${options.provider} ${record.trial}/${options.trials} elapsedMs=${record.elapsedMs} ` +
        `succeeded=${record.succeeded} results=${record.resultCount} firstUrl=${record.firstUrl ?? 'none'}`
    )
    console.log(`  answer: ${record.answerExcerpt}`)
    console.log(`  ${describeUsage(record.usage)}`)
  }
  unsubscribe()

  const failures = trials.filter((trial) => !trial.succeeded)
  // A native trial the model answered from memory ran no search, so it says nothing about search latency.
  const searched = trials.filter(
    (trial) => trial.succeeded && (trial.usage === null || (trial.usage.searchRequests ?? 0) > 0)
  )
  const elapsed = searched.map((trial) => trial.elapsedMs).sort((left, right) => left - right)

  console.log(`\nNative search ${options.provider} summary`)
  console.log(`Failures ${failures.length}/${trials.length}`)
  console.log(`Searched ${searched.length}/${trials.length}`)
  console.log(
    `Searched trials p50 ${percentile(elapsed, 0.5) ?? 'n/a'} ms p95 ${percentile(elapsed, 0.95) ?? 'n/a'} ms`
  )
  if (failures.length > 0) process.exitCode = 1
}

await main()
