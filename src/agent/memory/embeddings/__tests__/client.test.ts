import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ embeddings: { provider: 'gemini' } }))
const factories = vi.hoisted(() => ({
  gemini: vi.fn(() => ({ embed: vi.fn() })),
  local: vi.fn(() => ({ embed: vi.fn() })),
  openai: vi.fn(() => ({ embed: vi.fn() }))
}))

vi.mock('../../../../config.js', () => ({ config: state }))
vi.mock('../gemini.js', () => ({ createGeminiEmbeddingClient: factories.gemini }))
vi.mock('../local.js', () => ({ createLocalEmbeddingClient: factories.local }))
vi.mock('../openai.js', () => ({ createOpenAiEmbeddingClient: factories.openai }))

import { getEmbeddingClient, resetEmbeddingClientForTest } from '../client.js'

describe('getEmbeddingClient', () => {
  beforeEach(() => {
    resetEmbeddingClientForTest()
    for (const factory of Object.values(factories)) factory.mockClear()
  })

  it.each(['gemini', 'local', 'openai'] as const)('builds the %s client from config.embeddings once', (provider) => {
    state.embeddings = { provider }

    const client = getEmbeddingClient()

    expect(getEmbeddingClient()).toBe(client)
    expect(factories[provider]).toHaveBeenCalledTimes(1)
    expect(factories[provider]).toHaveBeenCalledWith(state.embeddings)
    expect(client).toBe(factories[provider].mock.results[0]?.value)
  })
})
