import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EMBEDDING_MODELS,
  LOCAL_EMBEDDING_MODEL,
  embeddingDimensions,
  embeddingFingerprint,
  isEmbeddingVector
} from '../fingerprint.js'

describe('embedding fingerprints', () => {
  it('names the provider, model, dimension and preprocessing', () => {
    expect(embeddingFingerprint('gemini', 'gemini-embedding-2', 768)).toBe(
      'gemini:gemini-embedding-2:768:gemini-task-prefix'
    )
    expect(embeddingFingerprint('local', LOCAL_EMBEDDING_MODEL, 384)).toBe(
      'local:Xenova/multilingual-e5-small@761b726d-q8:384:e5-prefix-mean-l2'
    )
    expect(embeddingFingerprint('openai', 'text-embedding-3-small', 1536)).toBe(
      'openai:text-embedding-3-small:1536:raw'
    )
  })

  it('defaults each provider to its tested model', () => {
    expect(DEFAULT_EMBEDDING_MODELS).toEqual({
      local: 'Xenova/multilingual-e5-small@761b726d-q8',
      gemini: 'gemini-embedding-2',
      openai: 'text-embedding-3-small'
    })
  })

  it('knows the tested dimensions and rejects untested models', () => {
    expect(embeddingDimensions('gemini', 'gemini-embedding-2')).toBe(768)
    expect(embeddingDimensions('gemini', 'gemini-embedding-001')).toBe(768)
    expect(embeddingDimensions('openai', 'text-embedding-3-small')).toBe(1536)
    expect(embeddingDimensions('openai', 'text-embedding-3-large')).toBeUndefined()
    expect(embeddingDimensions('local', LOCAL_EMBEDDING_MODEL)).toBe(384)
    expect(embeddingDimensions('local', 'Xenova/multilingual-e5-small')).toBeUndefined()
  })

  it('accepts only finite number arrays of the expected length', () => {
    expect(isEmbeddingVector([0.5, -0.5], 2)).toBe(true)
    expect(isEmbeddingVector([0.5], 2)).toBe(false)
    expect(isEmbeddingVector([0.5, Number.NaN], 2)).toBe(false)
    expect(isEmbeddingVector([0.5, '1'], 2)).toBe(false)
    expect(isEmbeddingVector(undefined, 2)).toBe(false)
  })
})
