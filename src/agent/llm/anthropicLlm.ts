import Anthropic from '@anthropic-ai/sdk'
import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content, Part } from '@google/genai'
import type { ResolvedModel } from '../../config.js'
import { splitStablePrefix } from '../promptAssembler.js'
import type { ModelProfile } from './profiles.js'
import { attachmentKind, attachmentMarker, functionDeclarations, shapeRequest, systemText } from './requestShape.js'

type Params = Anthropic.MessageCreateParamsNonStreaming
type Block = Anthropic.ContentBlockParam
type Effort = NonNullable<NonNullable<Params['output_config']>['effort']>
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export const STRUCTURED_OUTPUT_TOOL = 'emit_result'
// Thinking counts toward max_tokens on Claude, so a cap sized for the visible reply alone can be spent before any
// text is written, and the turn then ends empty.
const THINKING_HEADROOM_TOKENS = 2048
const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

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

function toolList(llmRequest: LlmRequest): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = functionDeclarations(llmRequest).map((declaration) => ({
    name: declaration.name,
    ...(declaration.description === undefined ? {} : { description: declaration.description }),
    input_schema: (declaration.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool['input_schema']
  }))
  const schema = llmRequest.config?.responseJsonSchema
  if (schema !== undefined) {
    tools.push({
      name: STRUCTURED_OUTPUT_TOOL,
      description: 'Return the requested JSON object as the input of this tool.',
      input_schema: schema as Anthropic.Tool['input_schema'],
      strict: true
    })
  }
  return tools
}

function thinkingParams(resolved: ResolvedModel): Pick<Params, 'thinking' | 'output_config'> {
  const effort = resolved.effort ?? resolved.profile.thinking.defaultEffort
  if (!effort) return {}
  if (effort === 'none') return { thinking: { type: 'disabled' } }
  return { thinking: { type: 'adaptive' }, output_config: { effort: effort as Effort } }
}

function toLlmResponse(message: Anthropic.Message): LlmResponse {
  const parts: Part[] = message.content.flatMap((block) =>
    block.type === 'text' && block.text.trim() ? [{ text: block.text }] : []
  )
  return {
    content: { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] },
    finishReason: FinishReason.STOP
  }
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
    const tools = toolList(working)
    const rendered = renderContents(working.contents, this.resolved.profile.input)
    const params = this.params(working, system, tools, rendered)
    const message = await this.client.messages.create(params, {
      signal: abortSignal ?? working.config?.abortSignal,
      timeout: this.resolved.timeoutMs
    })
    yield toLlmResponse(message)
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
    const thinking = thinkingParams(this.resolved)
    const headroom = thinking.thinking?.type === 'adaptive' ? THINKING_HEADROOM_TOKENS : 0
    return {
      model: this.model,
      max_tokens: (config?.maxOutputTokens ?? this.resolved.maxOutputTokens) + headroom,
      messages: mergeTurns(rendered),
      ...(system ? { system } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(config?.responseJsonSchema === undefined
        ? {}
        : { tool_choice: { type: 'tool' as const, name: STRUCTURED_OUTPUT_TOOL } }),
      ...(config?.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config?.topP === undefined ? {} : { top_p: config.topP }),
      ...thinking
    }
  }
}
