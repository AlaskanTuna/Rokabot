import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORE_PROMPT } from '../../../src/agent/prompts/core.js'
import { rokaTools } from '../../../src/agent/tools/index.js'
import { measureRequest } from '../tokens.js'

const fixture = {
  tone: 'playful' as const,
  participants: ['Mio', 'Ren'],
  hour: 14,
  displayName: 'Mio',
  history: [
    { role: 'user' as const, displayName: 'Ren', content: 'Tea is ready for everyone.' },
    { role: 'assistant' as const, displayName: 'Roka', content: 'Then let us make it a little tea party~' }
  ],
  userMessage: 'Roka, can you recommend a sweet to serve with jasmine tea?'
}

describe('harness token measurement', () => {
  it('is deterministic and its components sum to the total', () => {
    const first = measureRequest(fixture)
    const second = measureRequest(fixture)

    expect(first).toEqual(second)
    expect(first.coreTok + first.speechTok + first.toneTok + first.contextTok).toBe(first.systemTok)
    expect(
      first.coreTok +
        first.speechTok +
        first.toneTok +
        first.contextTok +
        first.toolsTok +
        first.historyTok +
        first.userMsgTok
    ).toBe(first.totalTok)
  })

  it('measures all registered tool declarations and falls when tools are removed', () => {
    const full = measureRequest({ ...fixture, tools: rokaTools })
    const trimmed = measureRequest({ ...fixture, tools: rokaTools.slice(0, -1) })

    expect(full.toolCount).toBe(rokaTools.length)
    expect(full.toolsTok).toBeGreaterThan(trimmed.toolsTok)
  })

  it('keeps the core prompt aligned with the trimmed tool suite', () => {
    expect(CORE_PROMPT).not.toContain('roll dice')
    expect(CORE_PROMPT).not.toContain('flip coins')
    expect(CORE_PROMPT).not.toContain('current time')
    expect(CORE_PROMPT).not.toContain('weather')
    expect(CORE_PROMPT).toContain('Maniwa Roka')
    expect(CORE_PROMPT).toContain('big-sister')
    expect(CORE_PROMPT).toContain('80-100 words')
    expect(CORE_PROMPT).toContain('## Hard Boundaries')
  })

  it('keeps the frozen baseline structurally consistent without re-deriving it', async () => {
    const path = resolve('test/harness/perf-baseline.json')
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as {
      estimator: string
      requests: Array<{
        tokens: {
          coreTok: number
          speechTok: number
          toneTok: number
          contextTok: number
          systemTok: number
          toolsTok: number
          historyTok: number
          userMsgTok: number
          totalTok: number
        }
      }>
    }

    expect(snapshot.estimator).toContain('chars/4')
    expect(snapshot.requests.length).toBeGreaterThan(0)
    for (const { tokens } of snapshot.requests) {
      expect(tokens.coreTok + tokens.speechTok + tokens.toneTok + tokens.contextTok).toBe(tokens.systemTok)
      expect(tokens.systemTok + tokens.toolsTok + tokens.historyTok + tokens.userMsgTok).toBe(tokens.totalTok)
    }
  })
})
