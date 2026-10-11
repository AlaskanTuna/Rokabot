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

const JSON_OBJECT_INSTRUCTION = 'Reply with only a JSON object that matches this JSON Schema:'
// OpenAI strict mode rejects these keywords; the caller's own validation still enforces them on the reply.
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'minLength',
  'maxLength',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'propertyNames',
  'unevaluatedProperties',
  'uniqueItems',
  'contains',
  'minContains',
  'maxContains',
  'unevaluatedItems'
])

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function withSystemText(messages: ChatMessage[], text: string): void {
  const first = messages[0]
  if (first?.role === 'system') first.content = `${String(first.content)}\n\n${text}`
  else messages.unshift({ role: 'system', content: text })
}

function strictSchemas(value: unknown): unknown {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, strictSchema(child)]))
    : value
}

/** OpenAI strict mode: every property required, an optional one nullable instead, no extra keys, anyOf for oneOf. */
function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema)
  if (!isRecord(value)) return value
  const schema: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) continue
    schema[key === 'oneOf' ? 'anyOf' : key] =
      key === 'properties' || key === '$defs' ? strictSchemas(child) : strictSchema(child)
  }
  if (isRecord(schema.properties)) {
    const required = new Set(arrayOf(value.required))
    const properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, child]) => [
        name,
        required.has(name) ? child : { anyOf: [child, { type: 'null' }] }
      ])
    )
    schema.properties = properties
    schema.required = Object.keys(properties)
    schema.additionalProperties = false
  }
  return schema
}

function constsMatch(value: JsonObject, branch: unknown): boolean {
  const properties = isRecord(branch) && isRecord(branch.properties) ? branch.properties : {}
  return Object.entries(properties).every(
    ([name, property]) => !isRecord(property) || !('const' in property) || value[name] === property.const
  )
}

/** Strict mode answers an omitted optional field with null, where the caller's own schema expects no key at all. */
function withoutOptionalNulls(value: unknown, schema: unknown): unknown {
  if (!isRecord(schema)) return value
  const branches = [...arrayOf(schema.anyOf), ...arrayOf(schema.oneOf)]
  if (Array.isArray(value)) {
    let items: unknown = value.map((item) => withoutOptionalNulls(item, schema.items))
    for (const branch of branches) items = withoutOptionalNulls(items, branch)
    return items
  }
  if (!isRecord(value)) return value
  let result: JsonObject = value
  for (const branch of branches) {
    if (constsMatch(result, branch)) result = withoutOptionalNulls(result, branch) as JsonObject
  }
  if (!isRecord(schema.properties)) return result
  const properties = schema.properties
  const required = new Set(arrayOf(schema.required))
  return Object.fromEntries(
    Object.entries(result)
      .filter(([name, child]) => !(child === null && name in properties && !required.has(name)))
      .map(([name, child]) => [name, name in properties ? withoutOptionalNulls(child, properties[name]) : child])
  )
}

function structuredText(text: string, strictOriginal: JsonObject | undefined): string {
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (!strictOriginal) return unfenced
  const parsed = parseJson(unfenced)
  return parsed === undefined ? unfenced : JSON.stringify(withoutOptionalNulls(parsed, strictOriginal))
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
    const requested = shaped.config?.responseJsonSchema
    const schema = isRecord(requested) ? requested : undefined
    const strict = schema !== undefined && profile?.structuredOutput === 'json_schema_strict'

    const signal = abortSignal ?? shaped.config?.abortSignal
    const requestBody = this.requestBody(shaped, schema, strict)
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

    yield this.toResponse(result, schema, strict)
  }

  private requestBody(llmRequest: LlmRequest, schema: JsonObject | undefined, strict: boolean): JsonObject {
    // The legacy route always sent image bytes; a FALLBACK_MODEL override to an imageless profile must not stop that.
    const acceptsImages = this.legacyTranslation || (this.profile?.input.image ?? true)
    const messages = openAiMessages(llmRequest, acceptsImages, this.legacyTranslation)
    if (schema && !strict) withSystemText(messages, `${JSON_OBJECT_INSTRUCTION}\n${JSON.stringify(schema)}`)
    const body: JsonObject = {
      model: this.model,
      messages,
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
    if (schema) {
      body.response_format = strict
        ? { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: strictSchema(schema) } }
        : { type: 'json_object' }
    }
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

  private toResponse(result: ChatCompletionsResponse, schema: JsonObject | undefined, strict: boolean): LlmResponse {
    const choice = result.choices?.[0]
    const message = choice?.message
    const content = typeof message?.content === 'string' ? message.content.trim() : ''
    const text = schema ? structuredText(content, strict ? schema : undefined) : content
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
