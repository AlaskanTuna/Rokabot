import type Anthropic from '@anthropic-ai/sdk'

/**
 * Sanitised Messages API responses in the exact shape the SDK returns, one per case the adapter handles.
 * Swap any of them for a response captured on an owner-run live session.
 */
type ContentBlock = Anthropic.ContentBlock

function usage(counts: {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
}): Anthropic.Usage {
  return {
    input_tokens: counts.input,
    output_tokens: counts.output,
    cache_read_input_tokens: counts.cacheRead ?? 0,
    cache_creation_input_tokens: counts.cacheWrite ?? 0,
    cache_creation: null,
    inference_geo: 'global',
    output_tokens_details: { thinking_tokens: counts.thinkingTokens ?? 0 },
    server_tool_use: null,
    service_tier: 'standard'
  }
}

function message(
  id: string,
  content: ContentBlock[],
  stopReason: Anthropic.Message['stop_reason'],
  messageUsage: Anthropic.Usage,
  stopDetails: Anthropic.Message['stop_details'] = null
): Anthropic.Message {
  return {
    id,
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    container: null,
    diagnostics: null,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: stopDetails,
    usage: messageUsage
  }
}

const text = (value: string): ContentBlock => ({ type: 'text', text: value, citations: null })
const thinking = (signature: string): ContentBlock => ({ type: 'thinking', thinking: '', signature })
const toolUse = (id: string, name: string, input: unknown): ContentBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
  caller: { type: 'direct' }
})

export const fixtures = {
  text: message(
    'msg_fixture_text',
    [thinking('sig-text'), text('Ehehe, good morning to you too~')],
    'end_turn',
    usage({ input: 412, output: 96, cacheRead: 3880, thinkingTokens: 64 })
  ),
  toolUse: message(
    'msg_fixture_tool',
    [
      thinking('sig-tool'),
      text('Let me check what I remember.'),
      toolUse('toolu_01Fixture', 'recall_user', { query: 'favourite tea' })
    ],
    'tool_use',
    usage({ input: 500, output: 80, thinkingTokens: 40 })
  ),
  parallelToolUse: message(
    'msg_fixture_parallel',
    [toolUse('toolu_a', 'roll_dice', { sides: 6 }), toolUse('toolu_b', 'roll_dice', { sides: 20 })],
    'tool_use',
    usage({ input: 300, output: 60 })
  ),
  refusal: message('msg_fixture_refusal', [], 'refusal', usage({ input: 200, output: 0 }), {
    type: 'refusal',
    category: 'cyber',
    explanation: 'The request could enable cyber harm.'
  }),
  maxTokens: message(
    'msg_fixture_max',
    [thinking('sig-max'), text('I was about to say')],
    'max_tokens',
    usage({ input: 300, output: 2548, thinkingTokens: 2400 })
  ),
  thinkingOnly: message(
    'msg_fixture_thinking_only',
    [thinking('sig-only')],
    'max_tokens',
    usage({ input: 300, output: 2548, thinkingTokens: 2548 })
  ),
  structured: message(
    'msg_fixture_structured',
    [toolUse('toolu_struct', 'emit_result', { ok: true, facts: [] })],
    'tool_use',
    usage({ input: 700, output: 30 })
  ),
  malformedToolUse: message(
    'msg_fixture_malformed',
    [toolUse('toolu_bad', 'roll_dice', 'sides=6')],
    'tool_use',
    usage({ input: 300, output: 20 })
  )
} satisfies Record<string, Anthropic.Message>
