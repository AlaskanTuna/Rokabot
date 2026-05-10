/**
 * Side-by-side comparison: gemini-3.1-flash-lite-preview vs gemini-3.1-flash-lite (GA).
 *
 * Runs an identical battery of prompts (text-only, single-tool, multi-turn-with-tool,
 * passive-buffer-style memory probe) against each model using the same ADK Runner
 * setup the bot uses, and reports per-model success / fallback / error counts.
 *
 * Usage:
 *   npx tsx scripts/test-gemini-ga-compare.ts
 *   ITERATIONS=5 npx tsx scripts/test-gemini-ga-compare.ts
 */

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

const MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite']
const ITERATIONS = Number(process.env.ITERATIONS ?? 3)
const TIMEOUT_MS = config.gemini.timeout

interface RunOutcome {
  text: string
  toolCalls: string[]
  finalEventCount: number
  totalEventCount: number
  lastFinalPartKeys: string[][]
  errorCaught: string | null
  errorPluginFired: boolean
  timeMs: number
}

class CapturingErrorPlugin extends BasePlugin {
  fired = false
  lastError: string | null = null
  async onModelErrorCallback({ error }: { error: Error }): Promise<LlmResponse | undefined> {
    this.fired = true
    this.lastError = `${error.name}: ${error.message.slice(0, 200)}`
    return { content: { role: 'model', parts: [{ text: '__FALLBACK__' }] } }
  }
}

async function runOne(model: string, query: string): Promise<RunOutcome> {
  const toolCalls: string[] = []
  const errorPlugin = new CapturingErrorPlugin('err')

  const agent = new LlmAgent({
    name: 'roka',
    model,
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
      httpOptions: { timeout: TIMEOUT_MS }
    },
    beforeToolCallback: async ({ tool }) => {
      toolCalls.push(tool.name)
      return undefined
    }
  })

  const ss = new InMemorySessionService()
  const runner = new Runner({ appName: 'compare', agent, sessionService: ss, plugins: [errorPlugin] })
  const sid = `compare-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await ss.createSession({ appName: 'compare', userId: 'u1', sessionId: sid })

  const start = Date.now()
  let text = ''
  let finalEventCount = 0
  let totalEventCount = 0
  let lastFinalPartKeys: string[][] = []
  let errorCaught: string | null = null

  try {
    for await (const event of runner.runAsync({
      userId: 'u1',
      sessionId: sid,
      newMessage: { role: 'user', parts: [{ text: `[Tester]: ${query}` }] },
      runConfig: { maxLlmCalls: config.gemini.maxLlmCalls }
    })) {
      totalEventCount += 1
      if (isFinalResponse(event) && event.content?.parts) {
        finalEventCount += 1
        lastFinalPartKeys = event.content.parts.map((p: Part) => Object.keys(p))
        text = event.content.parts
          .filter((p: Part) => p.text && !(p as { thought?: boolean }).thought)
          .map((p: Part) => p.text)
          .join('')
          .trim()
      }
    }
  } catch (e) {
    errorCaught = e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : String(e)
  }

  return {
    text: text === '__FALLBACK__' ? '' : text,
    toolCalls,
    finalEventCount,
    totalEventCount,
    lastFinalPartKeys,
    errorCaught,
    errorPluginFired: errorPlugin.fired,
    timeMs: Date.now() - start
  }
}

interface Verdict {
  category: 'OK' | 'EMPTY' | 'FALLBACK' | 'ERROR'
  detail: string
}

function classify(o: RunOutcome): Verdict {
  if (o.errorCaught) return { category: 'ERROR', detail: o.errorCaught }
  if (o.errorPluginFired) return { category: 'FALLBACK', detail: 'error-plugin fired' }
  if (!o.text) {
    return {
      category: 'EMPTY',
      detail: `events=${o.totalEventCount} final=${o.finalEventCount} keys=${JSON.stringify(o.lastFinalPartKeys)}`
    }
  }
  return { category: 'OK', detail: `${o.text.length} chars, tools=[${o.toolCalls.join(',')}]` }
}

const PROBES: { id: string; query: string; expectsTool: boolean }[] = [
  { id: 'P1-greet', query: 'Hi Roka, how are you?', expectsTool: false },
  { id: 'P2-smalltalk', query: 'Did you eat lunch yet?', expectsTool: false },
  { id: 'P3-dice', query: 'Roll 2d20 for me.', expectsTool: true },
  { id: 'P4-time', query: 'What time is it right now?', expectsTool: true },
  { id: 'P5-coin', query: 'Flip a coin.', expectsTool: true },
  { id: 'P6-multi', query: 'Roll a d6 and tell me what you think of the result.', expectsTool: true }
]

async function main(): Promise<void> {
  console.log(`\nGemini model comparison — ${ITERATIONS} iteration(s) per probe, timeout ${TIMEOUT_MS}ms\n`)

  const summary: Record<string, Record<string, number>> = {}
  const failureLog: string[] = []

  for (const model of MODELS) {
    summary[model] = { OK: 0, EMPTY: 0, FALLBACK: 0, ERROR: 0 }
    console.log(`==== ${model} ====`)
    for (const probe of PROBES) {
      for (let i = 1; i <= ITERATIONS; i++) {
        const outcome = await runOne(model, probe.query)
        const verdict = classify(outcome)
        summary[model][verdict.category] += 1
        const tag =
          verdict.category === 'OK' ? '\x1b[32mOK\x1b[0m' : verdict.category === 'EMPTY' ? '\x1b[33mEMPTY\x1b[0m' : verdict.category === 'FALLBACK' ? '\x1b[33mFALLBACK\x1b[0m' : '\x1b[31mERROR\x1b[0m'
        const toolFlag = probe.expectsTool && outcome.toolCalls.length === 0 ? ' [no-tool!]' : ''
        console.log(`  ${probe.id} #${i} (${outcome.timeMs}ms) [${tag}]${toolFlag} ${verdict.detail}`)
        if (verdict.category !== 'OK') {
          failureLog.push(`${model} ${probe.id} #${i}: ${verdict.category} — ${verdict.detail}`)
        }
        // Stagger calls so we don't trip free-tier RPM (~15)
        await new Promise((r) => setTimeout(r, 4500))
      }
    }
    console.log()
  }

  console.log('======== SUMMARY ========')
  for (const model of MODELS) {
    const s = summary[model]
    const total = s.OK + s.EMPTY + s.FALLBACK + s.ERROR
    console.log(`  ${model}: OK=${s.OK}/${total}  EMPTY=${s.EMPTY}  FALLBACK=${s.FALLBACK}  ERROR=${s.ERROR}`)
  }
  if (failureLog.length > 0) {
    console.log('\n--- Failures ---')
    for (const line of failureLog) console.log('  ' + line)
  }

  const gaSummary = summary['gemini-3.1-flash-lite']
  const previewSummary = summary['gemini-3.1-flash-lite-preview']
  const gaOk = gaSummary.OK
  const previewOk = previewSummary.OK
  const totalPerModel = PROBES.length * ITERATIONS
  const gaPctOk = (gaOk / totalPerModel) * 100
  const previewPctOk = (previewOk / totalPerModel) * 100

  console.log(`\nGA OK rate:      ${gaPctOk.toFixed(1)}%`)
  console.log(`Preview OK rate: ${previewPctOk.toFixed(1)}%`)

  if (gaPctOk < previewPctOk - 10) {
    console.log('\n\x1b[31mVERDICT: GA model significantly worse than preview. Investigate before promoting.\x1b[0m')
    process.exit(1)
  } else {
    console.log('\n\x1b[32mVERDICT: GA model on par with preview.\x1b[0m')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(2)
})
