import { BaseLlm, InMemorySessionService, LlmAgent, LogLevel, Runner, setLogLevel } from '@google/adk'
import type { BaseLlmConnection, LlmResponse } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withSearchCitations } from '../searchCitations.js'
import { searchWebTool } from '../tools/index.js'

// The citation sink is an AsyncLocalStorage store opened in the Discord layer and written from inside
// searchWeb, which ADK calls several async frames deeper. This drives the real Runner into the real tool to
// pin that the context survives that crossing — the assumption the whole citation feature rests on.

setLogLevel(LogLevel.WARN)

const APP_NAME = 'citation-contract'
const CHANNEL = 'citation-channel'

class ScriptedLlm extends BaseLlm {
  private next = 0

  constructor(private readonly script: LlmResponse[]) {
    super({ model: 'scripted-citation-model' })
  }

  async *generateContentAsync(): AsyncGenerator<LlmResponse, void> {
    yield this.script[this.next++]
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('ScriptedLlm does not support live connections')
  }
}

const SEARCH_TURN: LlmResponse[] = [
  { content: { role: 'model', parts: [{ functionCall: { name: 'search_web', args: { query: 'frieren' } } }] } },
  { content: { role: 'model', parts: [{ text: 'She premiered in January~' }] } }
]

const TAVILY_RESULTS = [
  { title: 'Crunchyroll News', url: 'https://www.crunchyroll.com/news/a', content: 'c', score: 1 },
  { title: 'Polygon', url: 'https://www.polygon.com/b', content: 'c', score: 1 }
]

async function runSearchTurn() {
  const agent = new LlmAgent({
    name: 'citations',
    model: new ScriptedLlm(SEARCH_TURN),
    instruction: '',
    tools: [searchWebTool],
    disallowTransferToParent: true,
    disallowTransferToPeers: true
  })
  const sessionService = new InMemorySessionService()
  const runner = new Runner({ appName: APP_NAME, agent, sessionService })
  await sessionService.createSession({ appName: APP_NAME, userId: CHANNEL, sessionId: CHANNEL })

  return withSearchCitations(async () => {
    for await (const _event of runner.runAsync({
      userId: CHANNEL,
      sessionId: CHANNEL,
      newMessage: { role: 'user', parts: [{ text: 'when did frieren season 2 air?' }] },
      runConfig: { maxLlmCalls: 4 }
    })) {
      // draining the turn is the point; the events themselves are not under test
    }
  })
}

const originalFetch = globalThis.fetch
const originalKey = process.env.TAVILY_API_KEY

describe('search citation capture', () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'test-key'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answer: 'a', results: TAVILY_RESULTS, response_time: 1 })
    }) as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined", leaving searchWeb's `if (!apiKey)` guard truthy
    if (originalKey === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = originalKey
    vi.clearAllMocks()
  })

  it('carries the searched sources out of ADK to the reply surface', async () => {
    const [, citations] = await runSearchTurn()

    expect(citations.map((citation) => citation.url)).toEqual([
      'https://www.crunchyroll.com/news/a',
      'https://www.polygon.com/b'
    ])
  })

  it('reports no sources for a turn that never searched', async () => {
    const [, citations] = await withSearchCitations(async () => undefined)

    expect(citations).toEqual([])
  })
})
