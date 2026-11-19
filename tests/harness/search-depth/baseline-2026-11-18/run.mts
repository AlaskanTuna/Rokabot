// Baseline search eval: runs each case through the real runModelTurn with live Haiku + Exa.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const dotenv = await import(new URL('../../../../node_modules/dotenv/lib/main.js', import.meta.url).href)

const REPO = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '')
const parsed = dotenv.parse(readFileSync(`${REPO}/.env`))
process.env.ROKABOT_DB_PATH = ':memory:'
process.env.DISCORD_TOKEN = 'harness-discord-token'
process.env.DISCORD_CLIENT_ID = 'harness-discord-client-id'
process.env.SEARCH_PROVIDER = 'exa' // production backend
process.env.ROKABOT_FIXED_HOUR ??= '14'
for (const k of ['ANTHROPIC_API_KEY', 'EXA_API_KEY', 'TYPESAFE_API_KEY', 'MODELSCOPE_API_KEY', 'OPENAI_API_KEY']) {
  if (parsed[k]) process.env[k] = parsed[k]
}
process.env.GEMINI_API_KEY = parsed.GRAPHIFY_GEMINI_API_KEY // never the production Gemini key
process.env.GOOGLE_GENAI_API_KEY = parsed.GRAPHIFY_GEMINI_API_KEY
// biome-ignore lint/performance/noDelete: assigning undefined would leave the string "undefined" as a key
delete process.env.TAVILY_API_KEY

// Record provider payloads without changing behaviour. The response is cloned before reading, so the
// caller still receives an untouched body.
type Exchange = {
  provider: 'exa' | 'tavily' | 'jikan'
  method: string
  url: string
  requestBody: unknown
  status: number | null
  responseBody: unknown
  error?: string
}
type Call = { api: string; detail: string }
let calls: Call[] = []
let exchanges: Exchange[] = []

function providerFor(url: string): Exchange['provider'] | null {
  if (url.includes('api.exa.ai')) return 'exa'
  if (url.includes('api.tavily.com')) return 'tavily'
  if (url.includes('api.jikan.moe')) return 'jikan'
  return null
}

function requestQuery(url: string, provider: Exchange['provider'], rawBody: unknown): string {
  if (provider === 'jikan') return url.replace(/^https?:\/\/[^/]+/, '')
  if (typeof rawBody === 'string') {
    try {
      const parsedBody = JSON.parse(rawBody) as { query?: unknown }
      if (typeof parsedBody.query === 'string') return parsedBody.query
    } catch {
      return rawBody
    }
  }
  return url
}

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const provider = providerFor(url)
  if (!provider) return realFetch(input, init)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  let requestBody: unknown = null
  if (typeof init?.body === 'string') {
    try {
      requestBody = JSON.parse(init.body)
    } catch {
      requestBody = init.body
    }
  }
  calls.push({ api: provider, detail: requestQuery(url, provider, init?.body) })
  try {
    const response = await realFetch(input, init)
    let responseBody: unknown = null
    try {
      responseBody = await response.clone().json()
    } catch {
      responseBody = null
    }
    exchanges.push({ provider, method, url, requestBody, status: response.status, responseBody })
    return response
  } catch (error) {
    exchanges.push({ provider, method, url, requestBody, status: null, responseBody: null, error: String(error) })
    throw error
  }
}) as typeof fetch

// The search_web arguments the model actually sent, in call order. The tool object is shared with the
// agent, so wrapping its execute before the agent runs records every call, including fields,
// local_query and source — which the provider request bodies never carry.
const { searchWebTool } = await import(`${REPO}/src/agent/tools/index.ts`)
type RecordedCall = { tool: string; args?: Record<string, unknown> }
let recordedToolCalls: RecordedCall[] = []
const originalExecute = searchWebTool.execute.bind(searchWebTool)
searchWebTool.execute = (async (input: unknown, context?: unknown) => {
  const params = (input ?? {}) as Record<string, unknown>
  const args: Record<string, unknown> = {}
  for (const key of ['query', 'topic', 'max_results', 'fields', 'local_query', 'source']) {
    if (params[key] !== undefined) args[key] = params[key]
  }
  recordedToolCalls.push({ tool: 'search_web', args })
  return originalExecute(input as never, context as never)
}) as typeof searchWebTool.execute

const { seedWorld } = await import(`${REPO}/tests/harness/toolTrigger.ts`)
const { runModelTurn } = await import(`${REPO}/src/discord/turnPipeline.ts`)
const { destroySession } = await import(`${REPO}/src/agent/session.ts`)

const header = {
  type: 'header',
  tool: 'search_web',
  guildId: 'eval-guild',
  members: [{ id: 'sora', username: 'sora', displayName: 'Sora' }],
  claims: [],
  history: [{ speakerId: 'sora', content: 'hey roka' }]
}

// Positional args stay compatible: filter, then output file. --record <dir> writes one fixture per case.
const positionals: string[] = []
let recordDir: string | null = null
const rawArgs = process.argv.slice(2)
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--record') {
    recordDir = rawArgs[++i] ?? null
  } else {
    positionals.push(rawArgs[i])
  }
}
const only = positionals[0] ? positionals[0].split(',') : undefined
const out = positionals[1] ?? 'results.jsonl'
if (recordDir) mkdirSync(recordDir, { recursive: true })

// The model's own tool calls come from the wrapped execute above; other tools keep their bare names.
// Exa /contents and Tavily /extract payloads ride along in the exchanges for the replay to read from.
function toolCallsFor(toolsUsed: string[], recorded: RecordedCall[]): RecordedCall[] {
  let webIndex = 0
  return toolsUsed.flatMap((tool) => {
    if (tool !== 'search_web') return [{ tool }]
    const args = recorded[webIndex++]?.args
    return args && Object.keys(args).length > 0 ? [{ tool, args }] : [{ tool }]
  })
}

const cases = readFileSync('cases.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((c) => !only || only.includes(c.id))

for (const c of cases) {
  const channelId = `eval-${c.id}-${Date.now()}`
  await seedWorld(header, channelId)
  calls = []
  exchanges = []
  recordedToolCalls = []
  const started = Date.now()
  try {
    const turn = await runModelTurn({
      channelId,
      guildId: 'eval-guild',
      userMessage: c.message,
      displayName: 'Sora',
      username: 'sora',
      userId: 'sora',
      memory: true,
      asksAboutReplies: false
    })
    appendFileSync(
      out,
      JSON.stringify({
        ...c,
        elapsedMs: Date.now() - started,
        toolsUsed: turn.toolsUsed,
        calls,
        citations: turn.sources.map((x: { url: string }) => x.url),
        outcome: turn.metrics.outcome,
        kind: turn.metrics.kind,
        text: turn.text
      }) + '\n'
    )
    if (recordDir) {
      writeFileSync(
        join(recordDir, `${c.id}.json`),
        JSON.stringify(
          {
            caseId: c.id,
            recordedAt: new Date().toISOString(),
            commit: process.env.RECORD_COMMIT ?? null,
            toolCalls: toolCallsFor(turn.toolsUsed, recordedToolCalls),
            exchanges
          },
          null,
          2
        ) + '\n'
      )
    }
    console.log(
      `${c.id} ${turn.metrics.outcome} ${Date.now() - started}ms tools=${turn.toolsUsed.join(',')} calls=${calls.length}`
    )
  } catch (e) {
    appendFileSync(out, JSON.stringify({ ...c, error: String(e) }) + '\n')
    console.log(`${c.id} THREW ${String(e).slice(0, 200)}`)
  } finally {
    await destroySession(channelId)
  }
  await new Promise((r) => setTimeout(r, 3000))
}
process.exit(0)
