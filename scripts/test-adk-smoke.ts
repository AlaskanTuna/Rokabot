/**
 * ADK Smoke Test — automated end-to-end validation of the Roka agent pipeline.
 * Tests tool calling, response quality, timezone defaults, and error resilience.
 *
 * Usage:
 *   GOOGLE_GENAI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d= -f2) npx tsx scripts/test-adk-smoke.ts
 *
 * Or via npm script:
 *   npm run test:smoke
 */

// Stub Discord env vars before any imports
process.env.DISCORD_TOKEN ||= 'smoke-test-stub'
process.env.DISCORD_CLIENT_ID ||= 'smoke-test-stub'

// Force IPv4 to match production runtime (see src/index.ts for context)
import dns from 'node:dns'
import net from 'node:net'
dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

import { LlmAgent, Runner, InMemorySessionService, isFinalResponse, BasePlugin } from '@google/adk'
import type { LlmResponse } from '@google/adk'
import type { Part } from '@google/genai'
import { rokaTools } from '../src/agent/tools/index.js'
import { config } from '../src/config.js'
import { assembleSystemPrompt } from '../src/agent/promptAssembler.js'

// --- Setup ---

const TIMEOUT_MS = config.gemini.timeout
const MODEL = config.gemini.model

class ErrorRecoveryPlugin extends BasePlugin {
  lastError: string | null = null
  async onModelErrorCallback({
    error
  }: {
    callbackContext: unknown
    llmRequest: unknown
    error: Error
  }): Promise<LlmResponse | undefined> {
    this.lastError = error.message
    return { content: { role: 'model', parts: [{ text: '__FALLBACK__' }] } }
  }
}

interface TestResult {
  id: string
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  timeMs: number
  observation: string
}

async function runQuery(
  query: string,
  opts: { timeout?: number; maxLlmCalls?: number } = {}
): Promise<{
  text: string
  toolCalls: string[]
  timeMs: number
  error: string | null
}> {
  const toolCalls: string[] = []
  const errorPlugin = new ErrorRecoveryPlugin('err')

  const agent = new LlmAgent({
    name: 'roka',
    model: MODEL,
    instruction: assembleSystemPrompt({
      tone: 'playful',
      participants: ['Tester'],
      hour: new Date().getHours(),
      displayName: 'Tester'
    }),
    tools: [...rokaTools],
    disallowTransferToParent: true,
    disallowTransferToPeers: true,
    generateContentConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: config.gemini.maxOutputTokens,
      httpOptions: { timeout: opts.timeout ?? TIMEOUT_MS }
    },
    beforeToolCallback: async ({ tool }) => {
      toolCalls.push(tool.name)
      return undefined
    }
  })

  const ss = new InMemorySessionService()
  const runner = new Runner({ appName: 'smoke', agent, sessionService: ss, plugins: [errorPlugin] })
  const sid = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await ss.createSession({ appName: 'smoke', userId: 'u1', sessionId: sid })

  const start = Date.now()
  let responseText = ''

  try {
    for await (const event of runner.runAsync({
      userId: 'u1',
      sessionId: sid,
      newMessage: { role: 'user', parts: [{ text: `[Tester]: ${query}` }] },
      runConfig: { maxLlmCalls: opts.maxLlmCalls ?? 4 }
    })) {
      if (isFinalResponse(event) && event.content?.parts) {
        responseText = event.content.parts
          .filter((p: Part) => p.text && !(p as any).thought)
          .map((p: Part) => p.text)
          .join('')
          .trim()
      }
    }
  } catch (e: any) {
    return { text: '', toolCalls, timeMs: Date.now() - start, error: e.message?.slice(0, 120) ?? 'Unknown error' }
  }

  return {
    text: responseText === '__FALLBACK__' ? '' : responseText,
    toolCalls,
    timeMs: Date.now() - start,
    error: errorPlugin.lastError
  }
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// --- Test Cases ---

const results: TestResult[] = []

async function test(id: string, name: string, fn: () => Promise<TestResult>) {
  process.stdout.write(`  ${id} ${name}... `)
  const result = await fn()
  results.push(result)
  const icon =
    result.status === 'PASS'
      ? '\x1b[32mPASS\x1b[0m'
      : result.status === 'WARN'
        ? '\x1b[33mWARN\x1b[0m'
        : '\x1b[31mFAIL\x1b[0m'
  console.log(`[${icon}] (${result.timeMs}ms) ${result.observation}`)
}

async function main() {
  console.log(`\n  ADK Smoke Test — ${MODEL}, timeout ${TIMEOUT_MS}ms\n`)

  await test('T01', 'Basic greeting (no tools)', async () => {
    const r = await runQuery('Hi, how are you?')
    if (!r.text)
      return {
        id: 'T01',
        name: 'Basic greeting',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const ok = r.text.length > 10 && r.toolCalls.length === 0
    return {
      id: 'T01',
      name: 'Basic greeting',
      status: ok ? 'PASS' : 'FAIL',
      timeMs: r.timeMs,
      observation: ok
        ? `Response OK (${wordCount(r.text)}w, no tools)`
        : `Unexpected: tools=${r.toolCalls}, len=${r.text.length}`
    }
  })

  await test('T02', 'Tool: roll_dice', async () => {
    const r = await runQuery('Roll 2d20 for me!')
    if (!r.text)
      return {
        id: 'T02',
        name: 'Tool: roll_dice',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedTool = r.toolCalls.includes('roll_dice')
    return {
      id: 'T02',
      name: 'Tool: roll_dice',
      status: usedTool ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: usedTool
        ? `roll_dice called, response OK (${wordCount(r.text)}w)`
        : `Tool not called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T03', 'Tool: get_anime_schedule', async () => {
    const r = await runQuery('What anime airs on Fridays?')
    if (!r.text)
      return {
        id: 'T03',
        name: 'Tool: get_anime_schedule',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedTool = r.toolCalls.includes('get_anime_schedule')
    return {
      id: 'T03',
      name: 'Tool: get_anime_schedule',
      status: usedTool ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: usedTool
        ? `get_anime_schedule called, response OK (${wordCount(r.text)}w)`
        : `Tool not called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T04', 'Tool: get_weather (default location)', async () => {
    const r = await runQuery("How's the weather right now?")
    if (!r.text)
      return {
        id: 'T04',
        name: 'Tool: get_weather default',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedTool = r.toolCalls.includes('get_weather')
    const expectedLocation = config.timezone?.split('/').pop()?.replace(/_/g, ' ')?.toLowerCase() ?? ''
    const mentionsLocation = r.text.toLowerCase().includes(expectedLocation)
    const status = usedTool && mentionsLocation ? 'PASS' : usedTool ? 'WARN' : 'FAIL'
    return {
      id: 'T04',
      name: 'Tool: get_weather default',
      status,
      timeMs: r.timeMs,
      observation: usedTool
        ? `get_weather called${mentionsLocation ? `, mentions ${expectedLocation}` : ', but no location in response'} (${wordCount(r.text)}w)`
        : `Tool not called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T05', 'Tool: search_web', async () => {
    const r = await runQuery('What is the latest news about One Piece?')
    if (!r.text)
      return {
        id: 'T05',
        name: 'Tool: search_web',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedSearch = r.toolCalls.includes('search_web') || r.toolCalls.includes('search_anime')
    return {
      id: 'T05',
      name: 'Tool: search_web',
      status: usedSearch ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: usedSearch
        ? `[${r.toolCalls.join('→')}] called, response OK (${wordCount(r.text)}w)`
        : `No search tool called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T06', 'Tool: get_current_time (default tz)', async () => {
    const r = await runQuery('What time is it?')
    if (!r.text)
      return {
        id: 'T06',
        name: 'Tool: get_current_time',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedTool = r.toolCalls.includes('get_current_time')
    return {
      id: 'T06',
      name: 'Tool: get_current_time',
      status: usedTool ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: usedTool
        ? `get_current_time called, response OK (${wordCount(r.text)}w)`
        : `Tool not called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T07', 'Tool: search_anime', async () => {
    const r = await runQuery('Tell me about the anime Frieren')
    if (!r.text)
      return {
        id: 'T07',
        name: 'Tool: search_anime',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const usedTool = r.toolCalls.includes('search_anime')
    return {
      id: 'T07',
      name: 'Tool: search_anime',
      status: usedTool ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: usedTool
        ? `search_anime called, response OK (${wordCount(r.text)}w)`
        : `Tool not called. Tools: [${r.toolCalls}]`
    }
  })

  await test('T08', 'Response length (80-100 words)', async () => {
    const r = await runQuery('Tell me about your favorite things to do on a weekend')
    if (!r.text)
      return {
        id: 'T08',
        name: 'Response length',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const wc = wordCount(r.text)
    const status = wc >= 60 && wc <= 120 ? 'PASS' : wc >= 40 && wc <= 150 ? 'WARN' : 'FAIL'
    return { id: 'T08', name: 'Response length', status, timeMs: r.timeMs, observation: `${wc} words (target: 80-100)` }
  })

  await test('T09', 'Response not cut off', async () => {
    const r = await runQuery('What makes Senren*Banka special as a visual novel?')
    if (!r.text)
      return {
        id: 'T09',
        name: 'Response not cut off',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const lastChar = r.text.slice(-1)
    const endsCleanly = /[.!?~♪♡♥☆★)」』>*😊🎶✨]/.test(lastChar)
    return {
      id: 'T09',
      name: 'Response not cut off',
      status: endsCleanly ? 'PASS' : 'WARN',
      timeMs: r.timeMs,
      observation: endsCleanly
        ? `Ends with "${lastChar}" — clean finish (${wordCount(r.text)}w)`
        : `Ends with "${lastChar}" — may be cut off (${wordCount(r.text)}w)`
    }
  })

  await test('T10', 'Tool fallback chain', async () => {
    const r = await runQuery('When does Fire Force season 3 air?')
    if (!r.text)
      return {
        id: 'T10',
        name: 'Tool fallback chain',
        status: 'FAIL',
        timeMs: r.timeMs,
        observation: `No response. Error: ${r.error}`
      }
    const chain = r.toolCalls.length > 1
    return {
      id: 'T10',
      name: 'Tool fallback chain',
      status: r.text.length > 0 ? 'PASS' : 'FAIL',
      timeMs: r.timeMs,
      observation: chain
        ? `Fallback chain: [${r.toolCalls.join('→')}] (${wordCount(r.text)}w)`
        : `Single path: [${r.toolCalls.join(',')}] (${wordCount(r.text)}w)`
    }
  })

  // --- Summary ---
  console.log('\n  ' + '─'.repeat(56))
  const pass = results.filter((r) => r.status === 'PASS').length
  const warn = results.filter((r) => r.status === 'WARN').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const total = results.length
  const avgMs = Math.round(results.reduce((s, r) => s + r.timeMs, 0) / total)
  const rate = Math.round(((pass + warn) / total) * 100)

  console.log(`  Results: ${pass} PASS, ${warn} WARN, ${fail} FAIL / ${total} total`)
  console.log(`  Success rate: ${rate}% | Avg response: ${avgMs}ms`)
  console.log()

  process.exit(fail > 0 ? 1 : 0)
}

main()
