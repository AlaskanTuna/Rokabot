import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORE_PROMPT } from '../../../src/agent/prompts/core.js'
import { SPEECH_PROMPT } from '../../../src/agent/prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from '../../../src/agent/prompts/tones.js'
import { rokaTools } from '../../../src/agent/tools/index.js'
import { MAX_SYSTEM_PROMPT_TOKENS, measureRequest } from '../tokens.js'

const fixture = {
  tone: 'playful' as const,
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
    expect(CORE_PROMPT).toContain(
      'Keep responses between 50-70 words. 1-3 sentences for casual chat, up to 4 for complex topics. Always finish your thought — end naturally, never trail off mid-sentence.'
    )
    expect(CORE_PROMPT).toContain('## Hard Boundaries')
  })

  it('keeps the recall_user proactive rule scoped to the current message (issue #39)', () => {
    expect(CORE_PROMPT).toContain("When the message you're replying to names another server member")
    expect(CORE_PROMPT).toContain('someone other than you or the person speaking')
    expect(CORE_PROMPT).toContain('Someone who only appears earlier in the conversation is not a reason to call it')
  })

  // Two clauses that read as a contradiction and are not one: the first suppresses re-saving a fact she
  // already holds, the second overrides it when the user asks outright. #118 exists because without the
  // second, `remember_user` had never fired in production. `remember-user.jsonl` case R6 is the only live
  // test of the override — it asks her to remember a claim already seeded for its own speaker — so if this
  // wording goes, R6 stops testing anything and the aggregate absorbs it silently (#182).
  it('keeps the skip-what-you-already-know clause that scopes passive extraction (issue #118)', () => {
    expect(CORE_PROMPT).toContain('skip facts already in What You Remember')
  })

  it('keeps the outright-request carve-out that overrides it (issue #118)', () => {
    expect(CORE_PROMPT).toContain(
      'When they ask you outright to remember something, call it even if you already know the fact'
    )
  })

  it('keeps the searched-turn rule that puts the finding before the roleplay (issue #94)', () => {
    expect(CORE_PROMPT).toContain(
      'Open with the finding itself — the name, the number, the date, the actual answer. No greeting, no "let me check", no preamble about looking it up.'
    )
  })

  it('keeps web search exempt from the weave-results-into-personality rule (issue #94)', () => {
    expect(CORE_PROMPT).toContain('Web search results are the exception: lead with the finding, then react.')
  })

  it('keeps the searched-turn rules scoped to search_web so other tools keep their personality (issue #94)', () => {
    expect(CORE_PROMPT).toContain('Results from every other tool keep the personality-integrated style')
  })

  it('keeps the speech quotas scoped off searched turns so they stop manufacturing a closing block (issue #94)', () => {
    expect(SPEECH_PROMPT).toContain(
      'do not let the kaomoji and teasing-phrase quotas above pull you into a second paragraph'
    )
  })

  it('keeps bolding in play on a searched turn even with the other quotas lifted (issue #94)', () => {
    expect(SPEECH_PROMPT).toContain('Bold still earns its place — keep it on the names and numbers in the finding.')
  })

  it('keeps the speech layer from re-manufacturing a closing roleplay block (issue #94)', () => {
    expect(SPEECH_PROMPT).toContain(
      'Never add a closing paragraph of roleplay just to give those flourishes somewhere to live.'
    )
  })

  it('keeps the frozen baseline structurally consistent without re-deriving it', async () => {
    const path = resolve('tests/harness/perf-baseline.json')
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

  it('keeps the assembled system prompt within the enforced ceiling across every tone (change-detection gate)', () => {
    // Bound systemTok (core + speech + tone + context) only, not totalTok. The runtime
    // "What You Remember About People In This Channel" facts block scales with channel
    // population, so bounding the whole request would make this gate flap on a busy
    // server instead of on a code change — see AGENTS.md / docs/trd.md.
    // The context layer stopped scaling with the channel's population when the group-conversation roster
    // was removed (#52), so the only name it still carries is the speaker's — worst case is one long one.
    const worstCaseDisplayName = 'Bartholomew Christopherson-Yamanaka'
    const tones = Object.keys(TONE_PROMPTS) as ToneKey[]

    const results = tones.map((tone) => ({
      tone,
      ...measureRequest({
        tone,
        hour: 5,
        displayName: worstCaseDisplayName,
        userMessage: 'placeholder'
      })
    }))

    const worst = results.reduce((max, result) => (result.systemTok > max.systemTok ? result : max))

    // The loop guarantees every assembled tone retains all four prompt layers.
    for (const result of results) {
      expect(result.coreTok, `tone "${result.tone}": core layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.speechTok, `tone "${result.tone}": speech layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.toneTok, `tone "${result.tone}": tone layer produced 0 tokens`).toBeGreaterThan(0)
      expect(result.contextTok, `tone "${result.tone}": context layer produced 0 tokens`).toBeGreaterThan(0)
    }

    expect(
      worst.systemTok,
      `worst-case tone "${worst.tone}" assembled to ${worst.systemTok} tokens, over MAX_SYSTEM_PROMPT_TOKENS=${MAX_SYSTEM_PROMPT_TOKENS}`
    ).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_TOKENS)
  })
})
