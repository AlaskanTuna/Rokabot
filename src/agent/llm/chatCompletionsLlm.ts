import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Part } from '@google/genai'
import { requestTokenEstimate, startCall } from './budget.js'
import { attachmentKind, attachmentMarker, functionDeclarations, isRecord, systemText } from './requestShape.js'
import { type CallUsage, recordUsage, workloadOf } from './usage.js'

type JsonObject = Record<string, unknown>
type ChatMessage = Record<string, unknown>

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface GeneratedCall {
  id: string
  name: string
  args: unknown
  sequence: number
  answered?: ChatMessage
}

interface MessageGroup {
  message: ChatMessage
  calls: GeneratedCall[]
}

interface MessageEntry {
  message: ChatMessage
  group?: MessageGroup
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

function textContent(
  parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  if (parts.some((part) => part.type === 'image_url')) return parts
  return parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
}

function openAiMessages(llmRequest: LlmRequest): ChatMessage[] {
  const messages: ChatMessage[] = []
  const instruction = systemText(llmRequest.config?.systemInstruction)
  if (instruction) messages.push({ role: 'system', content: instruction })

  const pendingCalls = new Map<string, GeneratedCall[]>()
  const entries: MessageEntry[] = []
  let callSequence = 0
  const addFunctionResponse = (name: string, response: unknown, onUnmatched: (text: string) => void) => {
    const call = pendingCalls.get(name)?.find((candidate) => candidate.answered === undefined)
    if (!call) {
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
      for (const part of parts) {
        if (part.thought) continue
        if (part.functionResponse) {
          addFunctionResponse(part.functionResponse.name ?? '', part.functionResponse.response, (text) =>
            unmatchedResponses.push(text)
          )
          continue
        }
        if (part.text !== undefined) textParts.push(part.text)
        if (part.functionCall) {
          const call: GeneratedCall = {
            id: `call_${++callSequence}`,
            name: part.functionCall.name ?? '',
            args: part.functionCall.args ?? {},
            sequence: callSequence
          }
          calls.push(call)
          const sameName = pendingCalls.get(call.name) ?? []
          sameName.push(call)
          pendingCalls.set(call.name, sameName)
        }
        if (part.inlineData || part.fileData) {
          textParts.push(attachmentMarker(attachmentKind(part.inlineData?.mimeType ?? part.fileData?.mimeType)))
        }
      }
      const group: MessageGroup = {
        message: {
          role: 'assistant',
          content: textParts.length ? textParts.join('\n') : null,
          ...(calls.length
            ? {
                tool_calls: calls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args)
                  }
                }))
              }
            : {})
        },
        calls
      }
      if (textParts.length || calls.length) entries.push({ message: group.message, group })
      if (unmatchedResponses.length) entries.push({ message: { role: 'user', content: unmatchedResponses.join('\n') } })
      continue
    }

    const userParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
    for (const part of parts) {
      if (part.thought) continue
      if (part.functionResponse) {
        addFunctionResponse(part.functionResponse.name ?? '', part.functionResponse.response, (text) =>
          userParts.push({ type: 'text', text })
        )
        continue
      }
      if (part.text !== undefined) userParts.push({ type: 'text', text: part.text })
      if (part.inlineData || part.fileData) {
        const inlineData = part.inlineData
        const mimeType = inlineData?.mimeType
        if (inlineData && mimeType?.startsWith('image/')) {
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
    messages.push(entry.message)
    if (entry.group) {
      for (const call of entry.group.calls.sort((left, right) => left.sequence - right.sequence)) {
        if (call.answered) messages.push(call.answered)
      }
    }
  }
  return messages
}

export type ChatCompletionsProvider = 'openai' | 'modelscope'

const PROVIDER_LABELS: Readonly<Record<ChatCompletionsProvider, string>> = {
  openai: 'OpenAI',
  modelscope: 'ModelScope'
}

export interface ChatCompletionsOptions {
  provider: ChatCompletionsProvider
  model: string
  apiKey: string
  baseUrl: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export class ChatCompletionsLlm extends BaseLlm {
  readonly provider: ChatCompletionsProvider
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ChatCompletionsOptions) {
    super({ model: options.model })
    this.provider = options.provider
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl
    this.timeoutMs = options.timeoutMs
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async *generateContentAsync(llmRequest: LlmRequest, _stream?: boolean): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)

    const externalSignal = llmRequest.config?.abortSignal
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: openAiMessages(llmRequest),
      enable_thinking: false,
      stream: false
    }
    const temperature = llmRequest.config?.temperature
    const topP = llmRequest.config?.topP
    const maxTokens = llmRequest.config?.maxOutputTokens
    if (temperature !== undefined) requestBody.temperature = temperature
    if (topP !== undefined) requestBody.top_p = topP
    if (maxTokens !== undefined) requestBody.max_tokens = maxTokens
    const tools = openAiTools(llmRequest)
    if (tools.length) requestBody.tools = tools

    const workload = workloadOf(llmRequest)
    const reservation = await startCall({
      provider: this.provider,
      model: this.model,
      workload,
      estTokens: requestTokenEstimate([llmRequest.config?.systemInstruction, llmRequest.contents]),
      signal: externalSignal
    })

    let result: ChatCompletionsResponse
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: externalSignal
          ? AbortSignal.any([externalSignal, AbortSignal.timeout(this.timeoutMs)])
          : AbortSignal.timeout(this.timeoutMs)
      })
      if (!response.ok) {
        const bodyText = await response.text()
        throw new Error(`${PROVIDER_LABELS[this.provider]} ${response.status}: ${bodyText.slice(0, 300)}`)
      }

      result = (await response.json()) as ChatCompletionsResponse
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

    const choice = result.choices?.[0]
    const message = choice?.message
    const text = typeof message?.content === 'string' ? message.content.trim() : ''
    const functionCalls: Array<{ name: string; args: JsonObject }> = []
    for (const toolCall of message?.tool_calls ?? []) {
      try {
        const args: unknown = JSON.parse(toolCall.function?.arguments ?? '')
        if (!isRecord(args)) throw new Error('Tool arguments must be a JSON object')
        functionCalls.push({ name: toolCall.function?.name ?? '', args })
      } catch {
        yield {
          errorCode: 'MALFORMED_FUNCTION_CALL',
          errorMessage: `${PROVIDER_LABELS[this.provider]} returned malformed tool arguments`,
          finishReason: FinishReason.MALFORMED_FUNCTION_CALL
        }
        return
      }
    }

    const parts: Part[] = []
    if (text) parts.push({ text })
    for (const call of functionCalls) {
      parts.push({
        functionCall: { name: call.name, args: call.args },
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
    const usageMetadata = result.usage
      ? {
          promptTokenCount: result.usage.prompt_tokens,
          candidatesTokenCount: result.usage.completion_tokens,
          totalTokenCount: result.usage.total_tokens
        }
      : undefined

    yield {
      content: { role: 'model', parts },
      finishReason,
      ...(usageMetadata === undefined ? {} : { usageMetadata })
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
}
