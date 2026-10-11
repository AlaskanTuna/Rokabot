import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
  clientOptions: [] as Array<{ apiKey?: string }>
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: mocks.embedContent }

    constructor(options: { apiKey?: string }) {
      mocks.clientOptions.push(options)
    }
  }
}))

import { config } from '../../../../config.js'
import { createGeminiEmbeddingClient } from '../gemini.js'

function vector768(): number[] {
  return Array.from({ length: 768 }, () => 0.25)
}

describe('Gemini embedding client', () => {
  beforeEach(() => {
    mocks.embedContent.mockReset()
    mocks.clientOptions.length = 0
  })

  it("sends today's gemini-embedding-2 query request and returns a vector in the Gemini space", async () => {
    const vector = vector768()
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector }] })

    await expect(
      createGeminiEmbeddingClient(config.embeddings).embed('We planned a picnic.', 'query')
    ).resolves.toEqual({
      values: vector,
      modelId: 'gemini-embedding-2',
      dim: 768,
      fingerprint: 'gemini:gemini-embedding-2:768:gemini-task-prefix'
    })
    expect(mocks.clientOptions).toEqual([{ apiKey: config.gemini.apiKey }])
    expect(mocks.embedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-2',
      contents: 'task: search result | query: We planned a picnic.',
      config: {
        outputDimensionality: 768,
        httpOptions: { timeout: config.memory.embeddingTimeoutMs }
      }
    })
    expect(mocks.embedContent.mock.calls[0]?.[0].config).not.toHaveProperty('taskType')
  })

  it('uses the document prefix for documents', async () => {
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector768() }] })

    await createGeminiEmbeddingClient(config.embeddings).embed('The group planned a picnic.', 'document')

    expect(mocks.embedContent.mock.calls[0]?.[0].contents).toBe('title: none | text: The group planned a picnic.')
  })

  it('passes the abort signal to the SDK request', async () => {
    const controller = new AbortController()
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector768() }] })

    await createGeminiEmbeddingClient(config.embeddings).embed('Picnic plan', 'query', controller.signal)

    expect(mocks.embedContent.mock.calls[0]?.[0].config.abortSignal).toBe(controller.signal)
  })

  it('creates the SDK client once per embedding client', async () => {
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector768() }] })
    const client = createGeminiEmbeddingClient(config.embeddings)

    await client.embed('one', 'query')
    await client.embed('two', 'document')

    expect(mocks.clientOptions).toHaveLength(1)
  })

  it.each([
    ['missing values', { embeddings: [{}] }],
    ['missing embeddings', {}],
    ['a short vector', { embeddings: [{ values: Array(767).fill(0.25) }] }],
    ['a long vector', { embeddings: [{ values: Array(769).fill(0.25) }] }],
    ['NaN values', { embeddings: [{ values: [Number.NaN, ...Array(767).fill(0.25)] }] }],
    ['infinite values', { embeddings: [{ values: [Number.POSITIVE_INFINITY, ...Array(767).fill(0.25)] }] }]
  ])('rejects %s from Gemini', async (_label, response) => {
    mocks.embedContent.mockResolvedValue(response)

    await expect(createGeminiEmbeddingClient(config.embeddings).embed('Picnic plan', 'query')).rejects.toThrow(
      'Gemini returned an invalid episode embedding'
    )
  })
})
