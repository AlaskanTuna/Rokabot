import { beforeEach, describe, expect, it, vi } from 'vitest'

const logger = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../../../../utils/logger.js', () => ({ logger }))

import type { EmbeddingSettings } from '../client.js'
import { LOCAL_EMBEDDING_MODEL, embeddingFingerprint } from '../fingerprint.js'
import { createLocalEmbeddingClient } from '../local.js'
import { fakeFetch, hangingFetch, json } from './fakeFetch.js'

const vector384 = Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0))
const settings: EmbeddingSettings = {
  provider: 'local',
  model: LOCAL_EMBEDDING_MODEL,
  dim: 384,
  fingerprint: embeddingFingerprint('local', LOCAL_EMBEDDING_MODEL, 384),
  timeoutMs: 1500,
  sidecarUrl: 'http://embeddings:8080',
  apiKey: undefined,
  backfillBatchSize: 3600,
  backfillGapMs: 1000
}

function reply(overrides: Record<string, unknown> = {}): Response {
  return json({ model: LOCAL_EMBEDDING_MODEL, dim: 384, vectors: [vector384], truncated: [false], ...overrides })
}

describe('local embedding client', () => {
  beforeEach(() => logger.info.mockReset())

  it('posts one text with its role and returns a vector in the sidecar space', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply())

    await expect(createLocalEmbeddingClient(settings, fetchImpl).embed('Picnic plans?', 'query')).resolves.toEqual({
      values: vector384,
      modelId: LOCAL_EMBEDDING_MODEL,
      dim: 384,
      fingerprint: 'local:Xenova/multilingual-e5-small@761b726d-q8:384:e5-prefix-mean-l2'
    })
    expect(calls[0]?.url).toBe('http://embeddings:8080/embed')
    expect(calls[0]?.init.method).toBe('POST')
    expect((calls[0]?.init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ texts: ['Picnic plans?'], role: 'query' })
  })

  it('does not double the slash when the sidecar url ends with one', async () => {
    const { fetchImpl, calls } = fakeFetch(() => reply())

    await createLocalEmbeddingClient({ ...settings, sidecarUrl: 'http://embeddings:8080/' }, fetchImpl).embed(
      'x',
      'document'
    )

    expect(calls[0]?.url).toBe('http://embeddings:8080/embed')
  })

  it('rejects a non-OK reply', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('busy', { status: 503 }))

    await expect(createLocalEmbeddingClient(settings, fetchImpl).embed('x', 'query')).rejects.toThrow(
      'Embedding sidecar returned HTTP 503'
    )
  })

  it('rejects vectors from a model other than the configured one', async () => {
    const { fetchImpl } = fakeFetch(() => reply({ model: 'Xenova/multilingual-e5-small@00000000-q8' }))

    await expect(createLocalEmbeddingClient(settings, fetchImpl).embed('x', 'query')).rejects.toThrow(
      `Embedding sidecar serves Xenova/multilingual-e5-small@00000000-q8, but embeddings.model is ${LOCAL_EMBEDDING_MODEL}`
    )
  })

  it.each([
    ['another dimension', { dim: 768 }],
    ['no vectors', { vectors: [] }],
    ['a short vector', { vectors: [vector384.slice(1)] }],
    ['a non-numeric value', { vectors: [[null, ...vector384.slice(1)]] }]
  ])('rejects %s', async (_label, overrides) => {
    const { fetchImpl } = fakeFetch(() => reply(overrides))

    await expect(createLocalEmbeddingClient(settings, fetchImpl).embed('x', 'query')).rejects.toThrow(
      'Embedding sidecar returned an invalid embedding'
    )
  })

  it('logs a truncated input by role and length, never by text', async () => {
    const { fetchImpl } = fakeFetch(() => reply({ truncated: [true] }))

    await createLocalEmbeddingClient(settings, fetchImpl).embed('a private, very long summary', 'document')

    expect(logger.info).toHaveBeenCalledWith(
      { role: 'document', chars: 28 },
      'Embedding input was cut to the 512-token model limit'
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('private')
  })

  it('gives up when the caller aborts', async () => {
    const { fetchImpl } = hangingFetch()
    const controller = new AbortController()

    const pending = createLocalEmbeddingClient(settings, fetchImpl).embed('x', 'query', controller.signal)
    controller.abort(new Error('turn canceled'))

    await expect(pending).rejects.toThrow('turn canceled')
  })

  it('gives up after timeoutMs', async () => {
    const { fetchImpl } = hangingFetch()

    await expect(
      createLocalEmbeddingClient({ ...settings, timeoutMs: 10 }, fetchImpl).embed('x', 'query')
    ).rejects.toThrow()
  })
})
