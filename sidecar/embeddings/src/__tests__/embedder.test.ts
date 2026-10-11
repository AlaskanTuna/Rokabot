import { describe, expect, it, vi } from 'vitest'
import { type FeatureExtractor, createEmbedder } from '../embedder.js'

describe('createEmbedder', () => {
  it('mean-pools and L2-normalises through the pipeline, and counts tokens per text', async () => {
    const call = vi.fn(async () => ({
      tolist: () => [
        [0.6, 0.8],
        [1, 0]
      ]
    }))
    const encode = vi.fn((text: string) => Array.from({ length: text.length }, (_, index) => index))
    const extractor: FeatureExtractor = Object.assign(call, { tokenizer: { encode } })

    await expect(createEmbedder(extractor).embed(['passage: ab', 'query: c'])).resolves.toEqual({
      vectors: [
        [0.6, 0.8],
        [1, 0]
      ],
      tokenCounts: [11, 8]
    })
    expect(call).toHaveBeenCalledWith(['passage: ab', 'query: c'], { pooling: 'mean', normalize: true })
  })
})
