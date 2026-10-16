import { createHash } from 'node:crypto'
import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content, Part } from '@google/genai'
import type { ResolvedModel } from '../../config.js'
import { type ModelRoute, modelRouteForRequest } from '../fallbackModel.js'
import { splitStablePrefix } from '../promptAssembler.js'
import { markBillingExhausted, requestTokenEstimate, startCall } from './budget.js'
import type { ModelProfile } from './profiles.js'
import { ProviderError } from './providerError.js'
import { historyEndedOnToolResult } from './replyDiagnostic.js'
import {
  attachmentKind,
  attachmentMarker,
  functionDeclarations,
  isRecord,
  shapeRequest,
  systemText
} from './requestShape.js'
import { type CallUsage, type Workload, recordUsage, workloadOf } from './usage.js'

type Params = Anthropic.MessageCreateParamsNonStreaming
type Block = Anthropic.ContentBlockParam
type Effort = NonNullable<NonNullable<Params['output_config']>['effort']>
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export const STRUCTURED_OUTPUT_TOOL = 'emit_result'
// Thinking counts toward max_tokens on Claude, so a cap sized for the visible reply alone can be spent before any
// text is written, and the turn then ends empty.
const THINKING_HEADROOM_TOKENS = 2048
export const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const BILLING_PATTERN = /credit balance|billing/i
const CONTEXT_PATTERN = /prompt is too long|context window|too many (?:input )?tokens/i

export interface AnthropicMessagesClient {
  messages: {
    create(body: Params, options?: { signal?: AbortSignal; timeout?: number }): PromiseLike<Anthropic.Message>
  }
}

interface Rendered {
  role: 'user' | 'assistant'
  content: Block[]
}

interface PendingCall {
  id: string
  name: string
  hasProviderId: boolean
  answered: boolean
}

interface ThinkingReplay {
  prefixHash: string
  toolUseIds: string[]
  content: Block[]
}

// Keyed by the turn's route, so a turn's thinking is dropped with the turn and never reaches the next (D10).
const thinkingByTurn = new WeakMap<ModelRoute, Map<string, ThinkingReplay>>()

function prefixHash(system: unknown, tools: unknown, messages: Rendered[]): string {
  return createHash('sha256').update(JSON.stringify({ system, tools, messages })).digest('hex')
}

function toolUseIds(content: Block[]): string[] {
  return content.flatMap((block) => (block.type === 'tool_use' ? [block.id] : []))
}

function toParam(block: Anthropic.ContentBlock): Block[] {
  switch (block.type) {
    case 'thinking':
      return [{ type: 'thinking', thinking: block.thinking, signature: block.signature }]
    case 'redacted_thinking':
      return [{ type: 'redacted_thinking', data: block.data }]
    case 'text':
      return block.text.trim() ? [{ type: 'text', text: block.text }] : []
    case 'tool_use':
      return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input }]
    default:
      return []
  }
}

/** Claude rejects a thinking block whose prefix (system, tools, earlier messages) changed, so a block goes back
 * only when the prefix hash taken when it was produced still matches; otherwise the plain ADK rendering is sent. */
function replayThinking(
  rendered: Rendered[],
  system: unknown,
  tools: unknown,
  route: ModelRoute | undefined
): Rendered[] {
  const turn = route ? thinkingByTurn.get(route) : undefined
  if (!turn) return rendered
  const replayed: Rendered[] = []
  for (const message of rendered) {
    const ids = message.role === 'assistant' ? toolUseIds(message.content) : []
    const record = ids.length > 0 ? turn.get(ids[0]) : undefined
    const intact =
      record !== undefined &&
      record.toolUseIds.join() === ids.join() &&
      record.prefixHash === prefixHash(system, tools, replayed)
    replayed.push(intact && record ? { role: 'assistant', content: record.content } : message)
  }
  return replayed
}

function rememberThinking(
  route: ModelRoute | undefined,
  message: Anthropic.Message,
  replayWithinTurn: boolean,
  prefix: string
): void {
  if (!route || !replayWithinTurn || message.stop_reason !== 'tool_use') return
  const content = message.content.flatMap(toParam)
  const ids = toolUseIds(content)
  if (ids.length === 0 || !content.some((block) => block.type === 'thinking' || block.type === 'redacted_thinking'))
    return
  const turn = thinkingByTurn.get(route) ?? new Map<string, ThinkingReplay>()
  turn.set(ids[0], { prefixHash: prefix, toolUseIds: ids, content })
  thinkingByTurn.set(route, turn)
}

function markerBlock(mimeType: string | undefined): Block {
  return { type: 'text', text: attachmentMarker(attachmentKind(mimeType)) }
}

function mediaBlock(mimeType: string | undefined, data: string | undefined, input: ModelProfile['input']): Block {
  if (data && mimeType && IMAGE_TYPES.has(mimeType) && input.image) {
    return { type: 'image', source: { type: 'base64', media_type: mimeType as ImageMediaType, data } }
  }
  if (data && mimeType === 'application/pdf' && input.pdf) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  return markerBlock(mimeType)
}

/** One message per ADK content, before same-role merging. Leading model turns are dropped (Claude must open on
 * a user turn), and a tool call is kept only when the next content answers it, since Claude 400s on either. */
function renderContents(contents: Content[], input: ModelProfile['input']): Rendered[] {
  const rendered: Rendered[] = []
  let open: { message: Rendered; calls: PendingCall[] } | undefined
  const close = () => {
    if (!open) return
    const answered = new Set(open.calls.filter((call) => call.answered).map((call) => call.id))
    open.message.content = open.message.content.filter((block) => block.type !== 'tool_use' || answered.has(block.id))
    open = undefined
  }
  const firstUser = contents.findIndex((content) => content.role !== 'model')

  for (const [index, content] of contents.entries()) {
    if (firstUser === -1 || index < firstUser) continue
    const parts = (content.parts ?? []).filter((part) => !part.thought)

    if (content.role === 'model') {
      close()
      const message: Rendered = { role: 'assistant', content: [] }
      const calls: PendingCall[] = []
      for (const [partIndex, part] of parts.entries()) {
        if (part.functionCall) {
          const name = part.functionCall.name ?? ''
          // ADK strips its own adk- ids before the model sees them, so id-less history needs a stable stand-in.
          const id = part.functionCall.id ?? `toolu_rk${index}_${partIndex}`
          calls.push({ id, name, hasProviderId: part.functionCall.id !== undefined, answered: false })
          message.content.push({ type: 'tool_use', id, name, input: part.functionCall.args ?? {} })
        } else if (part.text?.trim()) {
          message.content.push({ type: 'text', text: part.text })
        } else if (part.inlineData || part.fileData) {
          message.content.push(markerBlock(part.inlineData?.mimeType ?? part.fileData?.mimeType))
        }
      }
      rendered.push(message)
      open = { message, calls }
      continue
    }

    const results: Block[] = []
    const others: Block[] = []
    for (const part of parts) {
      const response = part.functionResponse
      if (response) {
        const body = JSON.stringify(response.response ?? {})
        const call = open?.calls.find(
          (candidate) =>
            !candidate.answered &&
            (response.id ? candidate.id === response.id : !candidate.hasProviderId && candidate.name === response.name)
        )
        if (call) {
          call.answered = true
          results.push({ type: 'tool_result', tool_use_id: call.id, content: body })
        } else {
          others.push({ type: 'text', text: `(result of ${response.name ?? 'a tool'}: ${body})` })
        }
      } else if (part.text?.trim()) {
        others.push({ type: 'text', text: part.text })
      } else if (part.inlineData) {
        others.push(mediaBlock(part.inlineData.mimeType, part.inlineData.data, input))
      } else if (part.fileData) {
        others.push(markerBlock(part.fileData.mimeType))
      }
    }
    close()
    rendered.push({ role: 'user', content: [...results, ...others] })
  }
  close()
  return rendered.filter((message) => message.content.length > 0)
}

function mergeTurns(rendered: Rendered[]): Anthropic.MessageParam[] {
  const messages: Array<{ role: 'user' | 'assistant'; content: Block[] }> = []
  for (const message of rendered) {
    const last = messages.at(-1)
    if (last?.role === message.role) last.content.push(...message.content)
    else messages.push({ role: message.role, content: [...message.content] })
  }
  for (const message of messages) {
    // Claude requires a user turn's tool results ahead of anything else in it; sort is stable, so order holds.
    if (message.role === 'user') {
      message.content.sort((left, right) => Number(right.type === 'tool_result') - Number(left.type === 'tool_result'))
    }
  }
  return messages
}

function systemBlocks(instruction: unknown): Anthropic.TextBlockParam[] | undefined {
  const text = systemText(instruction)
  if (!text) return undefined
  const split = splitStablePrefix(text)
  if (!split) return [{ type: 'text', text }]
  return [
    { type: 'text', text: split.stable, cache_control: { type: 'ephemeral' } },
    ...(split.rest.trim() ? [{ type: 'text' as const, text: split.rest }] : [])
  ]
}

function toolList(llmRequest: LlmRequest, profile: ModelProfile): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = functionDeclarations(llmRequest).map((declaration) => ({
    name: declaration.name,
    ...(declaration.description === undefined ? {} : { description: declaration.description }),
    input_schema: (declaration.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema']
  }))
  const schema = llmRequest.config?.responseJsonSchema
  // Sonnet 400s on forced tool use, so json_schema_strict profiles carry the schema in output_config.format instead.
  if (schema !== undefined && structuredVia(profile) !== 'json_schema_strict') {
    tools.push({
      name: STRUCTURED_OUTPUT_TOOL,
      description: 'Return the requested JSON object as the input of this tool.',
      input_schema: schema as Anthropic.Tool['input_schema'],
      strict: true
    })
  }
  return tools
}

/** How a structured request is carried: the forced emit_result tool, or output_config.format for models that 400
 * on forced tool use (Sonnet). */
function structuredVia(profile: ModelProfile): 'forced_tool' | 'json_schema_strict' | undefined {
  return profile.structuredOutput === 'forced_tool' || profile.structuredOutput === 'json_schema_strict'
    ? profile.structuredOutput
    : undefined
}

function thinkingParams(resolved: ResolvedModel, schema: unknown): Pick<Params, 'thinking' | 'output_config'> {
  const effort = resolved.effort ?? resolved.profile.thinking.defaultEffort
  const strict = schema !== undefined && structuredVia(resolved.profile) === 'json_schema_strict'
  const format = strict
    ? { type: 'json_schema' as const, schema: schema as Anthropic.JSONOutputFormat['schema'] }
    : undefined
  if (!effort) return format ? { output_config: { format } } : {}
  if (effort === 'none') {
    return {
      thinking: { type: resolved.profile.thinking.offMode ?? 'disabled' },
      ...(format ? { output_config: { format } } : {})
    }
  }
  return { thinking: { type: 'adaptive' }, output_config: { effort: effort as Effort, ...(format ? { format } : {}) } }
}

function replyParts(message: Anthropic.Message): Part[] {
  return message.content.flatMap((block): Part[] => {
    if (block.type === 'text') return block.text.trim() ? [{ text: block.text }] : []
    if (block.type !== 'tool_use') return []
    if (!isRecord(block.input)) {
      throw new ProviderError({
        provider: 'anthropic',
        kind: 'malformed_tool_args',
        message: `Anthropic returned non-object arguments for ${block.name}`
      })
    }
    // Gemini rejects an unsigned function call in the current turn; the tag lets it continue a turn Claude began.
    return [
      {
        functionCall: { id: block.id, name: block.name, args: block.input },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ]
  })
}

function structuredParts(message: Anthropic.Message): Part[] {
  const result = message.content.find((block) => block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_TOOL)
  return result?.type === 'tool_use' ? [{ text: JSON.stringify(result.input) }] : []
}

// Thinking tokens are part of output_tokens and billed at the output rate, so they get no bucket of their own.
function callUsage(model: string, workload: Workload, usage: Anthropic.Usage): CallUsage {
  return {
    provider: 'anthropic',
    model,
    workload,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    ...(usage.cache_read_input_tokens ? { cacheReadTokens: usage.cache_read_input_tokens } : {}),
    ...(usage.cache_creation_input_tokens ? { cacheWriteTokens: usage.cache_creation_input_tokens } : {})
  }
}

function usageMetadata(usage: Anthropic.Usage): NonNullable<LlmResponse['usageMetadata']> {
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const prompt = usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0)
  const reasoning = usage.output_tokens_details?.thinking_tokens
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: usage.output_tokens,
    totalTokenCount: prompt + usage.output_tokens,
    ...(cacheRead ? { cachedContentTokenCount: cacheRead } : {}),
    ...(reasoning ? { thoughtsTokenCount: reasoning } : {})
  }
}

function toLlmResponse(
  message: Anthropic.Message,
  structured: boolean,
  model: string,
  requestContents: unknown
): LlmResponse {
  if (message.stop_reason === 'refusal') {
    throw new ProviderError({
      provider: 'anthropic',
      kind: 'refusal',
      message: `Anthropic refused the request (${message.stop_details?.category ?? 'no category'})`
    })
  }
  const parts = structured ? structuredParts(message) : replyParts(message)
  const truncated = message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded'
  const textPartCount = message.content.filter((block) => block.type === 'text' && block.text.trim()).length
  const thinkingBlocks = message.content.filter(
    (block) => block.type === 'thinking' || block.type === 'redacted_thinking'
  )
  const toolUseCount = message.content.filter((block) => block.type === 'tool_use').length
  const reasoningTextLength = message.content.reduce(
    (length, block) => length + (block.type === 'thinking' ? block.thinking.length : 0),
    0
  )
  const outputTokens = message.usage.output_tokens
  const reasoningTokens = message.usage.output_tokens_details?.thinking_tokens
  const hasVisibleText = parts.some((part) => part.text?.trim())
  const replyDiagnostic = {
    provider: 'anthropic',
    modelId: model,
    finishReason: message.stop_reason,
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    textPartCount,
    reasoningPartCount: thinkingBlocks.length,
    functionCallPartCount: toolUseCount,
    reasoningTextLength,
    historyEndedOnToolResult: historyEndedOnToolResult(requestContents)
  }
  return {
    content: { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] },
    finishReason: truncated ? FinishReason.MAX_TOKENS : FinishReason.STOP,
    usageMetadata: usageMetadata(message.usage),
    ...(!hasVisibleText || thinkingBlocks.length > 0 || toolUseCount > 0 ? { customMetadata: { replyDiagnostic } } : {})
  }
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const value = headers?.get('retry-after')
  const seconds = value ? Number(value) : Number.NaN
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

export function classifyAnthropicError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof APIUserAbortError || error instanceof APIConnectionError) {
    return new ProviderError({
      provider: 'anthropic',
      kind: 'network',
      message: `Anthropic ${error.message}`,
      cause: error
    })
  }
  if (!(error instanceof APIError)) {
    const message = error instanceof Error ? error.message : String(error)
    return new ProviderError({ provider: 'anthropic', kind: 'terminal', message, cause: error })
  }
  const { status } = error
  const failure = {
    provider: 'anthropic' as const,
    message: `Anthropic ${status ?? ''} ${error.type ?? 'error'}: ${error.message}`.slice(0, 300),
    status,
    cause: error
  }
  if (status === 402 || error.type === 'billing_error' || BILLING_PATTERN.test(error.message)) {
    return new ProviderError({ ...failure, kind: 'billing_exhausted' })
  }
  if (status === 413 || (status === 400 && CONTEXT_PATTERN.test(error.message))) {
    return new ProviderError({ ...failure, kind: 'context_length' })
  }
  if (status === 429) {
    return new ProviderError({ ...failure, kind: 'transient_http', retryAfterMs: retryAfterMs(error.headers) })
  }
  if (error.type === 'overloaded_error' || (status !== undefined && status >= 500)) {
    return new ProviderError({ ...failure, kind: 'transient_http' })
  }
  return new ProviderError({ ...failure, kind: 'terminal' })
}

export class AnthropicLlm extends BaseLlm {
  private readonly resolved: ResolvedModel
  private readonly client: AnthropicMessagesClient

  constructor({ resolved, client }: { resolved: ResolvedModel; client?: AnthropicMessagesClient }) {
    super({ model: resolved.model })
    this.resolved = resolved
    this.client =
      client ??
      new Anthropic({
        apiKey: resolved.apiKey,
        ...(resolved.baseUrl ? { baseURL: resolved.baseUrl } : {}),
        maxRetries: 0,
        timeout: resolved.timeoutMs
      })
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    const shaped = shapeRequest(llmRequest, this.resolved)
    const working: LlmRequest = { ...shaped, contents: [...shaped.contents] }
    this.maybeAppendUserContent(working)
    const system = systemBlocks(working.config?.systemInstruction)
    const tools = toolList(working, this.resolved.profile)
    const route = modelRouteForRequest.getStore()
    const rendered = replayThinking(renderContents(working.contents, this.resolved.profile.input), system, tools, route)
    // Only a forced_tool profile with a schema reads tool_use input back as the JSON; a json_schema_strict one
    // (Sonnet) answers a structured request in the plain text.
    const structured =
      structuredVia(this.resolved.profile) === 'forced_tool' && working.config?.responseJsonSchema !== undefined
    const params = this.params(working, system, tools, rendered)
    const workload = workloadOf(working)
    const signal = abortSignal ?? working.config?.abortSignal
    const reservation = await startCall({
      provider: 'anthropic',
      model: this.model,
      workload,
      estTokens: requestTokenEstimate(params),
      signal
    })
    let message: Anthropic.Message
    try {
      message = await this.client.messages.create(params, { signal, timeout: this.resolved.timeoutMs })
    } catch (error) {
      reservation.release()
      const failure = classifyAnthropicError(error)
      if (failure.kind === 'billing_exhausted') markBillingExhausted('anthropic')
      throw failure
    }
    const usage = callUsage(this.model, workload, message.usage)
    recordUsage(usage)
    reservation.release(usage)
    rememberThinking(
      route,
      message,
      this.resolved.profile.thinking.replayWithinTurn,
      prefixHash(system, tools, rendered)
    )
    yield toLlmResponse(message, structured, this.resolved.model, llmRequest.contents)
  }

  connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('AnthropicLlm does not support live connections')
  }

  private params(
    llmRequest: LlmRequest,
    system: Anthropic.TextBlockParam[] | undefined,
    tools: Anthropic.Tool[],
    rendered: Rendered[]
  ): Params {
    const config = llmRequest.config
    const thinking = thinkingParams(this.resolved, config?.responseJsonSchema)
    const headroom = thinking.thinking?.type === 'adaptive' ? THINKING_HEADROOM_TOKENS : 0
    const via = structuredVia(this.resolved.profile)
    return {
      model: this.model,
      max_tokens: (config?.maxOutputTokens ?? this.resolved.maxOutputTokens) + headroom,
      messages: mergeTurns(rendered),
      ...(system ? { system } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      // Sonnet 400s on any forced tool_choice, so only forced_tool profiles may send it.
      ...(config?.responseJsonSchema === undefined || via !== 'forced_tool'
        ? {}
        : { tool_choice: { type: 'tool' as const, name: STRUCTURED_OUTPUT_TOOL } }),
      ...(config?.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config?.topP === undefined ? {} : { top_p: config.topP }),
      ...thinking
    }
  }
}
