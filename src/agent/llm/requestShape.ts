import type { LlmRequest } from '@google/adk'
import type { ModelProfile, ProviderId } from './profiles.js'

type JsonObject = Record<string, unknown>

/** What shaping needs to know about the target; a `ResolvedModel` from `src/config.ts` satisfies it. */
export interface ShapeTarget {
  provider: ProviderId
  profile: ModelProfile
  maxOutputTokens: number
}

export interface DeclaredFunction {
  name: string
  description?: string
  /** JSON Schema; converted from Gemini's Schema when the declaration carries no JSON Schema of its own. */
  parameters?: unknown
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function attachmentKind(mimeType: string | undefined): string {
  if (mimeType?.startsWith('audio/')) return 'audio'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'PDF'
  return 'file'
}

export function attachmentMarker(kind: string): string {
  return `(a ${kind} attachment that can't be opened right now)`
}

export function systemText(instruction: unknown): string | undefined {
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

export function functionDeclarations(llmRequest: LlmRequest): DeclaredFunction[] {
  return (llmRequest.config?.tools ?? []).flatMap((tool) => {
    const declarationTool = tool as unknown as {
      functionDeclarations?: Array<{
        name?: string
        description?: string
        parameters?: unknown
        parametersJsonSchema?: unknown
      }>
    }
    return (declarationTool.functionDeclarations ?? []).map((declaration) => ({
      name: declaration.name ?? '',
      ...(declaration.description === undefined ? {} : { description: declaration.description }),
      ...(declaration.parametersJsonSchema !== undefined
        ? { parameters: declaration.parametersJsonSchema }
        : declaration.parameters !== undefined
          ? { parameters: toJsonSchema(declaration.parameters) }
          : {})
    }))
  })
}

/** Drops what the target rejects and clamps the output cap; `contents` stays shared, as ADK's Gemini expects. */
export function shapeRequest(llmRequest: LlmRequest, target: ShapeTarget): LlmRequest {
  if (!llmRequest.config) return llmRequest
  const { temperature, topP, safetySettings, maxOutputTokens, ...rest } = llmRequest.config
  return {
    ...llmRequest,
    config: {
      ...rest,
      ...(temperature !== undefined && target.profile.sampling.temperature ? { temperature } : {}),
      ...(topP !== undefined && target.profile.sampling.topP ? { topP } : {}),
      ...(safetySettings !== undefined && target.provider === 'gemini' ? { safetySettings } : {}),
      maxOutputTokens: Math.min(maxOutputTokens ?? target.maxOutputTokens, target.maxOutputTokens)
    }
  }
}
