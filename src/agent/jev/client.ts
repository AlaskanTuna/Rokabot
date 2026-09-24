import { TypeSafeClient } from '@typesafe-ai/sdk'
import { Agent, fetch as undiciFetch } from 'undici'
import { config } from '../../config.js'

let client: TypeSafeClient | undefined
let jevAgent: Agent | undefined

const fetchWithKeepAlive: typeof fetch = (input, init) => {
  jevAgent ??= new Agent({ keepAliveTimeout: 60_000 })
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    {
      ...init,
      dispatcher: jevAgent
    } as Parameters<typeof undiciFetch>[1]
  ) as unknown as ReturnType<typeof fetch>
}

export function getJevClient(): TypeSafeClient | null {
  if (!config.jev.apiKey) return null
  client ??= new TypeSafeClient({
    apiKey: config.jev.apiKey,
    defaultModel: config.jev.model,
    timeout: config.jev.timeoutMs,
    retry: { maxRetries: 0 },
    logLevel: 'off',
    fetch: fetchWithKeepAlive
  })
  return client
}

export async function resetJevClientForTest(): Promise<void> {
  client = undefined
  const localAgent = jevAgent
  jevAgent = undefined
  await localAgent?.close()
}
