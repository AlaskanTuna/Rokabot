/**
 * Live check of a model profile (D12): one text reply, one tool call, one answer to a tool result and one JSON
 * object, plus whether thinking stayed off (or within tags). Supported providers: openai (OPENAI_API_KEY),
 * modelscope (MODELSCOPE_API_KEY), anthropic (ANTHROPIC_API_KEY), and gemini (GRAPHIFY_GEMINI_API_KEY or
 * DEV_GEMINI_API_KEY, never GEMINI_API_KEY). It spends real quota (Magicubes on ModelScope, dollars on OpenAI and
 * Anthropic, requests on Gemini), so it needs --live and refuses to run under CI. When every check passes, set
 * `verified: true` on the profile in src/agent/llm/profiles.ts.
 *
 * Usage: npx tsx scripts/probe-llm-profile.ts --live --model <model id> [--model <model id> ...]
 */
import { pathToFileURL } from 'node:url'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import type { Content } from '@google/genai'
import type { ModelProfile, ProviderId } from '../src/agent/llm/profiles.js'
import type { ResolvedModel } from '../src/config.js'

export interface ProbeCheck {
  check: 'text' | 'tool' | 'toolResult' | 'json'
  ok: boolean
  detail: string
  /** openai/modelscope: the reply showed thinking. anthropic/gemini: a think tag leaked into the visible text. */
  thinkingSeen: boolean
}

const USAGE = 'Usage: npx tsx scripts/probe-llm-profile.ts --live --model <model id> [--model <model id> ...]'

export function parseProbeArgs(argv: string[], env: Record<string, string | undefined>): { models: string[] } {
  if (env.CI) throw new Error('probe-llm-profile spends real provider quota and never runs in CI')
  if (!argv.includes('--live')) throw new Error(`Live probing requires --live. ${USAGE}`)
  const models: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--live') continue
    if (argument !== '--model') throw new Error(`Unknown argument: ${argument}. ${USAGE}`)
    const model = argv[++index]
    if (!model) throw new Error(`--model needs a model id. ${USAGE}`)
    models.push(model)
  }
  if (models.length === 0) throw new Error(`Name at least one --model. ${USAGE}`)
  return { models }
}

const TIME_TOOL = {
  functionDeclarations: [
    {
      name: 'get_current_time',
      description: 'Get the current time in an IANA timezone',
      parametersJsonSchema: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'IANA timezone, for example Asia/Tokyo' } },
        required: ['timezone'],
        additionalProperties: false
      }
    }
  ]
}

const CITY_SCHEMA = {
  type: 'object',
  properties: { city: { type: 'string' }, population: { type: 'integer' } },
  required: ['city', 'population'],
  additionalProperties: false
}

const TIME_QUESTION = 'What time is it in Tokyo right now? Use the tool.'
const TIME_CALL = { id: 'call_probe', name: 'get_current_time' }
// The turn as ADK hands it back after running the tool, so the result goes through the adapter's own pairing.
const TIME_ROUND_TRIP: Content[] = [
  { role: 'model', parts: [{ functionCall: { ...TIME_CALL, args: { timezone: 'Asia/Tokyo' } } }] },
  { role: 'user', parts: [{ functionResponse: { ...TIME_CALL, response: { time: '2026-10-11T21:00:00+09:00' } } }] }
]

// Gemini 3 rejects a replayed function call that lacks the thought signature it issued, so a Gemini probe answers the
// model's own call from the tool check instead of TIME_ROUND_TRIP's hand-built one.
function roundTripFrom(turn: Content): Content[] {
  const first = turn.parts?.findIndex((part) => part.functionCall) ?? -1
  const call = turn.parts?.[first]?.functionCall
  return [
    { role: 'model', parts: (turn.parts ?? []).filter((part, index) => !part.functionCall || index === first) },
    {
      role: 'user',
      parts: [{ functionResponse: { id: call?.id, name: call?.name, response: { time: '2026-10-11T21:00:00+09:00' } } }]
    }
  ]
}

function probeRequest(text: string, config: Record<string, unknown> = {}, turn: Content[] = []): LlmRequest {
  return {
    model: 'probe',
    contents: [{ role: 'user', parts: [{ text }] }, ...turn],
    config: { maxOutputTokens: 200, ...config },
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

function textOf(response: LlmResponse): string {
  return (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
}

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** Servers signal thinking differently: a reasoning field, a think tag left in the text, or billed reasoning tokens. */
export function thinkingIn(body: unknown): boolean {
  const reply = body as
    | {
        choices?: Array<{ message?: Record<string, unknown> }>
        usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } }
      }
    | undefined
  const message = reply?.choices?.[0]?.message
  const reasoningTokens = reply?.usage?.completion_tokens_details?.reasoning_tokens
  return (
    isFilled(message?.reasoning_content) ||
    isFilled(message?.reasoning) ||
    (typeof message?.content === 'string' && /<\/?think>/i.test(message.content)) ||
    (typeof reasoningTokens === 'number' && reasoningTokens > 0)
  )
}

export function hasThinkingTag(text: string): boolean {
  return /<\/?think(?:ing)?\b/i.test(text)
}

export function thinkingSeenFor(provider: ProviderId, visibleText: string, rawBody: unknown): boolean {
  if (provider === 'anthropic' || provider === 'gemini') {
    return hasThinkingTag(visibleText)
  }
  return thinkingIn(rawBody)
}

function isTimeZone(value: unknown): boolean {
  if (!isFilled(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value as string })
    return true
  } catch {
    return false
  }
}

function judgeText(response: LlmResponse): string | null {
  return textOf(response).trim() ? null : 'empty reply'
}

function judgeTool(response: LlmResponse): string | null {
  const call = response.content?.parts?.find((part) => part.functionCall)?.functionCall
  if (!call) return `no tool call; replied "${textOf(response).slice(0, 120)}"`
  if (call.name !== 'get_current_time' || !isTimeZone(call.args?.timezone)) {
    return `unexpected call ${JSON.stringify(call).slice(0, 200)}`
  }
  return null
}

function judgeToolResult(response: LlmResponse): string | null {
  const call = response.content?.parts?.find((part) => part.functionCall)?.functionCall
  return call ? `called the tool again: ${JSON.stringify(call).slice(0, 200)}` : judgeText(response)
}

function judgeJson(response: LlmResponse): string | null {
  const text = textOf(response)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return `not JSON: ${text.slice(0, 200)}`
  }
  const object = value as { city?: unknown; population?: unknown } | null
  return typeof object?.city === 'string' && Number.isInteger(object?.population)
    ? null
    : `wrong shape: ${text.slice(0, 200)}`
}

/** `takeBody` returns the last raw reply body and forgets it, so a failed call never reports an earlier one. */
export async function probeProfile(
  llm: BaseLlm,
  provider: ProviderId,
  takeBody: () => unknown = () => undefined
): Promise<ProbeCheck[]> {
  const cases: Array<[ProbeCheck['check'], LlmRequest, (response: LlmResponse) => string | null]> = [
    ['text', probeRequest('Reply with the single word: pong'), judgeText],
    ['tool', probeRequest(TIME_QUESTION, { tools: [TIME_TOOL] }), judgeTool],
    ['toolResult', probeRequest(TIME_QUESTION, { tools: [TIME_TOOL] }, TIME_ROUND_TRIP), judgeToolResult],
    [
      'json',
      probeRequest('Give the city Kyoto and its population as a JSON object.', { responseJsonSchema: CITY_SCHEMA }),
      judgeJson
    ]
  ]
  const checks: ProbeCheck[] = []
  let toolTurn: Content | undefined
  for (const [check, llmRequest, judge] of cases) {
    let problem: string | null = 'no response'
    let visibleText = ''
    const request =
      check === 'toolResult' && provider === 'gemini' && toolTurn
        ? probeRequest(TIME_QUESTION, { tools: [TIME_TOOL] }, roundTripFrom(toolTurn))
        : llmRequest
    try {
      for await (const response of llm.generateContentAsync(request)) {
        visibleText += textOf(response)
        if (check === 'tool' && response.content?.parts?.some((part) => part.functionCall)) toolTurn = response.content
        problem = judge(response)
      }
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error)
    }
    checks.push({
      check,
      ok: problem === null,
      detail: problem ?? 'ok',
      thinkingSeen: thinkingSeenFor(provider, visibleText, takeBody())
    })
  }
  return checks
}

export function renderProbeReport(model: string, checks: ProbeCheck[]): { text: string; ready: boolean } {
  const ready = checks.length === 4 && checks.every((check) => check.ok && !check.thinkingSeen)
  const lines = [
    model,
    ...checks.map(
      (check) =>
        `  ${check.check.padEnd(10)}  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.thinkingSeen ? 'thinking ON ' : 'thinking off'}  ${check.detail}`
    ),
    ready
      ? '  ready: set verified: true on this profile in src/agent/llm/profiles.ts'
      : '  not ready: keep verified: false'
  ]
  return { text: lines.join('\n'), ready }
}

export const SUPPORTED_PROVIDERS: readonly ProviderId[] = ['gemini', 'anthropic', 'openai', 'modelscope']

export function isSupportedProfile(profile: ModelProfile): boolean {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(profile.provider)
}

export function resolveProbeKey(
  provider: ProviderId,
  env: Record<string, string | undefined>
): { apiKey?: string; keyName: string } {
  switch (provider) {
    case 'openai':
      return { apiKey: env.OPENAI_API_KEY, keyName: 'OPENAI_API_KEY' }
    case 'modelscope':
      return { apiKey: env.MODELSCOPE_API_KEY, keyName: 'MODELSCOPE_API_KEY' }
    case 'anthropic':
      return { apiKey: env.ANTHROPIC_API_KEY, keyName: 'ANTHROPIC_API_KEY' }
    case 'gemini': {
      if (env.GRAPHIFY_GEMINI_API_KEY) {
        return { apiKey: env.GRAPHIFY_GEMINI_API_KEY, keyName: 'GRAPHIFY_GEMINI_API_KEY' }
      }
      if (env.DEV_GEMINI_API_KEY) {
        return { apiKey: env.DEV_GEMINI_API_KEY, keyName: 'DEV_GEMINI_API_KEY' }
      }
      return { apiKey: undefined, keyName: 'GRAPHIFY_GEMINI_API_KEY or DEV_GEMINI_API_KEY' }
    }
  }
}

async function main(): Promise<number> {
  const { models } = parseProbeArgs(process.argv.slice(2), process.env)
  await import('dotenv/config')
  process.env.DISCORD_TOKEN ||= 'probe-unused'
  process.env.DISCORD_CLIENT_ID ||= 'probe-unused'
  process.env.GEMINI_API_KEY ||= 'probe-unused'
  process.env.ROKABOT_DB_PATH = ':memory:'
  process.env.LOG_LEVEL = 'error'
  const [{ createLlm }, { MODEL_PROFILES }] = await Promise.all([
    import('../src/agent/llm/createModel.js'),
    import('../src/agent/llm/profiles.js')
  ])

  let allReady = true
  for (const model of models) {
    const profile = MODEL_PROFILES.find((candidate) => candidate.model === model)
    if (!profile || !isSupportedProfile(profile)) {
      process.stderr.write(`${model}: no supported profile in src/agent/llm/profiles.ts\n`)
      allReady = false
      continue
    }
    const { apiKey, keyName } = resolveProbeKey(profile.provider, process.env)
    if (!apiKey) {
      process.stderr.write(`${model}: ${keyName} is not set\n`)
      allReady = false
      continue
    }
    let lastBody: unknown
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = async (input, init) => {
        const response = await originalFetch(input, init)
        lastBody = await response
          .clone()
          .json()
          .catch(() => undefined)
        return response
      }
      const takeBody = () => {
        const body = lastBody
        lastBody = undefined
        return body
      }
      const resolved: ResolvedModel = {
        key: 'probe',
        provider: profile.provider,
        model: profile.model,
        profile,
        apiKey,
        timeoutMs: 60_000,
        maxOutputTokens: profile.maxOutputTokens,
        effort: profile.thinking.defaultEffort
      }
      const llm = createLlm(resolved)
      const report = renderProbeReport(model, await probeProfile(llm, profile.provider, takeBody))
      process.stdout.write(`${report.text}\n`)
      allReady &&= report.ready
    } finally {
      globalThis.fetch = originalFetch
    }
  }
  return allReady ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
