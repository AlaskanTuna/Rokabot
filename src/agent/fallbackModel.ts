import { AsyncLocalStorage } from 'node:async_hooks'
import { BaseLlm, Gemini } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Part } from '@google/genai'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export const modelRouteForRequest = new AsyncLocalStorage<{ useFallback: boolean }>()

/** Whether any model call of the current turn has fired a hedge; carried out on `response_events.hedged`. */
export const hedgeForRequest = new AsyncLocalStorage<{ hedged: boolean }>()

export type AnswerModel = 'gemini' | 'fallback'

/** Which provider produced a call's response, or null when the turn produced no answer to attribute. */
export const answerModelForRequest = new AsyncLocalStorage<{ model: AnswerModel | null }>()

type JsonObject = Record<string, unknown>
type ChatMessage = Record<string, unknown>

interface ModelScopeResponse {
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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function attachmentKind(mimeType: string | undefined): string {
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'PDF'
  return 'file'
}

function attachmentMarker(kind: string): string {
  return `(a ${kind} attachment that can't be opened right now)`
}

function systemText(instruction: unknown): string | undefined {
  if (typeof instruction === 'string') return instruction
  if (!isRecord(instruction)) return undefined
  if (typeof instruction.text === 'string') return instruction.text
  const parts = Array.isArray(instruction.parts) ? instruction.parts : []
  const text = parts
    .filter(isRecord)
    .map((part) => (typeof part.text === 'string' ? part.text : undefined))
    .filter((part): part is string => part !== undefined)
    .join('\n')
  return text || undefined
}

function toJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toJsonSchema)
  if (!isRecord(value)) return value

  const schema: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'propertyOrdering') continue
    if (key === 'type' && typeof child === 'string') {
      schema[key] = child.toLowerCase()
    } else if (key === 'type' && Array.isArray(child)) {
      schema[key] = child.map((type) => (typeof type === 'string' ? type.toLowerCase() : type))
    } else {
      schema[key] = toJsonSchema(child)
    }
  }
  return schema
}

function openAiTools(llmRequest: LlmRequest): ChatMessage[] {
  const declarations = (llmRequest.config?.tools ?? []).flatMap((tool) => {
    const declarationTool = tool as unknown as {
      functionDeclarations?: Array<{
        name?: string
        description?: string
        parameters?: unknown
        parametersJsonSchema?: unknown
      }>
    }
    return declarationTool.functionDeclarations ?? []
  })
  return declarations.map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name ?? '',
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
      ...(declaration.parametersJsonSchema !== undefined
        ? { parameters: declaration.parametersJsonSchema }
        : declaration.parameters !== undefined
          ? { parameters: toJsonSchema(declaration.parameters) }
          : {})
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

export class ModelScopeLlm extends BaseLlm {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor({
    model,
    apiKey,
    baseUrl,
    timeoutMs,
    fetchImpl = fetch
  }: {
    model: string
    apiKey: string
    baseUrl: string
    timeoutMs: number
    fetchImpl?: typeof fetch
  }) {
    super({ model })
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
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
      throw new Error(`ModelScope ${response.status}: ${bodyText.slice(0, 300)}`)
    }

    const result = (await response.json()) as ModelScopeResponse
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
          errorMessage: 'ModelScope returned malformed tool arguments',
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
    throw new Error('ModelScopeLlm does not support live connections')
  }
}

type RaceSide = 'gemini' | 'fallback'

type RaceOutcome =
  | { winner: RaceSide; responses: LlmResponse[]; error: null }
  | { winner: null; responses: null; error: { side: RaceSide; error: unknown } }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The fallback substitutes text markers for anything but images, so a hedge on such a turn would answer from
 * a request the user never sent. It costs the user their attachment to save them a few seconds — the tail
 * hedge exists to bound is better absorbed by `gemini.timeout`.
 */
function isHedgeEligible(llmRequest: LlmRequest): boolean {
  return !(llmRequest.contents ?? []).some((content) =>
    (content.parts ?? []).some((part) => {
      const mimeType = part.inlineData?.mimeType ?? part.fileData?.mimeType
      return Boolean(mimeType) && !mimeType?.startsWith('image/')
    })
  )
}

function withAbort(llmRequest: LlmRequest, signal: AbortSignal): LlmRequest {
  return { ...llmRequest, config: { ...llmRequest.config, abortSignal: signal } }
}

/**
 * Runs both sides of the hedge race and returns once one of them has finished, which is what "answered first"
 * means here: a non-streaming Gemini call yields its single response when the whole call is done, so finishing
 * and answering are the same event. The first side to finish settles the race and aborts the other, which is
 * why an aborted loser can only ever arrive as a rejection and never as a response.
 */
async function raceForWinner(
  llmRequest: LlmRequest,
  primary: BaseLlm,
  fallback: BaseLlm,
  hedgeAfterMs: number,
  onHedgeFired: () => void
): Promise<RaceOutcome> {
  const primaryAbort = new AbortController()
  const fallbackAbort = new AbortController()
  let settle: ((outcome: RaceOutcome) => void) | undefined
  const settled = new Promise<RaceOutcome>((resolve) => {
    settle = resolve
  })
  let winner: RaceOutcome | undefined

  const run = async (side: RaceSide, llm: BaseLlm, request: LlmRequest): Promise<RaceOutcome> => {
    const responses: LlmResponse[] = []
    try {
      for await (const response of llm.generateContentAsync(request)) responses.push(response)
      return { winner: side, responses, error: null }
    } catch (error) {
      return { winner: null, responses: null, error: { side, error } }
    }
  }

  const timer = setTimeout(() => {
    if (winner) return
    onHedgeFired()
    void run('fallback', fallback, withAbort(llmRequest, fallbackAbort.signal)).then((outcome) => {
      if (winner) return
      winner = outcome
      // The winner keeps the turn: its answer is the one the session is built on, tool calls included, so
      // the loser is the call to spend nothing on. The grace period leaves an un-aborted stack available
      // for a human debugging a lost race.
      setTimeout(() => primaryAbort.abort(), 2).unref?.()
      settle?.(outcome)
    })
  }, hedgeAfterMs)

  void run('gemini', primary, withAbort(llmRequest, primaryAbort.signal)).then((outcome) => {
    if (winner) return
    winner = outcome
    fallbackAbort.abort()
    settle?.(outcome)
  })

  const outcome = await settled
  clearTimeout(timer)
  return outcome
}

export class RoutedLlm extends BaseLlm {
  readonly fallbackModelName: string | undefined
  readonly hedgeAfterMs: number

  constructor(
    private readonly primary: BaseLlm,
    private readonly fallback: BaseLlm | null,
    hedgeAfterMs: number = config.gemini.hedgeAfterMs
  ) {
    super({ model: primary.model })
    this.fallbackModelName = fallback?.model
    this.hedgeAfterMs = hedgeAfterMs
  }

  get hasFallback(): boolean {
    return this.fallback !== null
  }

  async *generateContentAsync(llmRequest: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
    const onFallback = modelRouteForRequest.getStore()?.useFallback && this.fallback
    if (onFallback || !this.fallback || !hedgeForRequest.getStore()) {
      const selected = onFallback ? this.fallback : this.primary
      yield* selected.generateContentAsync(llmRequest, stream)
      return
    }
    if (this.hedgeAfterMs <= 0 || !isHedgeEligible(llmRequest)) {
      yield* this.primary.generateContentAsync(llmRequest, stream)
      return
    }

    const hedge = hedgeForRequest.getStore() as { hedged: boolean }
    const outcome = await raceForWinner(llmRequest, this.primary, this.fallback, this.hedgeAfterMs, () => {
      hedge.hedged = true
    })
    if (outcome.winner === null) {
      // One turn-level failure, unchanged for the ladder: the fallback's loss is logged and dropped, because
      // it is Gemini's outage that the switch policy, the sticky window and the retry budget are all keyed on.
      const { side, error } = outcome.error
      if (side === 'fallback') logger.warn({ err: error }, 'Hedged fallback call failed while Gemini was still running')
      throw side === 'gemini' ? error : new Error(`Both models failed (${errorText(error)})`)
    }

    const answer = answerModelForRequest.getStore()
    if (answer) answer.model = outcome.winner
    logger.warn(
      { winner: outcome.winner, hedgeAfterMs: this.hedgeAfterMs },
      'Hedged slow Gemini call; kept the faster answer'
    )
    yield* outcome.responses[Symbol.iterator]()
  }

  connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    return this.primary.connect(llmRequest)
  }
}

export function createRokaModel(): RoutedLlm {
  const primary = new Gemini({ model: config.gemini.model })
  const apiKey = config.fallback.apiKey
  const fallback = apiKey
    ? new ModelScopeLlm({
        model: config.fallback.model,
        apiKey,
        baseUrl: config.fallback.baseUrl,
        timeoutMs: config.fallback.timeoutMs
      })
    : null
  return new RoutedLlm(primary, fallback)
}
