import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ embed: vi.fn() }))

vi.mock('../embeddings/client.js', () => ({ getEmbeddingClient: () => ({ embed: mocks.embed }) }))

import { geminiVector } from '../embeddings/__tests__/vectors.js'
import { embedEpisodeText } from '../episodeEmbeddings.js'

describe('embedEpisodeText', () => {
  it('embeds queries and documents through the configured embedding client', async () => {
    const result = geminiVector(Array(768).fill(0.25))
    mocks.embed.mockResolvedValue(result)
    const controller = new AbortController()

    await expect(
      embedEpisodeText({ text: 'Picnic plans?', role: 'RETRIEVAL_QUERY', signal: controller.signal })
    ).resolves.toBe(result)
    await embedEpisodeText({ text: 'We had a picnic.', role: 'RETRIEVAL_DOCUMENT' })

    expect(mocks.embed.mock.calls).toEqual([
      ['Picnic plans?', 'query', controller.signal],
      ['We had a picnic.', 'document', undefined]
    ])
  })
})
