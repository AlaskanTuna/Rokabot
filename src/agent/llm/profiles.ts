export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'modelscope'

export interface ModelProfile {
  provider: ProviderId
  model: string
  input: { image: boolean; pdf: boolean; audio: boolean; video: boolean }
  tools: { supported: boolean; parallel: boolean }
  thinking: { efforts: readonly string[]; defaultEffort?: string; replayWithinTurn: boolean }
  sampling: { temperature: boolean; topP: boolean }
  structuredOutput: 'response_json_schema' | 'json_schema_strict' | 'forced_tool' | 'json_object'
  maxOutputTokens: number
  contextWindow: number
  promptCaching: 'implicit' | 'explicit' | 'none'
  tokenCounter: 'gemini' | 'anthropic' | 'estimate'
  /** USD per 1M tokens; 0 for free or quota-billed (ModelScope Magicubes). */
  price: { input: number; output: number; cachedInput?: number; cacheWrite?: number }
  /** D12: false means "candidate"; startup rejects it as main or fallback. */
  verified: boolean
}

export const MODEL_PROFILES: readonly ModelProfile[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    input: { image: true, pdf: true, audio: true, video: true },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'response_json_schema',
    maxOutputTokens: 65_536,
    contextWindow: 1_048_576,
    promptCaching: 'implicit',
    tokenCounter: 'gemini',
    price: { input: 0.3, output: 2.5, cachedInput: 0.03 },
    verified: true
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    input: { image: true, pdf: true, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // `none` is this codebase's spelling of thinking disabled, which Haiku 5.5 accepts at effort high or below.
    thinking: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
      replayWithinTurn: true
    },
    sampling: { temperature: false, topP: false },
    structuredOutput: 'forced_tool',
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    promptCaching: 'explicit',
    tokenCounter: 'anthropic',
    price: { input: 0.1, output: 0.5, cachedInput: 0.01, cacheWrite: 0.125 },
    verified: true
  },
  {
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-122B-A10B',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    maxOutputTokens: 32_768,
    contextWindow: 262_144,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    verified: true
  },
  {
    provider: 'openai',
    model: 'gpt-6-luna',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // Chat Completions accepts tools only at effort none; higher efforts need the Responses API (D9).
    thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_schema_strict',
    maxOutputTokens: 128_000,
    // The documented maximum input; the 1.05M window also holds the output.
    contextWindow: 922_000,
    promptCaching: 'implicit',
    tokenCounter: 'estimate',
    price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
    verified: true
  },
  {
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-35B-A3B',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    // ModelScope does not publish its serving caps, so both limits stay well under the model's own.
    maxOutputTokens: 32_768,
    contextWindow: 131_072,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    // D12: a candidate until scripts/probe-llm-profile.ts passes against the live endpoint.
    verified: false
  },
  {
    provider: 'modelscope',
    model: 'deepseek-ai/DeepSeek-V4.1-Flash',
    // The model reads images, but image input on ModelScope is unverified.
    input: { image: false, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_object',
    maxOutputTokens: 32_768,
    contextWindow: 131_072,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price: { input: 0, output: 0 },
    verified: false
  }
]

export function profileFor(provider: ProviderId, model: string): ModelProfile | undefined {
  return MODEL_PROFILES.find((profile) => profile.provider === provider && profile.model === model)
}
