import { config } from '../../../config.js'
import { createGeminiEmbeddingClient } from './gemini.js'
import { createLocalEmbeddingClient } from './local.js'
import { createOpenAiEmbeddingClient } from './openai.js'

export type EmbeddingRole = 'document' | 'query'

export interface EmbeddingResult {
  values: number[]
  modelId: string
  dim: number
  fingerprint: string
}

export interface EmbeddingClient {
  embed(text: string, role: EmbeddingRole, signal?: AbortSignal): Promise<EmbeddingResult>
}

export type EmbeddingSettings = typeof config.embeddings

const FACTORIES: Readonly<Record<EmbeddingSettings['provider'], (settings: EmbeddingSettings) => EmbeddingClient>> = {
  gemini: createGeminiEmbeddingClient,
  local: createLocalEmbeddingClient,
  openai: createOpenAiEmbeddingClient
}

let client: EmbeddingClient | undefined
let testClient: EmbeddingClient | undefined

export function getEmbeddingClient(): EmbeddingClient {
  if (testClient) return testClient
  client ??= FACTORIES[config.embeddings.provider](config.embeddings)
  return client
}

export function resetEmbeddingClientForTest(): void {
  client = undefined
}

export function __setEmbeddingClientForTest(override: EmbeddingClient | undefined): void {
  testClient = override
  if (!override) client = undefined
}
