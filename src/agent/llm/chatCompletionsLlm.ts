import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Part } from '@google/genai'
import { requestTokenEstimate, startCall } from './budget.js'
import type { ModelProfile } from './profiles.js'
import {
  attachmentKind,
  attachmentMarker,
  functionDeclarations,
  isRecord,
  shapeRequest,
  systemText
} from './requestShape.js'
import { type CallUsage, recordUsage, workloadOf } from './usage.js'

type JsonObject = Record<string, unknown>
type ChatMessage = Record<string, unknown>
type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      refusal?: string | null
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }> | null
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
  } | null
}

interface GeneratedCall {
  id: string
  name: string
  args: unknown
  answered?: ChatMessage
}

interface MessageEntry {
  message: ChatMessage
  calls?: GeneratedCall[]
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function openAiTools(llmRequest: LlmRequest): ChatMessage[] {
  return functionDeclarations(llmRequest).map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name,
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
      ...(declaration.parameters === undefined ? {} : { parameters: declaration.parameters })
    }
  }))
}

function textContent(parts: ContentPart[]): string | ContentPart[] {
  if (parts.some((part) => part.type === 'image_url')) return parts
  return parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
}

function openAiMessages(llmRequest: LlmRequest, acceptsImages: boolean, legacy: boolean): ChatMessage[] {
  const messages: ChatMessage[] = []
  const instruction = systemText(llmRequest.config?.systemInstruction)
  if (instruction) messages.push({ role: 'system', content: instruction })

  const pendingCalls = new Map<string, GeneratedCall[]>()
  const callsById = new Map<string, GeneratedCall>()
  let precedingTurnIdlessCalls: GeneratedCall[] = []
  const entries: MessageEntry[] = []
  let callSequence = 0
  const matchingCall = (id: string | undefined, name: string): GeneratedCall | undefined => {
    if (legacy) return pendingCalls.get(name)?.find((candidate) => candidate.answered === undefined)
    if (id) return callsById.get(id)
    // ADK strips its own `adk-` ids before every call, so a call that came without a provider id comes back without
    // one; only those pair by name, with the earliest unanswered one in the preceding model turn.
    return precedingTurnIdlessCalls.find((candidate) => candidate.name === name && candidate.answered === undefined)
  }
  const addFunctionResponse = (
    functionResponse: { id?: string; name?: string; response?: unknown },
    onUnmatched: (text: string) => void
  ) => {
    const name = functionResponse.name ?? ''
    const response = functionResponse.response
    const call = matchingCall(functionResponse.id, name)
    if (!call || call.answered) {
      onUnmatched(`(result of ${name}: ${JSON.stringify(response ?? {})})`)
      return
    }
    call.answered = {
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(response ?? {})
    }
  }

  for (const content of llmRequest.contents) {
    const isAssistant = content.role === 'model'
    const parts = content.parts ?? []

    if (isAssistant) {
      const textParts: string[] = []
      const unmatchedResponses: string[] = []
      const calls: GeneratedCall[] = []
      const idlessCalls: GeneratedCall[] = []
      for (const part of parts) {
        if (part.thought) continue
        if (part.functionResponse) {
          addFunctionResponse(part.functionResponse, (text) => unmatchedResponses.push(text))
          continue
        }
        if (part.text !== undefined) textParts.push(part.text)
        if (part.functionCall) {
          const providerId = legacy ? undefined : part.functionCall.id
          const call: GeneratedCall = {
            id: providerId || `call_${++callSequence}`,
            name: part.functionCall.name ?? '',
            args: part.functionCall.args ?? {}
          }
          calls.push(call)
          const sameName = pendingCalls.get(call.name) ?? []
          sameName.push(call)
          pendingCalls.set(call.name, sameName)
          if (providerId) callsById.set(providerId, call)
          else idlessCalls.push(call)
        }
        if (part.inlineData || part.fileData) {
          textParts.push(attachmentMarker(attachmentKind(part.inlineData?.mimeType ?? part.fileData?.mimeType)))
        }
      }
      precedingTurnIdlessCalls = idlessCalls
      if (textParts.length || calls.length) {
        entries.push({ message: { role: 'assistant', content: textParts.length ? textParts.join('\n') : null }, calls })
      }
      if (unmatchedResponses.length) entries.push({ message: { role: 'user', content: unmatchedResponses.join('\n') } })
      continue
    }

    const userParts: ContentPart[] = []
    for (const part of parts) {
      if (part.thought) continue
      if (part.functionResponse) {
        addFunctionResponse(part.functionResponse, (text) => userParts.push({ type: 'text', text }))
        continue
      }
      if (part.text !== undefined) userParts.push({ type: 'text', text: part.text })
      if (part.inlineData || part.fileData) {
        const inlineData = part.inlineData
        const mimeType = inlineData?.mimeType
        if (acceptsImages && inlineData && mimeType?.startsWith('image/')) {
          userParts.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${inlineData.data}` }
          })
        } else {
          userParts.push({
            type: 'text',
            text: attachmentMarker(attachmentKind(inlineData?.mimeType ?? part.fileData?.mimeType))
          })
        }
      }
    }
    if (userParts.length) entries.push({ message: { role: 'user', content: textContent(userParts) } })
  }

  for (const entry of entries) {
    const calls = entry.calls ?? []
    // Chat Completions rejects a tool call with no tool message after it, so an unanswered call is left out; the
    // legacy route keeps sending today's shape.
    const sentCalls = legacy ? calls : calls.filter((call) => call.answered !== undefined)
    if (calls.length && !sentCalls.length && entry.message.content === null) continue
    messages.push(
      sentCalls.length
        ? {
            ...entry.message,
            tool_calls: sentCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: {
                name: call.name,
                arguments: JSON.stringify(call.args)
              }
            }))
          }
        : entry.message
    )
    for (const call of calls) {
      if (call.answered) messages.push(call.answered)
    }
  }
  return messages
}

export type ChatCompletionsProvider = 'openai' | 'modelscope'

const PROVIDER_LABELS: Readonly<Record<ChatCompletionsProvider, string>> = {
  openai: 'OpenAI',
  modelscope: 'ModelScope'
}

export const CHAT_COMPLETIONS_BASE_URLS: Readonly<Record<ChatCompletionsProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  modelscope: 'https://api-inference.modelscope.ai/v1'
}

export interface ChatCompletionsOptions {
  provider: ChatCompletionsProvider
  model: string
  apiKey: string
  baseUrl?: string
  timeoutMs: number
  /** Absent on today's legacy fallback route, which then sends the request unshaped. */
  profile?: ModelProfile
  effort?: string
  /** The resolved output cap (`ResolvedModel.maxOutputTokens`); the profile's own cap when absent. */
  maxOutputTokens?: number
  fetchImpl?: typeof fetch
}

export class ChatCompletionsLlm extends BaseLlm {
  readonly provider: ChatCompletionsProvider
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly profile: ModelProfile | undefined
  private readonly effort: string | undefined
  private readonly maxOutputTokens: number | undefined
  private readonly fetchImpl: typeof fetch

  constructor(options: ChatCompletionsOptions) {
    super({ model: options.model })
    this.provider = options.provider
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? CHAT_COMPLETIONS_BASE_URLS[options.provider]).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs
    this.profile = options.profile
    this.effort = options.effort ?? options.profile?.thinking.defaultEffort
    this.maxOutputTokens = options.maxOutputTokens
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /** True only on the legacy ModelScope fallback, which keeps today's request and reply translation exactly. */
  protected get legacyTranslation(): boolean {
    return false
  }

  private get label(): string {
    return PROVIDER_LABELS[this.provider]
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)
    const profile = this.profile
    const shaped = profile
      ? shapeRequest(llmRequest, {
          provider: this.provider,
          profile,
          maxOutputTokens: this.maxOutputTokens ?? profile.maxOutputTokens
        })
      : llmRequest

    const signal = abortSignal ?? shaped.config?.abortSignal
    const requestBody = this.requestBody(shaped)
    const workload = workloadOf(shaped)
    const reservation = await startCall({
      provider: this.provider,
      model: this.model,
      workload,
      estTokens: requestTokenEstimate([shaped.config?.systemInstruction, shaped.contents]),
      signal
    })

    let result: ChatCompletionsResponse
    try {
      result = await this.post(JSON.stringify(requestBody), signal)
    } catch (error) {
      reservation.release()
      throw error
    }
    const usage: CallUsage = {
      provider: this.provider,
      model: this.model,
      workload,
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0
    }
    recordUsage(usage)
    reservation.release(usage)

    yield this.toResponse(result)
  }

  private requestBody(llmRequest: LlmRequest): JsonObject {
    // The legacy route always sent image bytes; a FALLBACK_MODEL override to an imageless profile must not stop that.
    const acceptsImages = this.legacyTranslation || (this.profile?.input.image ?? true)
    const body: JsonObject = {
      model: this.model,
      messages: openAiMessages(llmRequest, acceptsImages, this.legacyTranslation),
      // ModelScope serves Qwen and DeepSeek with thinking on unless told otherwise; OpenAI rejects the field.
      ...(this.provider === 'modelscope' ? { enable_thinking: false } : {}),
      stream: false
    }
    if (this.effort !== undefined) body.reasoning_effort = this.effort
    const temperature = llmRequest.config?.temperature
    const topP = llmRequest.config?.topP
    const maxTokens = llmRequest.config?.maxOutputTokens
    if (temperature !== undefined) body.temperature = temperature
    if (topP !== undefined) body.top_p = topP
    // GPT-6 models refuse max_tokens and take max_completion_tokens instead.
    if (maxTokens !== undefined) body[this.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens
    const tools = openAiTools(llmRequest)
    if (tools.length) body.tools = tools
    return body
  }

  private async post(body: string, signal: AbortSignal | undefined): Promise<ChatCompletionsResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
        : AbortSignal.timeout(this.timeoutMs)
    })
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`${this.label} ${response.status}: ${bodyText.slice(0, 300)}`)
    }
    return (await response.json()) as ChatCompletionsResponse
  }

  private toResponse(result: ChatCompletionsResponse): LlmResponse {
    const choice = result.choices?.[0]
    const message = choice?.message
    const text = typeof message?.content === 'string' ? message.content.trim() : ''
    const functionCalls: Array<{ id?: string; name: string; args: JsonObject }> = []
    for (const toolCall of message?.tool_calls ?? []) {
      const args = parseJson(toolCall.function?.arguments ?? '')
      if (!isRecord(args)) {
        return {
          errorCode: 'MALFORMED_FUNCTION_CALL',
          errorMessage: `${this.label} returned malformed tool arguments`,
          finishReason: FinishReason.MALFORMED_FUNCTION_CALL
        }
      }
      functionCalls.push({
        id: this.legacyTranslation ? undefined : toolCall.id,
        name: toolCall.function?.name ?? '',
        args
      })
    }

    const parts: Part[] = []
    if (text) parts.push({ text })
    for (const call of functionCalls) {
      parts.push({
        functionCall: { ...(call.id ? { id: call.id } : {}), name: call.name, args: call.args },
        thoughtSignature: 'skip_thought_signature_validator'
      })
    }
    if (parts.length === 0) parts.push({ text: '' })

    const finishReason =
      choice?.finish_reason === 'length'
        ? FinishReason.MAX_TOKENS
        : choice?.finish_reason === 'content_filter'
          ? FinishReason.SAFETY
          : FinishReason.STOP
    const usage = result.usage
    return {
      content: { role: 'model', parts },
      finishReason,
      ...(usage
        ? {
            usageMetadata: {
              promptTokenCount: usage.prompt_tokens,
              candidatesTokenCount: usage.completion_tokens,
              totalTokenCount: usage.total_tokens
            }
          }
        : {})
    }
  }

  connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error(`${this.constructor.name} does not support live connections`)
  }
}

/** Today's fallback constructor, kept so the legacy route builds the adapter it always did. */
export class ModelScopeLlm extends ChatCompletionsLlm {
  constructor(options: Omit<ChatCompletionsOptions, 'provider'>) {
    super({ ...options, provider: 'modelscope' })
  }

  protected override get legacyTranslation(): boolean {
    return true
  }
}
