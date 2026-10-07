import { describe, expect, it } from 'vitest'
import { stripNarratedToolCalls } from '../narratedToolCalls.js'

const TOOL_NAMES = ['recall_user', 'remember_user', 'search_web', 'set_reminder']

describe('stripNarratedToolCalls', () => {
  it('removes the italic pseudo-calls Gemini wrote into production replies', () => {
    const leaked =
      "*(recall_user: WhiteAvocado)*\n*(recall_user: Ikuyo)*Mou~ you just can't stop calling my name, can you, **WhiteAvocado**? (¬‿¬)"

    expect(stripNarratedToolCalls(leaked, TOOL_NAMES)).toEqual({
      text: "Mou~ you just can't stop calling my name, can you, **WhiteAvocado**? (¬‿¬)",
      stripped: 2
    })
  })

  it('removes a pseudo-call that names a numeric user', () => {
    const leaked = '*(recall_user: 2)*\nA lockdown is an emergency measure, 2. (´・ω・`)'

    expect(stripNarratedToolCalls(leaked, TOOL_NAMES).text).toBe('A lockdown is an emergency measure, 2. (´・ω・`)')
  })

  it('removes bracketed and unemphasised pseudo-calls mid-reply', () => {
    const leaked = 'Let me check~ (search_web: weather in Tokyo) and [remember_user: likes matcha] done!'

    expect(stripNarratedToolCalls(leaked, TOOL_NAMES)).toEqual({ text: 'Let me check~ and done!', stripped: 2 })
  })

  it('removes a tool_code fence that calls a tool', () => {
    const leaked = '```tool_code\nprint(default_api.search_web(query="Senren Banka"))\n```\nHere you go~'

    expect(stripNarratedToolCalls(leaked, TOOL_NAMES).text).toBe('Here you go~')
  })

  it("removes Qwen's tool_call block", () => {
    const leaked = 'Hmm~\n<tool_call>\n{"name": "set_reminder", "arguments": {"minutes": 5}}\n</tool_call>\nOkay!'

    expect(stripNarratedToolCalls(leaked, TOOL_NAMES).text).toBe('Hmm~\nOkay!')
  })

  it('keeps stage directions and code that do not name a tool', () => {
    const reply = '*(sighs)* Fine~ [Note: closed today] ```js\nconsole.log(1)\n``` (recall: nothing)'

    expect(stripNarratedToolCalls(reply, TOOL_NAMES)).toEqual({ text: reply, stripped: 0 })
  })

  it('keeps a reply that only mentions a tool name in prose', () => {
    const reply = 'I could use recall_user later, but not now.'

    expect(stripNarratedToolCalls(reply, TOOL_NAMES).text).toBe(reply)
  })
})
