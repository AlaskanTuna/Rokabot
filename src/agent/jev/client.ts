import { TypeSafeClient } from '@typesafe-ai/sdk'
import { config } from '../../config.js'

let client: TypeSafeClient | undefined

export function getJevClient(): TypeSafeClient | null {
  if (!config.jev.apiKey) return null
  client ??= new TypeSafeClient({
    apiKey: config.jev.apiKey,
    defaultModel: config.jev.model,
    timeout: config.jev.timeoutMs,
    retry: { maxRetries: 0 },
    logLevel: 'off'
  })
  return client
}

export function resetJevClientForTest(): void {
  client = undefined
}
