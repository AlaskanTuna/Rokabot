import { assembleSystemPrompt } from '../../src/agent/promptAssembler.js'
import { buildContextPrompt } from '../../src/agent/prompts/context.js'
import { CORE_PROMPT } from '../../src/agent/prompts/core.js'
import { SPEECH_PROMPT } from '../../src/agent/prompts/speech.js'
import { TONE_PROMPTS, type ToneKey } from '../../src/agent/prompts/tones.js'
import { rokaTools } from '../../src/agent/tools/index.js'
import { estimateTokens } from '../../src/utils/tokens.js'

export { estimateTokens }

export interface TokenHistoryMessage {
  role: 'user' | 'assistant'
  displayName: string
  content: string
}

export interface ToolSchemaSource {
  _getDeclaration(): unknown
}

export interface MeasureRequestInput {
  tone: ToneKey
  participants: readonly string[]
  hour: number
  displayName: string
  history?: readonly TokenHistoryMessage[]
  userMessage: string
  tools?: readonly ToolSchemaSource[]
}

export interface RequestTokenBreakdown {
  coreTok: number
  speechTok: number
  toneTok: number
  contextTok: number
  systemTok: number
  toolsTok: number
  historyTok: number
  userMsgTok: number
  totalTok: number
  toolCount: number
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`

  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`
}

function serializeToolSchemas(tools: readonly ToolSchemaSource[]): string {
  return stableJson({
    tools: [{ functionDeclarations: tools.map((tool) => tool._getDeclaration()) }]
  })
}

/** Measure the prompt parts and ADK function declarations that make up one outgoing Gemini request. */
export function measureRequest(input: MeasureRequestInput): RequestTokenBreakdown {
  const assemblerInput = {
    tone: input.tone,
    participants: [...input.participants],
    hour: input.hour,
    displayName: input.displayName
  }
  const contextPrompt = buildContextPrompt(assemblerInput.participants, assemblerInput.hour, assemblerInput.displayName)
  const systemPrompt = assembleSystemPrompt(assemblerInput)
  const coreTok = estimateTokens(CORE_PROMPT)
  const speechTok = estimateTokens(SPEECH_PROMPT)
  const toneTok = estimateTokens(TONE_PROMPTS[input.tone])
  const contextTok = estimateTokens(contextPrompt)
  const systemTok = coreTok + speechTok + toneTok + contextTok
  const tools = input.tools ?? rokaTools
  const toolsTok = estimateTokens(serializeToolSchemas(tools))
  const historyTok = (input.history ?? []).reduce(
    (total, message) => total + estimateTokens(`[${message.displayName}]: ${message.content}`),
    0
  )
  const userMsgTok = estimateTokens(`[${input.displayName}]: ${input.userMessage}`)

  if (!systemPrompt) throw new Error('Prompt assembly returned an empty system prompt')

  return {
    coreTok,
    speechTok,
    toneTok,
    contextTok,
    systemTok,
    toolsTok,
    historyTok,
    userMsgTok,
    totalTok: systemTok + toolsTok + historyTok + userMsgTok,
    toolCount: tools.length
  }
}
