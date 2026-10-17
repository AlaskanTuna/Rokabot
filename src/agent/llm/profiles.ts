export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'modelscope' | 'openai-compatible'

// An openai-compatible entry names its own key variable, or none for a keyless server.
export const PROVIDER_KEY_ENV: Readonly<Record<Exclude<ProviderId, 'openai-compatible'>, string>> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  modelscope: 'MODELSCOPE_API_KEY'
}

export interface ModelProfile {
  provider: ProviderId
  model: string
  input: { image: boolean; pdf: boolean; audio: boolean; video: boolean }
  tools: { supported: boolean; parallel: boolean }
  thinking: {
    efforts: readonly string[]
    defaultEffort?: string
    /** How to spell thinking-off in the request; 'disabled' when absent. Sonnet only accepts 'between_tools'. */
    offMode?: 'disabled' | 'between_tools'
    replayWithinTurn: boolean
  }
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
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    input: { image: true, pdf: true, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // Sonnet treats `thinking: {type: 'disabled'}` as an error; effort none must send 'between_tools' instead, which
    // it accepts only at effort high or below. Forced tool use and non-default sampling are errors too, so
    // structured output goes through output_config.format and sampling stays off.
    thinking: {
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
      offMode: 'between_tools',
      replayWithinTurn: true
    },
    sampling: { temperature: false, topP: false },
    structuredOutput: 'json_schema_strict',
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
    promptCaching: 'explicit',
    tokenCounter: 'anthropic',
    price: { input: 2.0, output: 10.0, cachedInput: 0.2, cacheWrite: 2.5 },
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
    verified: true
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
    verified: true
  },
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    input: { image: true, pdf: true, audio: true, video: true },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    // Google deprecated temperature and top_p on 3.8 Flash.
    sampling: { temperature: false, topP: false },
    structuredOutput: 'response_json_schema',
    maxOutputTokens: 65_536,
    contextWindow: 1_048_576,
    promptCaching: 'implicit',
    tokenCounter: 'gemini',
    price: { input: 0.75, output: 3.75, cachedInput: 0.075 },
    verified: false
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    input: { image: true, pdf: true, audio: true, video: true },
    tools: { supported: true, parallel: true },
    thinking: { efforts: [], replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'response_json_schema',
    maxOutputTokens: 65_536,
    contextWindow: 1_048_576,
    promptCaching: 'implicit',
    tokenCounter: 'gemini',
    price: { input: 0.25, output: 1.5, cachedInput: 0.025 },
    verified: false
  },
  {
    provider: 'openai',
    model: 'gpt-6-sol',
    input: { image: true, pdf: false, audio: false, video: false },
    tools: { supported: true, parallel: true },
    // Chat Completions accepts tools only at effort none, as on gpt-6-luna.
    thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
    sampling: { temperature: true, topP: true },
    structuredOutput: 'json_schema_strict',
    maxOutputTokens: 128_000,
    contextWindow: 922_000,
    promptCaching: 'implicit',
    tokenCounter: 'estimate',
    price: { input: 2, output: 10, cachedInput: 0.2 },
    verified: true
  },
  {
    provider: 'modelscope',
    model: 'Qwen/Qwen3.5-27B',
    input: { image: true, pdf: false, audio: false, video: false },
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

/** What an `openai-compatible` entry in config.yml declares about its model; the deployer vouches for it. */
export interface CompatibleCapabilities {
  tools: boolean
  parallelToolCalls: boolean
  vision: boolean
  structuredOutput: 'json_schema' | 'json_object'
  maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  temperature: boolean
  topP: boolean
  efforts: readonly string[]
  contextWindow: number
  maxOutputTokens: number
}

export const COMPATIBLE_DEFAULTS: Readonly<CompatibleCapabilities> = {
  tools: true,
  parallelToolCalls: true,
  vision: false,
  structuredOutput: 'json_object',
  maxTokensParam: 'max_tokens',
  temperature: true,
  topP: true,
  efforts: [],
  contextWindow: 131_072,
  maxOutputTokens: 8192
}

export function compatibleProfile(
  model: string,
  capabilities: CompatibleCapabilities,
  price: ModelProfile['price'] = { input: 0, output: 0 }
): ModelProfile {
  return {
    provider: 'openai-compatible',
    model,
    input: { image: capabilities.vision, pdf: false, audio: false, video: false },
    tools: { supported: capabilities.tools, parallel: capabilities.parallelToolCalls },
    thinking: { efforts: capabilities.efforts, replayWithinTurn: false },
    sampling: { temperature: capabilities.temperature, topP: capabilities.topP },
    structuredOutput: capabilities.structuredOutput === 'json_schema' ? 'json_schema_strict' : 'json_object',
    maxOutputTokens: capabilities.maxOutputTokens,
    contextWindow: capabilities.contextWindow,
    promptCaching: 'none',
    tokenCounter: 'estimate',
    price,
    verified: true
  }
}
