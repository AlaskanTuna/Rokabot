import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
  clientOptions: [] as Array<{ apiKey: string }>
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: mocks.embedContent }

    constructor(options: { apiKey: string }) {
      mocks.clientOptions.push(options)
    }
  }
}))

import { config } from '../../../config.js'
import { embedEpisodeText, resetEpisodeEmbeddingClientForTest } from '../episodeEmbeddings.js'

function vector768(): number[] {
  return Array.from({ length: 768 }, () => 0.25)
}

describe('episode embeddings', () => {
  beforeEach(() => {
    resetEpisodeEmbeddingClientForTest()
    mocks.embedContent.mockReset()
    mocks.clientOptions.length = 0
  })

  it('uses the documented Gemini Embedding 2 query format and 768 dimensions', async () => {
    const vector = vector768()
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector }] })

    await expect(embedEpisodeText({ text: 'We planned a picnic.', role: 'RETRIEVAL_QUERY' })).resolves.toEqual(vector)

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

  it('uses the document prefix for episode summaries', async () => {
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector768() }] })

    await embedEpisodeText({ text: 'The group planned a picnic.', role: 'RETRIEVAL_DOCUMENT' })

    expect(mocks.embedContent.mock.calls[0]?.[0].contents).toBe('title: none | text: The group planned a picnic.')
  })

  it('passes the abort signal to the SDK request', async () => {
    const controller = new AbortController()
    mocks.embedContent.mockResolvedValue({ embeddings: [{ values: vector768() }] })

    await embedEpisodeText({ text: 'Picnic plan', role: 'RETRIEVAL_QUERY', signal: controller.signal })

    expect(mocks.embedContent.mock.calls[0]?.[0].config.abortSignal).toBe(controller.signal)
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

    await expect(embedEpisodeText({ text: 'Picnic plan', role: 'RETRIEVAL_QUERY' })).rejects.toThrow(
      'Gemini returned an invalid episode embedding'
    )
  })
})
