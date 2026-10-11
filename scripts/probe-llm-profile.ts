/**
 * Live check of a Chat Completions model profile (D12): one text reply, one tool call and one JSON object, plus whether
 * thinking stayed off. It spends real quota (Magicubes on ModelScope, dollars on OpenAI), so it needs --live and
 * refuses to run under CI. When every check passes, set `verified: true` on the profile in src/agent/llm/profiles.ts.
 *
 * Usage: npx tsx scripts/probe-llm-profile.ts --live --model Qwen/Qwen3.5-35B-A3B [--model <model id> ...]
 */
import { pathToFileURL } from 'node:url'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import type { ChatCompletionsProvider } from '../src/agent/llm/chatCompletionsLlm.js'
import type { ModelProfile } from '../src/agent/llm/profiles.js'

export interface ProbeCheck {
  check: 'text' | 'tool' | 'json'
  ok: boolean
  detail: string
  /** The reply carried reasoning_content, so the profile's thinking-off setting did not hold. */
  thinkingSeen: boolean
}

const USAGE = 'Usage: npx tsx scripts/probe-llm-profile.ts --live --model <model id> [--model <model id>]'

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

function probeRequest(text: string, config: Record<string, unknown> = {}): LlmRequest {
  return {
    model: 'probe',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { maxOutputTokens: 200, ...config },
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

function textOf(response: LlmResponse): string {
  return (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
}

function thinkingIn(body: unknown): boolean {
  const reasoning = (body as { choices?: Array<{ message?: { reasoning_content?: unknown } }> } | undefined)
    ?.choices?.[0]?.message?.reasoning_content
  return typeof reasoning === 'string' && reasoning.trim().length > 0
}

function judgeText(response: LlmResponse): string | null {
  return textOf(response).trim() ? null : 'empty reply'
}

function judgeTool(response: LlmResponse): string | null {
  const call = response.content?.parts?.find((part) => part.functionCall)?.functionCall
  if (!call) return `no tool call; replied "${textOf(response).slice(0, 120)}"`
  if (call.name !== 'get_current_time' || typeof call.args?.timezone !== 'string') {
    return `unexpected call ${JSON.stringify(call).slice(0, 200)}`
  }
  return null
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
export async function probeProfile(llm: BaseLlm, takeBody: () => unknown): Promise<ProbeCheck[]> {
  const cases: Array<[ProbeCheck['check'], LlmRequest, (response: LlmResponse) => string | null]> = [
    ['text', probeRequest('Reply with the single word: pong'), judgeText],
    ['tool', probeRequest('What time is it in Tokyo right now? Use the tool.', { tools: [TIME_TOOL] }), judgeTool],
    [
      'json',
      probeRequest('Give the city Kyoto and its population as a JSON object.', { responseJsonSchema: CITY_SCHEMA }),
      judgeJson
    ]
  ]
  const checks: ProbeCheck[] = []
  for (const [check, llmRequest, judge] of cases) {
    let problem: string | null = 'no response'
    try {
      for await (const response of llm.generateContentAsync(llmRequest)) problem = judge(response)
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error)
    }
    checks.push({ check, ok: problem === null, detail: problem ?? 'ok', thinkingSeen: thinkingIn(takeBody()) })
  }
  return checks
}

export function renderProbeReport(model: string, checks: ProbeCheck[]): { text: string; ready: boolean } {
  const ready = checks.length === 3 && checks.every((check) => check.ok && !check.thinkingSeen)
  const lines = [
    model,
    ...checks.map(
      (check) =>
        `  ${check.check.padEnd(4)}  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.thinkingSeen ? 'thinking ON ' : 'thinking off'}  ${check.detail}`
    ),
    ready
      ? '  ready: set verified: true on this profile in src/agent/llm/profiles.ts'
      : '  not ready: keep verified: false'
  ]
  return { text: lines.join('\n'), ready }
}

const KEY_NAMES: Record<ChatCompletionsProvider, string> = {
  openai: 'OPENAI_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY'
}

function isChatCompletionsProfile(
  profile: ModelProfile
): profile is ModelProfile & { provider: ChatCompletionsProvider } {
  return profile.provider === 'openai' || profile.provider === 'modelscope'
}

async function main(): Promise<number> {
  const { models } = parseProbeArgs(process.argv.slice(2), process.env)
  await import('dotenv/config')
  process.env.DISCORD_TOKEN ||= 'probe-unused'
  process.env.DISCORD_CLIENT_ID ||= 'probe-unused'
  process.env.GEMINI_API_KEY ||= 'probe-unused'
  process.env.ROKABOT_DB_PATH = ':memory:'
  process.env.LOG_LEVEL = 'error'
  const [{ ChatCompletionsLlm }, { MODEL_PROFILES }] = await Promise.all([
    import('../src/agent/llm/chatCompletionsLlm.js'),
    import('../src/agent/llm/profiles.js')
  ])

  let allReady = true
  for (const model of models) {
    const profile = MODEL_PROFILES.find((candidate) => candidate.model === model)
    if (!profile || !isChatCompletionsProfile(profile)) {
      process.stderr.write(`${model}: no openai or modelscope profile in src/agent/llm/profiles.ts\n`)
      allReady = false
      continue
    }
    const keyName = KEY_NAMES[profile.provider]
    const apiKey = process.env[keyName]
    if (!apiKey) {
      process.stderr.write(`${model}: ${keyName} is not set\n`)
      allReady = false
      continue
    }
    let lastBody: unknown
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
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
    const llm = new ChatCompletionsLlm({
      provider: profile.provider,
      model,
      apiKey,
      timeoutMs: 60_000,
      profile,
      fetchImpl
    })
    const report = renderProbeReport(model, await probeProfile(llm, takeBody))
    process.stdout.write(`${report.text}\n`)
    allReady &&= report.ready
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
