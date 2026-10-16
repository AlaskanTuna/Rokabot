export interface ReplyDiagnostic {
  provider: string
  modelId: string
  finishReason: string | null
  outputTokens?: number
  reasoningTokens?: number
  textPartCount: number
  reasoningPartCount: number
  functionCallPartCount: number
  reasoningTextLength: number
  historyEndedOnToolResult: boolean
}

export function historyEndedOnToolResult(contents: unknown): boolean {
  if (!Array.isArray(contents) || contents.length === 0) return false
  const last = contents.at(-1)
  if (!last || typeof last !== 'object') return false
  const message = last as { role?: unknown; parts?: unknown }
  if (message.role === 'function') return true
  return (
    Array.isArray(message.parts) &&
    message.parts.some((part) => Boolean(part && typeof part === 'object' && 'functionResponse' in part))
  )
}
