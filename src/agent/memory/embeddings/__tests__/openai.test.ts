import { describe, expect, it } from 'vitest'
import type { EmbeddingSettings } from '../client.js'
import { embeddingFingerprint } from '../fingerprint.js'
import { createOpenAiEmbeddingClient } from '../openai.js'
import { fakeFetch, hangingFetch, json } from './fakeFetch.js'

const vector1536 = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0))
const settings: EmbeddingSettings = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dim: 1536,
  fingerprint: embeddingFingerprint('openai', 'text-embedding-3-small', 1536),
  timeoutMs: 1500,
  sidecarUrl: 'http://embeddings:8080',
  apiKey: 'sk-test',
  backfillBatchSize: 3600,
  backfillGapMs: 1000
}

describe('OpenAI embedding client', () => {
  it('posts the text to the embeddings API and returns a vector in the OpenAI space', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ data: [{ embedding: vector1536 }] }))

    await expect(createOpenAiEmbeddingClient(settings, fetchImpl).embed('Picnic plans?', 'query')).resolves.toEqual({
      values: vector1536,
      modelId: 'text-embedding-3-small',
      dim: 1536,
      fingerprint: 'openai:text-embedding-3-small:1536:raw'
    })
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/embeddings')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'text-embedding-3-small',
      input: 'Picnic plans?',
      encoding_format: 'float'
    })
  })

  it('rejects a non-OK reply', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('slow down', { status: 429 }))

    await expect(createOpenAiEmbeddingClient(settings, fetchImpl).embed('x', 'document')).rejects.toThrow(
      'OpenAI embeddings returned HTTP 429'
    )
  })

  it.each([
    ['no data', {}],
    ['an empty data list', { data: [] }],
    ['a short vector', { data: [{ embedding: vector1536.slice(1) }] }]
  ])('rejects %s', async (_label, body) => {
    const { fetchImpl } = fakeFetch(() => json(body))

    await expect(createOpenAiEmbeddingClient(settings, fetchImpl).embed('x', 'document')).rejects.toThrow(
      'OpenAI returned an invalid embedding'
    )
  })

  it('gives up after timeoutMs', async () => {
    const { fetchImpl } = hangingFetch()

    await expect(
      createOpenAiEmbeddingClient({ ...settings, timeoutMs: 10 }, fetchImpl).embed('x', 'query')
    ).rejects.toThrow()
  })
})
